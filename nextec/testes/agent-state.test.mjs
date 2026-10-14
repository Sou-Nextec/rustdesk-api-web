import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentState, agentContact, agentError, lastContactAt, quietFor, activeWindowSeconds, AGENT_STATE,
  LEGACY_ACTIVE_WINDOW_SECONDS,
} from '../../src/nextec/agent-state.mjs'
import { AGENT_CYCLE_SECONDS } from '../../src/nextec/agent-cycle.mjs'
import { overallSummary, machineStage, nextStep } from '../../src/nextec/secrets-flow.mjs'

const NOW = 1_800_000_000
const base = { peer_id: '536822159', group_id: 7, enrolled: true, managed: true }

const ACTIVE_WINDOW_SECONDS = LEGACY_ACTIVE_WINDOW_SECONDS

test('a tela não recalcula a janela: a janela legada (servidor antigo) é a do agente de 5 min, não o ciclo de 1 min', () => {
  assert.equal(LEGACY_ACTIVE_WINDOW_SECONDS, 900)
  assert.notEqual(LEGACY_ACTIVE_WINDOW_SECONDS, AGENT_CYCLE_SECONDS * 3)
  assert.equal(activeWindowSeconds({ active_window_seconds: 180 }), 180)
  assert.equal(activeWindowSeconds({}), 900)
})

// Achado P2 do #94: com o ciclo de 60 s a tela usava 180 s e a API 900 s. Agora o servidor decide e a tela só exibe.
test('fonte única: last_sync_at de 240 s atrás segue o agent_state da API (legado ativo, agente de 60 s parado)', () => {
  const legado = { ...base, last_sync_at: NOW - 240, agent_state: 'ativo', active_window_seconds: 900 }
  assert.equal(agentState(legado, NOW), AGENT_STATE.ACTIVE)
  assert.equal(agentContact(legado, NOW).headline, 'Agente ativo')
  const novo = { ...base, last_sync_at: NOW - 240, agent_state: 'parado', active_window_seconds: 180, sync_interval_seconds: 60 }
  assert.equal(agentState(novo, NOW), AGENT_STATE.STALLED)
  assert.match(agentContact(novo, NOW).headline, /sem contato há 4 min/)
  // agente de 60 s consultando há 20 s: ativo, como a API diz
  assert.equal(agentState({ ...base, last_sync_at: NOW - 20, agent_state: 'ativo', active_window_seconds: 180 }, NOW), AGENT_STATE.ACTIVE)
  // a tela nunca contradiz a API, mesmo que o relógio local discorde
  assert.equal(agentState({ ...base, last_sync_at: NOW - 5000, agent_state: 'ativo' }, NOW), AGENT_STATE.ACTIVE)
  assert.equal(agentState({ ...base, last_sync_at: NOW - 5, agent_state: 'parado' }, NOW), AGENT_STATE.STALLED)
})

test('aguardando a primeira consulta usa a janela da API (agente de 60 s: 3 min)', () => {
  const d = { ...base, last_sync_at: 0, last_seen_at: NOW - 30, enrolled_at: NOW - 30, agent_state: 'parado', active_window_seconds: 180 }
  const c = agentContact(d, NOW)
  assert.equal(c.waitingFirst, true)
  assert.match(c.detail, /em até 3 min/)
  assert.equal(agentContact({ ...d, enrolled_at: NOW - 200 }, NOW).waitingFirst, false)
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

test('último erro do agente vira mensagem clara com a ação sugerida', () => {
  assert.equal(agentError({ ...base, last_error: '' }), null)
  assert.equal(agentError(base), null)
  const e = agentError({ ...base, last_error: 'client_settings_locked', last_error_at: NOW })
  assert.match(e.text, /^A troca de senha está falhando: /)
  assert.equal(e.action, 'Gere o instalador de novo e instale por cima.')
  assert.match(agentError({ last_error: 'exe_not_found' }).text, /não encontrou o app/)
  assert.match(agentError({ last_error: 'password_apply_failed' }).text, /recusou aplicar/)
  const x = agentError({ last_error: 'algo_novo' })
  assert.match(x.text, /algo_novo/)
  assert.match(x.action, /Nextec\\Acesso/)
})

test('tempo sem contato legível', () => {
  assert.equal(quietFor(10), 'menos de 1 min')
  assert.equal(quietFor(61), '1 min')
  assert.equal(quietFor(3600 * 5), '5 h')
  assert.equal(quietFor(3600 * 72), '3 dias')
})
