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
