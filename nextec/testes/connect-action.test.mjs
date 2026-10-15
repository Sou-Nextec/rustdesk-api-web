import test from 'node:test'
import assert from 'node:assert/strict'
import { urlForAction } from '../../src/nextec/connect-action.mjs'

test('sem ação mantém o link', () => {
  assert.equal(urlForAction('nextec-connect://215969168?password=abc', ''), 'nextec-connect://215969168?password=abc')
})

test('transferência de arquivos usa o caminho file-transfer e preserva a senha', () => {
  assert.equal(urlForAction('nextec-connect://215969168?password=abc', 'file-transfer'),
    'nextec-connect://file-transfer/215969168?password=abc')
  assert.equal(urlForAction('rustdesk://536822159', 'file-transfer'), 'rustdesk://file-transfer/536822159')
})

test('ação desconhecida ou link inválido falham sem abrir nada', () => {
  assert.throws(() => urlForAction('nextec-connect://1', 'terminal-admin'))
  assert.throws(() => urlForAction('', 'file-transfer'))
  assert.throws(() => urlForAction('javascript:alert(1)', 'file-transfer'))
})
