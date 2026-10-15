import test from 'node:test'
import assert from 'node:assert/strict'
import { retryUrl, nextRetry } from '../../src/nextec/generator-retry.mjs'

test('preserva o nome do aplicativo original, independente do arquivo', () => {
  const r = retryUrl({ filename: 'Cliente-Bruno.msi', app_name: 'Nextec-Connect', client_name: 'Carteira A', platform: 'windows' })
  const q = new URL(r.src, 'https://x').searchParams
  assert.equal(q.get('exename'), 'Cliente-Bruno')
  assert.equal(q.get('appname'), 'Nextec-Connect')
  assert.equal(q.get('client_name'), 'Carteira A')
  assert.equal(r.appKnown, true)
})

test('item antigo sem app_name nao inventa appname e avisa', () => {
  const r = retryUrl({ filename: 'Cliente-Bruno' })
  const q = new URL(r.src, 'https://x').searchParams
  assert.equal(q.get('exename'), 'Cliente-Bruno')
  assert.equal(q.has('appname'), false)
  assert.equal(r.appKnown, false)
})

test('segredos e arquivos nao voltam', () => {
  const r = retryUrl({ filename: 'A', key: 'segredo', permanentPassword: 'x', iconbase64: 'y' })
  assert.doesNotMatch(r.src, /segredo|permanentPassword|iconbase64/)
})

test('duas tentativas do mesmo item mudam o nonce com a mesma URL', () => {
  const row = { filename: 'A.msi', app_name: 'B' }
  const first = nextRetry({ nonce: 0 }, row)
  const second = nextRetry(first, row)
  assert.equal(first.src, second.src)
  assert.notEqual(first.nonce, second.nonce)
})
