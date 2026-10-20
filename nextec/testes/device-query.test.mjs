import test from 'node:test'
import assert from 'node:assert/strict'
import { deviceQueryParams, treeRows, treeSelection, treeActive, PAGE_MAX } from '../../src/nextec/device-query.mjs'

test('sem filtro: só página, tamanho e ordem', () => {
  assert.deepEqual(deviceQueryParams({}), { page: 1, page_size: 20, sort: 'online' })
})

test('cliente, subgrupo e sem cliente', () => {
  assert.deepEqual(deviceQueryParams({ client: 7 }), { page: 1, page_size: 20, sort: 'online', client_id: 7 })
  assert.equal(deviceQueryParams({ client: 7, sub: 'none' }).sub_id, 7)
  assert.equal(deviceQueryParams({ client: 7, sub: 'none' }).client_id, undefined)
  assert.equal(deviceQueryParams({ client: 7, sub: 9 }).client_id, 9)
  assert.equal(deviceQueryParams({ client: 0 }).no_client, 1)
  assert.equal(deviceQueryParams({ client: null, sub: null }).client_id, undefined)
})

test('busca, situação e favoritos', () => {
  const p = deviceQueryParams({ q: '  caixa ', status: 'online', sort: 'name', page: 3, pageSize: 50 })
  assert.deepEqual(p, { page: 3, page_size: 50, sort: 'name', q: 'caixa', status: 'online' })
  assert.equal(deviceQueryParams({ status: 'fav', favorites: [{ id: '123 456' }, { id: '789' }] }).ids, '123456,789')
  assert.equal(deviceQueryParams({ status: 'fav', favorites: [] }).ids, '-')
  assert.equal(deviceQueryParams({ status: 'fav', favorites: [] }).status, undefined)
})

test('página e tamanho ficam em limites seguros', () => {
  assert.equal(deviceQueryParams({ page: 0 }).page, 1)
  assert.equal(deviceQueryParams({ pageSize: 99999 }).page_size, PAGE_MAX)
  assert.equal(deviceQueryParams({ pageSize: 'x' }).page_size, 20)
})

const nodes = [
  { group_id: 2, parent_id: 0, name: 'Beta', total: 1 },
  { group_id: 1, parent_id: 0, name: 'Acme', total: 5 },
  { group_id: 3, parent_id: 1, name: 'Acme / Filial', total: 3 },
  { group_id: 4, parent_id: 3, name: 'Acme / Filial / Caixa', total: 1 },
]

test('árvore: cliente, subgrupos e níveis abaixo, com recuo e rótulo curto', () => {
  const rows = treeRows(nodes)
  assert.deepEqual(rows.map(r => [r.group_id, r.depth, r.label, r.kids]), [[1, 0, 'Acme', 1], [3, 1, 'Filial', 1], [4, 2, 'Caixa', 0], [2, 0, 'Beta', 0]])
  assert.equal(rows[2].root, 1)
})

test('árvore: ciclo e entrada inválida não quebram', () => {
  assert.deepEqual(treeRows(null), [])
  const loop = [{ group_id: 1, parent_id: 2, name: 'A' }, { group_id: 2, parent_id: 1, name: 'B' }]
  assert.deepEqual(treeRows(loop), [])
})

test('clique na árvore vira filtro e a linha marcada acompanha', () => {
  const rows = treeRows(nodes)
  assert.deepEqual(treeSelection(rows[0]), { client: 1, sub: null })
  assert.deepEqual(treeSelection(rows[2]), { client: 1, sub: 4 })
  assert.deepEqual(treeSelection({ kind: 'none' }), { client: 0, sub: null })
  assert.deepEqual(treeSelection({ kind: 'all' }), { client: null, sub: null })
  assert.equal(treeActive(rows[0], 1, null), true)
  assert.equal(treeActive(rows[0], 1, 3), false)
  assert.equal(treeActive(rows[1], 1, 3), true)
  assert.equal(treeActive({ kind: 'all' }, null, null), true)
  assert.equal(treeActive({ kind: 'none' }, 0, null), true)
})
