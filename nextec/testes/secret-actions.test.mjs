import test from 'node:test'
import assert from 'node:assert/strict'
import { secretActionState, assignPayload, pendingSummary } from '../../src/nextec/secret-actions.mjs'

test('configured rotation waits for agent enrollment before claiming it is active', () => {
  const state = secretActionState({ managed: true, enrolled: false })

  assert.equal(state.rotation, 'waiting-agent')
  assert.equal(state.canRotate, false)
  assert.match(state.rotateReason, /Instale o agente/)
  assert.equal(state.canReveal, false)
  assert.match(state.revealReason, /primeira senha/)
})

test('revealing a recorded or pending password remains available to authorized users', () => {
  assert.equal(secretActionState({ has_password: true }).canReveal, true)
  assert.equal(secretActionState({ pending: 'pending-secret' }).canReveal, true)
})

test('rotation requires both an enrolled agent and an enabled rule', () => {
  assert.equal(secretActionState({ enrolled: true, managed: true }).canRotate, true)
  assert.equal(secretActionState({ enrolled: true, managed: false }).canRotate, false)
  assert.match(secretActionState({ enrolled: true }).rotateReason, /Ligue a regra/)
  assert.equal(secretActionState({ enrolled: false, managed: true }).canRotate, false)
})

test('assign payload sends the interval only for the machine rule and always carries the seen uuid', () => {
  const base = { peer: '123456789', client: 7, interval: 60, move: false, uuid: 'uuid-visto' }
  assert.deepEqual(assignPayload({ ...base, rule: 'group' }), { id: '123456789', client_id: 7, rule: 'group', move: false, uuid: 'uuid-visto' })
  assert.deepEqual(assignPayload({ ...base, rule: 'none' }), { id: '123456789', client_id: 7, rule: 'none', move: false, uuid: 'uuid-visto' })
  assert.deepEqual(assignPayload({ ...base, rule: 'peer' }), { id: '123456789', client_id: 7, rule: 'peer', move: false, uuid: 'uuid-visto', interval_minutes: 60 })
  assert.equal('uuid' in assignPayload({ ...base, rule: 'group', uuid: '' }), false)
})

test('assign payload: group-enable liga a regra do cliente na mesma chamada', () => {
  const base = { peer: '123456789', client: 7, interval: 180, move: false, uuid: 'u' }
  assert.deepEqual(assignPayload({ ...base, rule: 'group-enable' }), {
    id: '123456789', client_id: 7, rule: 'group', move: false, uuid: 'u', enable_group_rule: true, group_interval_minutes: 180,
  })
  const plain = assignPayload({ ...base, rule: 'group' })
  assert.equal('enable_group_rule' in plain, false)
  assert.equal('group_interval_minutes' in plain, false)
})

test('pending summary keeps machines enrolled with a rotated key visible and counted as stale', () => {
  const sum = pendingSummary([
    { peer_id: '1', state: 'pending', stale_key: true },
    { peer_id: '2', state: 'pending' },
    { peer_id: '3', state: 'assigned', stale_key: true },
    { peer_id: '4' },
  ])
  assert.deepEqual(sum, { total: 2, stale: 1 })
  assert.deepEqual(pendingSummary(), { total: 0, stale: 0 })
})
