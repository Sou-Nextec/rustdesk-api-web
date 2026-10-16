import test from 'node:test'
import assert from 'node:assert/strict'
import { randomSessionId, sessionLabel } from '../../src/nextec/quick-id.mjs'

test('ID do atendimento: nove dígitos em grupos de três, sem zero à esquerda', () => {
  assert.equal(randomSessionId(() => 0), '100 000 000')
  assert.equal(randomSessionId(() => 899999999), '999 999 999')
  assert.equal(randomSessionId(() => 900000000), '100 000 000')
  for (let i = 0; i < 200; i++) assert.match(randomSessionId(), /^[1-9]\d{2} \d{3} \d{3}$/)
})

test('rótulo do link: texto opcional mais o ID', () => {
  assert.equal(sessionLabel('', '482 913 076'), 'Suporte 482 913 076')
  assert.equal(sessionLabel('  Cartório Mariinha ', '482 913 076'), 'Cartório Mariinha (482 913 076)')
  assert.ok(sessionLabel('x'.repeat(300), '482 913 076').length <= 120)
})
