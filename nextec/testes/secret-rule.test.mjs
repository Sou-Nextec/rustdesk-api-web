import test from 'node:test'
import assert from 'node:assert/strict'
import { ruleOf, ruleBadge, ruleChange, ruleChoice, followText, groupUsage, everyText } from '../../src/nextec/secret-rule.mjs'

// dados reais de produção (15/10/2026), sem segredos
const policies = [
  { kind: 'group', ref: '1', enabled: true, interval_minutes: 15 },
  { kind: 'group', ref: '2', enabled: true, interval_minutes: 15 },
  { kind: 'group', ref: '4', enabled: true, interval_minutes: 15 },
  { kind: 'peer', ref: '1223489525', enabled: true, interval_minutes: 180 },
  { kind: 'peer', ref: '335416907', enabled: true, interval_minutes: 180 },
  { kind: 'peer', ref: '536822159', enabled: true, interval_minutes: 15 },
]
const dev = (peer_id, group_id) => ({ peer_id, group_id, state: 'ok' })

test('a regra da máquina vence a do cliente', () => {
  const r = ruleOf(dev('335416907', 11), policies)
  assert.equal(r.source, 'machine')
  assert.equal(r.interval, 180)
  assert.deepEqual(ruleBadge(r), { tone: 'machine', title: 'Da máquina', detail: 'troca a cada 3 h' })
})

test('sem regra própria vale a do grupo exato da máquina', () => {
  const r = ruleOf(dev('215969168', 2), policies)
  assert.equal(r.source, 'client')
  assert.equal(ruleBadge(r).title, 'Do cliente')
  assert.equal(ruleBadge(r).detail, 'troca a cada 15 min')
})

test('subgrupo não herda a regra do cliente (igual ao servidor)', () => {
  const r = ruleOf(dev('999000111', 11), policies)
  assert.equal(r.source, 'none')
  assert.equal(ruleBadge(r).title, 'Sem regra')
})

test('regra da máquina desligada vence a do cliente e avisa que o cliente tem regra', () => {
  const p = [...policies, { kind: 'peer', ref: '555', enabled: false, interval_minutes: 60 }]
  const r = ruleOf(dev('555', 1), p)
  assert.equal(r.source, 'machine')
  assert.equal(r.enabled, false)
  assert.deepEqual(ruleBadge(r), { tone: 'off', title: 'Desligada', detail: 'nesta máquina (o cliente tem regra)' })
})

test('regra do cliente desligada aparece como desligada', () => {
  const p = [{ kind: 'group', ref: '3', enabled: false, interval_minutes: 60 }]
  assert.equal(ruleBadge(ruleOf(dev('1', 3), p)).detail, 'regra do cliente desligada')
})

test('máquina sem cliente e sem regra', () => {
  assert.equal(ruleOf(dev('42', 0), policies).source, 'none')
  assert.equal(ruleOf(dev('42', null), policies).source, 'none')
})

test('as escolhas da janela viram as chamadas certas', () => {
  assert.deepEqual(ruleChange('123', 'client', 60), { kind: 'peer', ref: '123', remove: true })
  assert.deepEqual(ruleChange('123', 'machine', 60), { kind: 'peer', ref: '123', enabled: true, interval_minutes: 60 })
  assert.deepEqual(ruleChange('123', 'off', 0), { kind: 'peer', ref: '123', enabled: false, interval_minutes: 180 })
})

test('a janela abre na escolha que vale hoje', () => {
  assert.equal(ruleChoice(ruleOf(dev('335416907', 11), policies)), 'machine')
  assert.equal(ruleChoice(ruleOf(dev('215969168', 2), policies)), 'client')
  assert.equal(ruleChoice(ruleOf(dev('555', 1), [...policies, { kind: 'peer', ref: '555', enabled: false, interval_minutes: 60 }])), 'off')
})

test('seguir o cliente explica o que acontece', () => {
  assert.match(followText(ruleOf(dev('215969168', 2), policies), 'Cartório Mariinha Noronha'), /Troca a cada 15 min, como as outras máquinas de Cartório Mariinha Noronha/)
  assert.match(followText(ruleOf(dev('999000111', 11), policies), 'Cartório Adriana Celiac / Servidores'), /não tem regra ligada: a senha não troca/)
  assert.match(followText(ruleOf(dev('42', 0), policies), ''), /ainda não tem cliente/)
})

test('regras dos clientes mostram quantas máquinas seguem e quantas têm regra própria', () => {
  const devices = [dev('a', 1), dev('b', 1), dev('1223489525', 1), { peer_id: 'p', group_id: 1, state: 'pending' }]
  assert.deepEqual(groupUsage(policies[0], devices, policies), { follow: 2, own: 1, total: 3 })
  assert.deepEqual(groupUsage(policies[2], devices, policies), { follow: 0, own: 0, total: 0 })
})

test('intervalo em texto', () => {
  assert.equal(everyText(15), '15 min')
  assert.equal(everyText(60), 'hora')
  assert.equal(everyText(180), '3 h')
  assert.equal(everyText(0), '')
})
