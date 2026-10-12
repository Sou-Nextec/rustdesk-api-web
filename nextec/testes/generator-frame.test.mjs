import test from 'node:test'
import assert from 'node:assert/strict'
import { generatorHeight } from '../../src/nextec/generator-frame.mjs'

const origin = 'https://painel.example'
const source = {}
const valid = { origin, source, data: { type: 'nextec-generator-ready', height: 900 } }
test('same-origin generator reports its actual height', () => assert.equal(generatorHeight(valid, origin, source), 900))
test('external sites and sibling frames cannot change the panel', () => {
  assert.equal(generatorHeight({ ...valid, origin: 'https://outside.example' }, origin, source), null)
  assert.equal(generatorHeight({ ...valid, source: {} }, origin, source), null)
  assert.equal(generatorHeight(valid, origin, null), null)
})
test('invalid heights do not break the responsive layout', () => {
  for (const height of [-1, Infinity, 'invalid', 30001, null, '', false, []]) {
    assert.equal(generatorHeight({ ...valid, data: { ...valid.data, height } }, origin, source), null)
  }
  assert.equal(generatorHeight({ ...valid, data: { ...valid.data, height: 100 } }, origin, source), 480)
})
test('loaded generator hidden behind generated-items tab is ready with minimum height', () => {
  assert.equal(generatorHeight({ ...valid, data: { ...valid.data, height: 0 } }, origin, source), 480)
})
