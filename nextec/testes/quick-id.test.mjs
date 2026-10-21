import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionLabel, QUICK_DEFAULT_LABEL, attendanceCode, CODE_SHOWN } from '../../src/nextec/quick-id.mjs'

test('rótulo do link: texto opcional ou o padrão', () => {
  assert.equal(sessionLabel(''), QUICK_DEFAULT_LABEL)
  assert.equal(sessionLabel(undefined), 'Suporte rápido')
  assert.equal(sessionLabel('  chamado 1234 '), 'chamado 1234')
  assert.ok(sessionLabel('x'.repeat(300)).length <= 100)
})

test('código do atendimento: maiúsculas, dois blocos de 4 e cópia sem hífen', () => {
  assert.deepEqual(attendanceCode('k7m2xp9q'), { full: 'K7M2XP9Q', text: 'K7M2-XP9Q', truncated: false })
  assert.deepEqual(attendanceCode('  ABCD2345 '), { full: 'ABCD2345', text: 'ABCD-2345', truncated: false })
})

test('código do atendimento: vazio, curto e longo', () => {
  assert.deepEqual(attendanceCode(''), { full: '', text: '', truncated: false })
  assert.deepEqual(attendanceCode(undefined), { full: '', text: '', truncated: false })
  assert.equal(attendanceCode('abc').text, 'ABC')
  const longo = attendanceCode('a'.repeat(CODE_SHOWN + 8))
  assert.equal(longo.truncated, true)
  assert.equal(longo.text, 'AAAAAAAA…')
  assert.equal(longo.full.length, CODE_SHOWN + 8)
})
