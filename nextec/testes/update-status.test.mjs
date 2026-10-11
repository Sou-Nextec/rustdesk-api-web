import test from 'node:test'
import assert from 'node:assert/strict'
import { updateState, applicableRollout } from '../../src/nextec/update-status.mjs'
const now = 2000000000000, general = { mode: 'all', version: '2.0.7', groups: [], peers: [] }
test('devices without check-ins are pending, not silently omitted or updated', () => {
  const row = { peer_id: '123', group_id: 1, version: '', seen_at: 0 }
  assert.equal(updateState(row, general, [], now).eligible, true)
  assert.equal(updateState(row, general, [], now).label, 'Nunca informou atualização')
})
test('specific client retains its version independently of the general release', () => {
  const scoped = [{ mode: 'pilot', version: '2.0.8', groups: [1], peers: [] }]
  assert.equal(applicableRollout({ peer_id: '123', group_id: 1 }, general, scoped).version, '2.0.8')
  assert.equal(applicableRollout({ peer_id: '456', group_id: 2 }, general, scoped).version, '2.0.7')
})
test('outdated telemetry never claims a confirmed current install', () => {
  const row = { peer_id: '123', version: '2.0.7', seen_at: now / 1000 - 49 * 3600 }
  assert.equal(updateState(row, general, [], now).label, 'Sem checagem recente')
  assert.equal(updateState({ ...row, seen_at: now / 1000 }, general, [], now).label, 'Atualizada')
})
