import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionLabel, QUICK_DEFAULT_LABEL } from '../../src/nextec/quick-id.mjs'

test('rótulo do link: texto opcional ou o padrão', () => {
  assert.equal(sessionLabel(''), QUICK_DEFAULT_LABEL)
  assert.equal(sessionLabel(undefined), 'Suporte rápido')
  assert.equal(sessionLabel('  chamado 1234 '), 'chamado 1234')
  assert.ok(sessionLabel('x'.repeat(300)).length <= 100)
})
