import test from 'node:test'
import assert from 'node:assert/strict'
import { generationEvent, generationDownload, generationState, activeGeneration } from '../../src/nextec/generation-catalog.mjs'
const uuid = 'aaaaaaaa-0000-0000-0000-000000000001'
test('only the current same-origin generator may announce a build', () => {
  const source = {}, other = {}, event = { origin: 'https://panel.test', source, data: { type: 'nextec-generation-started', uuid } }
  assert.equal(generationEvent(event, event.origin, source), uuid)
  assert.equal(generationEvent(event, event.origin, other), null)
  assert.equal(generationEvent(event, 'https://attacker.test', source), null)
})
test('downloads remain inside the generator and use plain filenames', () => {
  assert.equal(generationDownload(`download?uuid=${uuid}&filename=Nextec-Connect.msi`), `/gerador/download?uuid=${uuid}&filename=Nextec-Connect.msi`)
  assert.equal(generationDownload(`https://attacker.test/download?uuid=${uuid}&filename=evil.exe`), null)
  assert.equal(generationDownload(`download?uuid=${uuid}&filename=../evil.exe`), null)
  assert.equal(generationDownload(`download?uuid=invalid&filename=client.msi`), null)
  assert.equal(generationDownload('https://[invalid'), null)
})
test('missing files and uncertain submission never appear ready', () => {
  assert.equal(generationState({ status: 'incomplete' }).tone, 'danger')
  assert.equal(generationState({ status: 'submission_unknown' }).tone, 'warning')
  assert.equal(generationState({ status: 'success', files: [] }).label, 'Gerando')
  assert.equal(generationState({ status: 'success', files: [{ name: 'client.msi' }] }).tone, 'success')
  assert.equal(activeGeneration({ status: 'in_progress' }), true)
})

import { failedGeneration, deletableGeneration, deleteGeneration, deleteGenerations } from '../../src/nextec/generation-catalog.mjs'
const fakeFetch = (status, body, calls = []) => async (url, init) => {
  calls.push({ url, init })
  return { ok: status < 400, status, json: async () => body }
}
test('failed items are identified and can be deleted; running ones cannot', () => {
  assert.equal(failedGeneration({ status: 'failure' }), true)
  assert.equal(failedGeneration({ status: 'in_progress', submission_error: 'x' }), true)
  assert.equal(failedGeneration({ status: 'incomplete' }), true)
  assert.equal(failedGeneration({ status: 'success', files: [{}] }), false)
  assert.equal(deletableGeneration({ uuid, status: 'failure' }), true)
  assert.equal(deletableGeneration({ uuid, status: 'in_progress' }), false)
  assert.equal(deletableGeneration({ uuid, status: 'success', deletable: false }), false)
  assert.equal(generationState({ status: 'in_progress', submission_error: 'x' }).label, 'Falhou')
})
test('deleting one failed item sends the guarded request', async () => {
  const calls = []
  const result = await deleteGeneration(uuid, { fetchImpl: fakeFetch(200, { deleted: [uuid], blocked: [] }, calls) })
  assert.deepEqual(result.deleted, [uuid])
  assert.equal(calls[0].url, `/gerador/nextec/geracoes/${uuid}/excluir/`)
  assert.equal(calls[0].init.method, 'DELETE')
  assert.equal(calls[0].init.headers['X-Nextec-Acao'], 'excluir')
})
test('item already sent to updates needs explicit confirmation', async () => {
  const calls = []
  await assert.rejects(deleteGeneration(uuid, { fetchImpl: fakeFetch(409, { error: 'enviado', code: 'imported' }) }), e => e.code === 'imported')
  await deleteGeneration(uuid, { confirmImported: true, fetchImpl: fakeFetch(200, { deleted: [uuid] }, calls) })
  assert.match(calls[0].url, /\?confirmar=1$/)
})
test('bulk delete sends only valid ids or the failed scope', async () => {
  const calls = []
  const f = fakeFetch(200, { deleted: [uuid], blocked: [] }, calls)
  await deleteGenerations({ uuids: [uuid], fetchImpl: f })
  assert.deepEqual(JSON.parse(calls[0].init.body), { uuids: [uuid] })
  await deleteGenerations({ scope: 'failed', fetchImpl: f })
  assert.deepEqual(JSON.parse(calls[1].init.body), { scope: 'failed' })
})
test('path traversal identifiers are refused before any request', async () => {
  const calls = []
  const f = fakeFetch(200, {}, calls)
  await assert.rejects(deleteGeneration('../../etc/passwd', { fetchImpl: f }), e => e.code === 'invalid')
  await assert.rejects(deleteGenerations({ uuids: [uuid, '../x'], fetchImpl: f }), e => e.code === 'invalid')
  await assert.rejects(deleteGenerations({ uuids: [], fetchImpl: f }), e => e.code === 'invalid')
  assert.equal(calls.length, 0)
})
