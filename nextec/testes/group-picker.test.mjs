import test from 'node:test'
import assert from 'node:assert/strict'
import { chainOf, clientsOf, subsOf, pickOf, groupIdOf, keepSub, describe } from '../../src/nextec/group-picker.mjs'

const groups = [
  { id: 1, name: 'Cliente A', parent_id: 0, path: 'Cliente A' },
  { id: 2, name: 'Cliente A / Filial', parent_id: 1, path: 'Cliente A / Filial' },
  { id: 3, name: 'Cliente A / Loja', parent_id: 1, path: 'Cliente A / Loja' },
  { id: 4, name: 'Cliente A / Filial / Caixa', parent_id: 2, path: 'Cliente A / Filial / Caixa' },
  { id: 5, name: 'Cliente B', parent_id: 0, path: 'Cliente B' },
]

test('clientes são só os grupos sem pai, em ordem alfabética', () => {
  assert.deepEqual(clientsOf(groups), [{ value: 1, label: 'Cliente A' }, { value: 5, label: 'Cliente B' }])
})

test('subgrupos do cliente incluem todos os níveis e usam o caminho sem o cliente', () => {
  assert.deepEqual(subsOf(groups, 1), [{ value: 2, label: 'Filial' }, { value: 4, label: 'Filial / Caixa' }, { value: 3, label: 'Loja' }])
  assert.deepEqual(subsOf(groups, 5), [])
  assert.deepEqual(subsOf(groups, 0), [])
})

test('do grupo do dispositivo para cliente e subgrupo e de volta', () => {
  assert.deepEqual(pickOf(groups, 0), { client: 0, sub: 0 })
  assert.deepEqual(pickOf(groups, 1), { client: 1, sub: 0 })
  assert.deepEqual(pickOf(groups, 2), { client: 1, sub: 2 })
  assert.deepEqual(pickOf(groups, 4), { client: 1, sub: 4 })
  for (const id of [0, 1, 2, 3, 4, 5]) {
    const p = pickOf(groups, id)
    assert.equal(groupIdOf(p.client, p.sub), id)
  }
})

test('raiz do cliente grava o próprio cliente; sem cliente grava 0', () => {
  assert.equal(groupIdOf(1, 0), 1)
  assert.equal(groupIdOf(0, 0), 0)
  assert.equal(groupIdOf(null, null), 0)
})

test('trocar o cliente zera o subgrupo que não pertence ao novo cliente', () => {
  assert.equal(keepSub(groups, 1, 2), 2)
  assert.equal(keepSub(groups, 5, 2), 0)
  assert.equal(keepSub(groups, 1, 0), 0)
  assert.equal(keepSub(groups, 1, 1), 0)
})

test('ciclo de pai e grupo que não existe não travam', () => {
  const loop = [{ id: 1, name: 'X', parent_id: 2 }, { id: 2, name: 'Y', parent_id: 1 }]
  assert.ok(chainOf(loop, 1).length <= 2)
  assert.deepEqual(chainOf(groups, 99), [])
  assert.equal(describe(groups, 4), 'Cliente A / Filial / Caixa')
  assert.equal(describe(groups, 99), '')
  assert.deepEqual(pickOf([], 3), { client: 0, sub: 0 })
})
