import test from 'node:test'
import assert from 'node:assert/strict'
import { randomSessionId, sessionLabel } from '../../src/nextec/quick-id.mjs'

test('código do atendimento: seis dígitos com hífen, sem zero à esquerda e diferente do ID do RustDesk', () => {
  assert.equal(randomSessionId(() => 0), '100-000')
  assert.equal(randomSessionId(() => 899999), '999-999')
  assert.equal(randomSessionId(() => 900000), '100-000')
  for (let i = 0; i < 200; i++) {
    const id = randomSessionId()
    assert.match(id, /^[1-9]\d{2}-\d{3}$/)
    assert.doesNotMatch(id, /^\d{3} \d{3} \d{3}$/)
  }
})

test('rótulo do link: texto opcional mais o código', () => {
  assert.equal(sessionLabel('', '482-913'), 'Atendimento 482-913')
  assert.equal(sessionLabel('  Cartório Mariinha ', '482-913'), 'Cartório Mariinha (482-913)')
  assert.ok(sessionLabel('x'.repeat(300), '482-913').length <= 120)
})
