import test from 'node:test'
import assert from 'node:assert/strict'
import { ruleOf, ruleBadge, ruleChange, ruleChoice, followText, groupUsage, everyText, originText } from '../../src/nextec/secret-rule.mjs'

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

test('sem a lista de grupos só vale o grupo exato (cálculo antigo)', () => {
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

test('a contagem usa o inventário completo: grupo com regra desligada ainda tem as máquinas que o seguem', () => {
  const off = { kind: 'group', ref: '9', enabled: false, interval_minutes: 60 }
  const inventario = [{ peer_id: 'x1', group_id: 9 }, { peer_id: 'x2', group_id: 9 }, { peer_id: 'x3', group_id: 9 }]
  const p = [...policies, off, { kind: 'peer', ref: 'x3', enabled: true, interval_minutes: 15 }]
  assert.deepEqual(groupUsage(off, inventario, p), { follow: 2, own: 1, total: 3 })
  // o resumo do servidor omite essas máquinas: sozinho ele subconta
  assert.equal(groupUsage(off, [], p).total, 0)
})

test('intervalo em texto', () => {
  assert.equal(everyText(15), '15 min')
  assert.equal(everyText(60), 'hora')
  assert.equal(everyText(180), '3 h')
  assert.equal(everyText(0), '')
})

// ---------- herança (item 3): máquina > subgrupo > cliente > global ----------
const tree = [
  { id: 1, name: 'Cliente A', parent_id: 0, path: 'Cliente A' },
  { id: 2, name: 'Cliente A / Filial', parent_id: 1, path: 'Cliente A / Filial' },
  { id: 3, name: 'Cliente A / Filial / Caixa', parent_id: 2, path: 'Cliente A / Filial / Caixa' },
  { id: 4, name: 'Cliente B', parent_id: 0, path: 'Cliente B' },
]
const rule = (kind, ref, enabled, interval_minutes, extra = {}) => ({ kind, ref, enabled, interval_minutes, ...extra })

test('subgrupo e sub-subgrupo herdam a regra do cliente e o selo diz de onde', () => {
  const p = [rule('group', '1', true, 60)]
  const r = ruleOf(dev('9', 3), p, tree)
  assert.equal(r.source, 'client')
  assert.equal(r.inheritedFrom, 'Cliente A')
  assert.deepEqual(ruleBadge(r), { tone: 'client', title: 'Herdada', detail: 'troca a cada hora (herdada de Cliente A)' })
  assert.equal(ruleBadge(ruleOf(dev('9', 1), p, tree)).title, 'Do cliente')
})

test('a regra do subgrupo vence a do cliente; a do dispositivo vence tudo', () => {
  const p = [rule('group', '1', true, 60), rule('group', '2', true, 30), rule('peer', '9', true, 15)]
  assert.equal(ruleOf(dev('8', 3), p, tree).interval, 30)
  assert.equal(ruleOf(dev('8', 3), p, tree).inheritedFrom, 'Cliente A / Filial')
  assert.equal(ruleOf(dev('9', 3), p, tree).source, 'machine')
})

test('subgrupo desligado encerra a busca, como no servidor', () => {
  const p = [rule('group', '1', true, 60), rule('group', '2', false, 60)]
  const r = ruleOf(dev('8', 3), p, tree)
  assert.equal(r.enabled, false)
  assert.equal(ruleBadge(r).detail, 'regra desligada em Cliente A / Filial')
})

test('a regra global vale para quem não tem regra mais próxima, com ou sem cliente', () => {
  const p = [rule('global', 'global', true, 240), rule('group', '1', true, 60)]
  assert.equal(ruleOf(dev('8', 4), p, tree).source, 'global')
  assert.equal(ruleOf(dev('8', 0), p, tree).source, 'global')
  assert.equal(ruleOf(dev('8', 1), p, tree).source, 'client')
  assert.deepEqual(ruleBadge(ruleOf(dev('8', 4), p, tree)), { tone: 'global', title: 'Global', detail: 'troca a cada 4 h, todas as máquinas' })
  assert.equal(followText(ruleOf(dev('8', 4), p, tree), 'Cliente B'), 'Segue a regra global: troca a cada 4 h.')
})

test('quando o servidor informa a origem, ela manda', () => {
  const p = [rule('group', '1', true, 60), rule('group', '2', true, 30)]
  const d = { peer_id: '8', group_id: 3, rule_origin: 'group', rule_origin_group: 1 }
  assert.equal(ruleOf(d, p, tree).interval, 60) // o servidor disse Cliente A
  assert.equal(ruleOf({ peer_id: '8', group_id: 3, rule_origin: 'none' }, p, tree).source, 'none')
})

test('textos de origem', () => {
  assert.equal(originText('peer'), 'própria desta máquina')
  assert.equal(originText('global'), 'global (todas as máquinas)')
  assert.equal(originText('group', 'Cliente A', 1, 1), 'do grupo Cliente A')
  assert.equal(originText('group', 'Cliente A', 1, 3), 'herdada de Cliente A')
  assert.equal(originText('none'), 'sem regra')
})
