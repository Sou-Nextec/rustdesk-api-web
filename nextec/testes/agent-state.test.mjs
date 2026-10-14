import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentState, agentContact, lastContactAt, quietFor, AGENT_STATE, ACTIVE_WINDOW_SECONDS, ACTIVE_CYCLES,
} from '../../src/nextec/agent-state.mjs'
import { AGENT_CYCLE_SECONDS } from '../../src/nextec/agent-cycle.mjs'
import { overallSummary, machineStage, nextStep } from '../../src/nextec/secrets-flow.mjs'

const NOW = 1_800_000_000
const base = { peer_id: '536822159', group_id: 7, enrolled: true, managed: true }

test('a janela de "ativo" são 3 ciclos do intervalo constante do agente', () => {
  assert.equal(ACTIVE_CYCLES, 3)
  assert.equal(ACTIVE_WINDOW_SECONDS, AGENT_CYCLE_SECONDS * 3)
})

test('cadastro sem consulta é parado, mesmo com last_seen_at de agora (o caso real do servidor sem agente)', () => {
  const d = { ...base, last_seen_at: NOW - 30, last_sync_at: 0, enrolled_at: NOW - 30 }
  assert.equal(agentState(d, NOW), AGENT_STATE.STALLED)
  assert.equal(machineStage(d, NOW), 'agent')
  assert.equal(nextStep(d, NOW).action, 'reinstall-agent')
  const c = agentContact(d, NOW)
  assert.equal(c.waitingFirst, true, 'logo depois do cadastro a primeira consulta ainda é esperada')
  assert.match(c.headline, /aguardando a primeira consulta/)
})

test('sem consulta há muito tempo após o cadastro: nunca consultou', () => {
  const d = { ...base, last_seen_at: NOW - 7200, last_sync_at: 0, enrolled_at: NOW - 7200 }
  const c = agentContact(d, NOW)
  assert.equal(c.state, 'parado')
  assert.equal(c.waitingFirst, false)
  assert.equal(c.headline, 'Agente cadastrado, mas nunca consultou o painel.')
  assert.equal(c.detail, 'Reinstale o agente.')
})

test('consulta real recente é ativo; consulta antiga é parado com o tempo sem contato', () => {
  const ativo = { ...base, last_sync_at: NOW - 60 }
  assert.equal(agentState(ativo, NOW), AGENT_STATE.ACTIVE)
  assert.equal(agentContact(ativo, NOW).headline, 'Agente ativo')
  assert.match(agentContact(ativo, NOW).detail, /última consulta há 1 min/)
  const borda = { ...base, last_sync_at: NOW - ACTIVE_WINDOW_SECONDS + 1 }
  assert.equal(agentState(borda, NOW), AGENT_STATE.ACTIVE)
  const velho = { ...base, last_sync_at: NOW - ACTIVE_WINDOW_SECONDS - 1 }
  assert.equal(agentState(velho, NOW), AGENT_STATE.STALLED)
  const c = agentContact({ ...base, last_sync_at: NOW - 42 * 60 }, NOW)
  assert.equal(c.headline, 'Agente cadastrado, mas sem contato há 42 min.')
  assert.equal(c.detail, 'Reinstale o agente.')
})

test('pendente de aprovação e sem agente', () => {
  assert.equal(agentState({ ...base, state: 'pending', last_sync_at: NOW }, NOW), AGENT_STATE.PENDING)
  assert.equal(agentState({ peer_id: '1', group_id: 7, enrolled: false }, NOW), AGENT_STATE.NONE)
  assert.equal(agentState(null, NOW), AGENT_STATE.NONE)
  assert.equal(agentContact({ enrolled: false }, NOW).headline, 'Agente não cadastrado')
})

test('servidor sem last_sync_at: agent_state do servidor vale; sem ele cai em last_seen_at', () => {
  assert.equal(agentState({ ...base, agent_state: 'ativo' }, NOW), AGENT_STATE.ACTIVE)
  assert.equal(agentState({ ...base, agent_state: 'parado', last_seen_at: NOW }, NOW), AGENT_STATE.STALLED)
  assert.equal(agentState({ ...base, last_seen_at: NOW - 10 }, NOW), AGENT_STATE.ACTIVE)
  assert.equal(lastContactAt({ last_seen_at: NOW - 5 }), NOW - 5)
  assert.equal(lastContactAt({ last_sync_at: 0, last_seen_at: NOW - 5 }), 0, 'last_sync_at 0 não cai em last_seen_at')
})

test('o resumo conta agentes parados e leva ao Reinstalar; nunca diz Tudo pronto sem sync real', () => {
  const parado = { ...base, peer_id: '2', last_sync_at: 0, last_seen_at: NOW }
  const ativo = { ...base, peer_id: '3', last_sync_at: NOW - 10 }
  const s = overallSummary([parado, ativo], NOW)
  assert.equal(s.stalled, 1)
  assert.equal(s.cta.action, 'reinstall-agent')
  assert.match(s.text, /1 máquina com agente parado/)
  assert.doesNotMatch(overallSummary([parado], NOW).text, /Tudo pronto/)
  assert.match(overallSummary([ativo], NOW).text, /Tudo pronto/)
})

test('tempo sem contato legível', () => {
  assert.equal(quietFor(10), 'menos de 1 min')
  assert.equal(quietFor(61), '1 min')
  assert.equal(quietFor(3600 * 5), '5 h')
  assert.equal(quietFor(3600 * 72), '3 dias')
})
