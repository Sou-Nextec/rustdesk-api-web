import test from 'node:test'
import assert from 'node:assert/strict'
import {
  machineStage, machineSteps, nextStep, overallSummary, firstNeeding, agentOptions, filterClients, findClientByName,
  newClientName, movePayload, defaultAssignRule, afterClientStep, NEEDS_CLIENT_NOTICE, AGENT_EMPTY_NOTICE,
} from '../../src/nextec/secrets-flow.mjs'

const semCliente = { peer_id: '536822159', alias: 'servidor', group_id: 0, enrolled: false, managed: false }
const pendente = { peer_id: '111111111', state: 'pending', group_id: 0, enrolled: true }
const semAgente = { peer_id: '222222222', group_id: 7, enrolled: false, managed: false }
const AGORA = Date.now() / 1000
const semRegra = { peer_id: '333333333', group_id: 7, enrolled: true, managed: false, last_sync_at: AGORA - 20 }
const pronta = { peer_id: '444444444', group_id: 7, enrolled: true, managed: true, has_password: true, last_sync_at: AGORA - 20 }
const parada = { peer_id: '555555555', group_id: 7, enrolled: true, managed: true, has_password: true, last_seen_at: AGORA - 5, last_sync_at: 0 }

test('cada estado cai na etapa certa', () => {
  assert.equal(machineStage(semCliente), 'client')
  assert.equal(machineStage(pendente), 'client')
  assert.equal(machineStage({ ...pendente, group_id: 7 }), 'client', 'pendente continua precisando de aprovação')
  assert.equal(machineStage(semAgente), 'agent')
  assert.equal(machineStage(semRegra), 'rule')
  assert.equal(machineStage(pronta), 'ready')
  assert.equal(machineStage(), 'client')
  assert.equal(machineStage({ group_id: '7', enrolled: true, managed: true, last_sync_at: AGORA }), 'ready', 'group_id como texto')
  assert.equal(machineStage(parada), 'agent', 'cadastro sem consulta real não é pronto')
  assert.equal(machineStage({ ...pronta, last_sync_at: AGORA - 3600 }), 'agent', 'consulta antiga volta à etapa 2')
  assert.equal(machineStage({ group_id: null }), 'client')
})

test('um único botão primário por estado, com o rótulo combinado', () => {
  assert.deepEqual([semCliente, semAgente, semRegra, pronta].map(d => nextStep(d).label),
    ['Escolher cliente', 'Instalar agente', 'Ligar senha automática', 'Conectar'])
  assert.deepEqual([semCliente, semAgente, semRegra, pronta].map(d => nextStep(d).action),
    ['choose-client', 'install-agent', 'enable-rule', 'connect'])
  assert.equal(nextStep(pronta).secondary.label, 'Trocar agora')
  assert.equal(nextStep(pronta).secondary.action, 'rotate')
  assert.equal(nextStep(semAgente).secondary, null)
})

test('o stepper marca concluído, atual e pendente e legenda a etapa atual', () => {
  const st = d => machineSteps(d).steps.map(s => s.status)
  assert.deepEqual(st(semCliente), ['current', 'todo', 'todo'])
  assert.deepEqual(st(semAgente), ['done', 'current', 'todo'])
  assert.deepEqual(st(semRegra), ['done', 'done', 'current'])
  assert.deepEqual(st(pronta), ['done', 'done', 'done'])
  assert.equal(machineSteps(semAgente).caption, 'Etapa 2 de 3: Agente')
  assert.equal(machineSteps(pronta).caption, 'Tudo pronto')
  assert.deepEqual(machineSteps(semRegra).steps.map(s => s.label), ['Cliente', 'Agente', 'Senha automática'])
})

test('o CTA do topo segue a prioridade cliente, agente, regra e pronto', () => {
  const s0 = overallSummary([])
  assert.equal(s0.cta.action, 'show-key')
  assert.match(s0.text, /Nenhuma máquina ainda/)
  const s1 = overallSummary([semCliente, pendente, semAgente, pronta])
  assert.equal(s1.text, 'Você tem 2 máquinas sem cliente.')
  assert.equal(s1.cta.label, 'Escolher cliente')
  assert.deepEqual(s1.counts, { client: 2, agent: 1, rule: 0, ready: 1 })
  assert.equal(overallSummary([semCliente]).text, 'Você tem 1 máquina sem cliente.')
  assert.equal(overallSummary([semAgente, pronta]).cta.action, 'install-agent')
  assert.equal(overallSummary([semRegra, pronta]).cta.action, 'enable-rule')
  const ok = overallSummary([pronta, pronta])
  assert.equal(ok.cta, null)
  assert.match(ok.text, /Tudo pronto/)
  assert.equal(overallSummary([null, 'x', pronta]).total, 1)
})

test('firstNeeding devolve a primeira máquina da etapa', () => {
  assert.equal(firstNeeding([pronta, semAgente, semCliente], 'client'), semCliente)
  assert.equal(firstNeeding([pronta], 'client'), null)
})

