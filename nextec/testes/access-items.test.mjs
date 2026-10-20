import test from 'node:test'
import assert from 'node:assert/strict'
import { ruleText, originText, splitItems, grantPayload, removableOnUser, filterUsers } from '../../src/nextec/access-items.mjs'

test('nível e origem em português', () => {
  assert.equal(ruleText(1), 'Somente ver')
  assert.equal(ruleText(2), 'Controle total')
  assert.equal(originText('equipe'), 'Pela equipe')
  assert.equal(originText('direto e equipe'), 'Direto e pela equipe')
  assert.equal(originText('x'), 'x')
})

test('separa clientes e máquinas avulsas, em ordem de nome', () => {
  const r = splitItems([
    { kind: 'machine', label: 'Zeta (1)' }, { kind: 'client', label: 'Beta' }, { kind: 'client', label: 'alfa' },
    { kind: 'machine', label: 'Alfa (2)' }, { kind: 'other', label: 'Lista' }, null,
  ])
  assert.deepEqual(r.clients.map(i => i.label), ['alfa', 'Beta'])
  assert.deepEqual(r.machines.map(i => i.label), ['Alfa (2)', 'Zeta (1)'])
  assert.equal(r.other.length, 1)
  assert.deepEqual(splitItems(null), { clients: [], machines: [], other: [] })
})

test('corpo da concessão de cliente e de máquina', () => {
  assert.deepEqual(grantPayload({ targetType: 2, targetId: 5, scope: 'client', groupId: 7, rule: 2 }),
    { target_type: 2, target_id: 5, scope: 'client', rule: 2, group_id: 7 })
  assert.deepEqual(grantPayload({ targetType: 1, targetId: 9, scope: 'machine', peerId: '123 456 789', rule: 9 }),
    { target_type: 1, target_id: 9, scope: 'machine', rule: 1, peer_id: '123456789' })
  assert.equal(grantPayload({ targetType: 1, targetId: 9, scope: 'machine', peerId: '1', remove: true }).remove, true)
})

test('concessão sem alvo é recusada', () => {
  assert.throws(() => grantPayload({ targetType: 1, targetId: 1, scope: 'client' }), /cliente/)
  assert.throws(() => grantPayload({ targetType: 1, targetId: 1, scope: 'machine', peerId: ' ' }), /máquina/)
  assert.throws(() => grantPayload({ targetType: 1, targetId: 1, scope: 'x' }), /inválido/)
})

test('só o acesso direto se tira na tela da pessoa', () => {
  assert.equal(removableOnUser({ origin: 'direto' }), true)
  assert.equal(removableOnUser({ origin: 'direto e equipe' }), true)
  assert.equal(removableOnUser({ origin: 'equipe' }), false)
  assert.equal(removableOnUser(null), false)
})

test('busca de pessoas por usuário, nome e equipe', () => {
  const us = [{ username: 'ana', nickname: 'Ana Souza', team: 'Suporte N1' }, { username: 'bia', nickname: '', team: '' }]
  assert.equal(filterUsers(us, 'suporte').length, 1)
  assert.equal(filterUsers(us, ' BIA ')[0].username, 'bia')
  assert.equal(filterUsers(us, '').length, 2)
  assert.deepEqual(filterUsers(null, 'x'), [])
})
