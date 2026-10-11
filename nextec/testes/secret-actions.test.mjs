import test from 'node:test'
import assert from 'node:assert/strict'
import { secretActionState } from '../../src/nextec/secret-actions.mjs'

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