test('Autorização individual lista todas, sem cliente primeiro e com selo', () => {
  const o = agentOptions([pronta, semAgente, semCliente, pendente, null, { alias: 'sem id' }])
  assert.equal(o.length, 4)
  assert.deepEqual(o.slice(0, 2).map(x => x.badge), ['sem cliente', 'sem cliente'])
  assert.ok(o.slice(0, 2).every(x => x.needsClient && !x.canAuthorize))
  const ok = o.find(x => x.peer_id === '222222222')
  assert.equal(ok.canAuthorize, true)
  assert.equal(ok.badge, '')
  const ativo = o.find(x => x.peer_id === '444444444')
  assert.equal(ativo.badge, 'agente ativo')
  assert.equal(ativo.canAuthorize, false, 'agente ativo não precisa de novo arquivo')
  assert.match(ativo.notice, /ativo e consultando o painel/)
  const par = agentOptions([parada])[0]
  assert.equal(par.badge, 'agente parado')
  assert.equal(par.canAuthorize, true)
  assert.equal(par.agentStalled, true)
  assert.deepEqual(agentOptions([]), [])
  assert.match(NEEDS_CLIENT_NOTICE, /Escolha o cliente/)
  assert.match(AGENT_EMPTY_NOTICE, /aguarde 1 minuto/)
})

test('busca de cliente ignora acento e caixa; criar recusa nome curto, longo e repetido', () => {
  const groups = [{ id: 1, name: 'Cobraq' }, { id: 2, name: 'Clínica São José' }, { id: 3, name: 'Nextec' }]
  assert.deepEqual(filterClients(groups, 'sao jose').map(g => g.id), [2])
  assert.equal(filterClients(groups, '').length, 3)
  assert.equal(filterClients(groups, 'zzz').length, 0)
  assert.equal(findClientByName(groups, ' COBRAQ ').id, 1)
  assert.equal(newClientName('a', groups).ok, false)
  assert.equal(newClientName('x'.repeat(61), groups).ok, false)
  const dup = newClientName('clinica sao jose', groups)
  assert.equal(dup.ok, false)
  assert.equal(dup.existing.id, 2)
  assert.deepEqual(newClientName('  Novo   Cliente ', groups), { ok: true, name: 'Novo Cliente', error: '' })
})

test('mover para o cliente envia o cadastro completo e exige row_id e cliente válido', () => {
  const row = { row_id: 9, id: '536822159', alias: 'servidor', hostname: 'SRV', os: 'Windows', uuid: 'u', extra: 'x' }
  assert.deepEqual(movePayload(row, 7), {
    row_id: 9, group_id: 7, id: '536822159', alias: 'servidor', username: '', hostname: 'SRV', os: 'Windows', version: '', cpu: '', memory: '', uuid: 'u',
  })
  assert.equal(movePayload({ id: '1' }, 7), null)
  assert.equal(movePayload(row, 0), null)
  assert.equal(movePayload(null, 7), null)
})

test('transições: depois de vincular o cliente a máquina segue para a próxima etapa', () => {
  assert.equal(defaultAssignRule(true), 'group')
  assert.equal(defaultAssignRule(false), 'group-enable')
  assert.equal(afterClientStep({ ...semCliente, group_id: 7 }).action, 'install-agent')
  assert.equal(afterClientStep({ ...semAgente, enrolled: true, last_sync_at: AGORA }).action, 'enable-rule')
  assert.equal(afterClientStep({ ...semAgente, enrolled: true, last_sync_at: 0 }).action, 'reinstall-agent')
  assert.equal(afterClientStep({ ...semRegra, managed: true }).action, 'connect')
  assert.equal(afterClientStep(semCliente).action, 'stay')
  let d = { ...semCliente }
  const seq = [machineStage(d)]
  d = { ...d, group_id: 7 }; seq.push(machineStage(d))
  d = { ...d, enrolled: true, last_sync_at: AGORA }; seq.push(machineStage(d))
  d = { ...d, managed: true }; seq.push(machineStage(d))
  assert.deepEqual(seq, ['client', 'agent', 'rule', 'ready'])
})

test('máquina offline: botão de espera, resumo próprio e fora do "reinstalar"', async () => {
  const { nextStep, overallSummary, firstNeeding } = await import('../../src/nextec/secrets-flow.mjs')
  const now = 1_800_000_000
  const mk = (peer, online) => ({ peer_id: peer, group_id: 4, enrolled: true, state: 'assigned', agent_state: 'parado', last_sync_at: now - 2460, peer_last_online: online })
  const offline = mk('215969168', now - 2100)
  const online = mk('111111111', now - 10)
  assert.equal(nextStep(offline, now).action, 'wait-machine')
  assert.equal(nextStep(online, now).action, 'reinstall-agent')
  const s = overallSummary([offline], now)
  assert.equal(s.offline, 1)
  assert.equal(s.stalled, 0)
  assert.equal(s.cta, null)
  assert.match(s.text, /offline/)
  assert.equal(firstNeeding([offline, online], 'stalled', now).peer_id, '111111111')
})
