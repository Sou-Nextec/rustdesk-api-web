import test from 'node:test'
import assert from 'node:assert/strict'
import { inviteResultLines, inviteResultSummary } from '../../src/nextec/invite-result.mjs'

test('linhas mostram vinculado e conflito com o cliente atual', () => {
  const lines = inviteResultLines([
    { peer_id: '123456789', result: 'linked', detail: 'vinculado a Cliente A', at: 1 },
    { peer_id: '987654321', result: 'conflict', detail: 'conflito: já pertence a Cliente B', at: 2 },
  ])
  assert.equal(lines[0].text, 'Vinculado a Cliente A')
  assert.equal(lines[0].tone, 'success')
  assert.equal(lines[0].peer, '123 456 789')
  assert.equal(lines[1].text, 'Conflito: já pertence a Cliente B')
  assert.equal(lines[1].tone, 'danger')
})

test('sem detalhe usa o texto padrão; entrada inválida vira lista vazia', () => {
  assert.match(inviteResultLines([{ peer_id: '1', result: 'identity' }])[0].text, /identidade/)
  assert.deepEqual(inviteResultLines(null), [])
  assert.deepEqual(inviteResultLines(undefined), [])
})

test('resumo conta vinculadas e problemas', () => {
  assert.equal(inviteResultSummary([]), '')
  assert.equal(inviteResultSummary([{ result: 'linked' }]), '1 vinculada')
  assert.equal(inviteResultSummary([{ result: 'linked' }, { result: 'linked' }, { result: 'conflict' }]), '2 vinculadas, 1 com problema')
})
