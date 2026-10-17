import test from 'node:test'
import assert from 'node:assert/strict'
import { clientOptions, subOptions, matchesClient, matchesSub, splitGroupName, clientRootOf } from '../../src/nextec/client-groups.mjs'

const groups = [
  { id: 1, name: 'Cartório Adriana Celiac' },
  { id: 2, name: 'Cartório Adriana Celiac / Servidores' },
  { id: 3, name: 'Cartório Adriana Celiac / Estações' },
  { id: 4, name: 'Advocacia Martins' },
  { id: 5, name: 'DTV' },
  { id: 6, name: 'Filial Norte / Servidores' },
]
const nameOf = id => groups.find(g => g.id === id)?.name || ''
const devices = [
  { id: 'a', group_id: 1 }, { id: 'b', group_id: 2 }, { id: 'c', group_id: 2 }, { id: 'd', group_id: 3 },
  { id: 'e', group_id: 4 }, { id: 'f', group_id: 0 }, { id: 'g', group_id: 6 },
]

test('split separa cliente e subgrupo', () => {
  assert.deepEqual(splitGroupName('A / B'), { client: 'A', sub: 'B' })
  assert.deepEqual(splitGroupName('A / B / C'), { client: 'A', sub: 'B / C' })
  assert.deepEqual(splitGroupName('Só cliente'), { client: 'Só cliente', sub: '' })
  assert.deepEqual(splitGroupName(''), { client: '', sub: '' })
})

test('o filtro de cliente lista só clientes, em ordem, e não os subgrupos', () => {
  const labels = clientOptions(groups).map(o => o.label)
  assert.deepEqual(labels, ['Advocacia Martins', 'Cartório Adriana Celiac', 'DTV', 'Filial Norte'])
  assert.ok(!labels.some(l => l.includes(' / ')))
})

test('subgrupo sem o cliente cadastrado vira um cliente virtual, para nunca sumir do filtro', () => {
  const orphan = clientOptions(groups).find(o => o.label === 'Filial Norte')
  assert.equal(orphan.value, 'n:Filial Norte')
  assert.equal(clientRootOf(orphan.value, nameOf), 'Filial Norte')
  assert.ok(devices.filter(d => matchesClient(d.group_id, orphan.value, nameOf)).every(d => d.id === 'g'))
})

test('filtrar pelo cliente inclui o próprio cliente e todos os subgrupos dele', () => {
  const got = devices.filter(d => matchesClient(d.group_id, 1, nameOf)).map(d => d.id)
  assert.deepEqual(got, ['a', 'b', 'c', 'd'])
})

test('selecionar o cliente nunca esvazia a lista quando o dispositivo está num subgrupo', () => {
  // regressão do print: o filtro pelo nome do subgrupo mostrava 0 de 3
  assert.ok(devices.filter(d => matchesClient(d.group_id, 1, nameOf)).length >= 3)
})

test('Sem cliente pega só os dispositivos sem grupo', () => {
  assert.deepEqual(devices.filter(d => matchesClient(d.group_id, 0, nameOf)).map(d => d.id), ['f'])
})

test('sem filtro tudo passa', () => {
  assert.equal(devices.filter(d => matchesClient(d.group_id, null, nameOf)).length, devices.length)
})

test('subgrupos do cliente escolhido, com contagem', () => {
  const subs = subOptions(groups, 1, nameOf, devices)
  assert.deepEqual(subs.map(s => [s.label, s.count]), [['Estações', 1], ['Servidores', 2]])
  assert.deepEqual(subOptions(groups, 4, nameOf, devices), [])
  assert.deepEqual(subOptions(groups, 0, nameOf, devices), [])
  assert.deepEqual(subOptions(groups, null, nameOf, devices), [])
})

test('o filtro de subgrupo refina dentro do cliente', () => {
  const inClient = devices.filter(d => matchesClient(d.group_id, 1, nameOf))
  assert.deepEqual(inClient.filter(d => matchesSub(d.group_id, 2, nameOf)).map(d => d.id), ['b', 'c'])
  assert.deepEqual(inClient.filter(d => matchesSub(d.group_id, 'none', nameOf)).map(d => d.id), ['a'])
  assert.equal(inClient.filter(d => matchesSub(d.group_id, null, nameOf)).length, 4)
})

test('subgrupo com níveis abaixo inclui os níveis', () => {
  const deep = [...groups, { id: 7, name: 'Cartório Adriana Celiac / Servidores / Banco' }]
  const of = id => deep.find(g => g.id === id)?.name || ''
  assert.equal(matchesSub(7, 2, of), true)
  assert.equal(matchesSub(2, 7, of), false)
})
