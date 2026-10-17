import test from 'node:test'
import assert from 'node:assert/strict'
import { inviteLink, inviteFileName, inviteCommand, inviteMessage, inviteBatchCsv, parseBatchLines } from '../../src/nextec/invite-command.mjs'

const CODE = 'K7M2QX9P4TA8B3C5D6E2'
const release = { version: '2.3.6', file_name: 'Cliente-Nextec-Connect.msi', sha256: 'A'.repeat(64) }

test('link e nome do arquivo carregam o código; entradas inválidas são recusadas', () => {
  assert.equal(inviteLink('https://painel.exemplo.com.br/', CODE), `https://painel.exemplo.com.br/instalador/${CODE}`)
  assert.equal(inviteFileName('Cliente-Nextec-Connect.msi', CODE), `Cliente-Nextec-Connect-${CODE}.msi`)
  assert.equal(inviteFileName('Nome com espaço & aspas".msi', CODE), `Nomecomespaoaspas-${CODE}.msi`)
  assert.throws(() => inviteLink('https://x', 'curto'), /inválido/)
  assert.throws(() => inviteLink('https://x', CODE.toLowerCase()), /inválido/)
})

test('comando silencioso confere o hash escrito nele e instala sem interface', () => {
  const cmd = inviteCommand({ origin: 'https://painel.exemplo.com.br', code: CODE, release })
  assert.match(cmd, new RegExp(`/instalador/${CODE}/baixar`))
  assert.match(cmd, new RegExp('-ne \'' + 'a'.repeat(64) + '\''))
  assert.match(cmd, /msiexec\.exe/)
  assert.match(cmd, /\/qn/)
  assert.match(cmd, new RegExp(`Cliente-Nextec-Connect-${CODE}\\.msi`))
  assert.doesNotMatch(cmd, /\biex\b|Invoke-Expression/i)
  assert.throws(() => inviteCommand({ origin: 'https://x', code: CODE, release: { sha256: 'nao' } }), /publicada/)
  assert.throws(() => inviteCommand({ origin: 'https://x', code: CODE, release: null }), /publicada/)
})

test('mensagem e CSV do lote', () => {
  assert.match(inviteMessage({ origin: 'https://x.com', code: CODE, label: 'Mesa 1' }), /Mesa 1.*\/instalador\//)
  const csv = inviteBatchCsv({ origin: 'https://x.com', release, rows: [{ alias: 'PC-01', label: 'Mesa "1"', code: CODE }] })
  const lines = csv.trim().split('\r\n')
  assert.equal(lines[0], 'apelido,descricao,link,comando')
  assert.match(lines[1], /^"PC-01","Mesa ""1""","https:\/\/x\.com\/instalador\//)
})

test('linhas do lote: apelido; descrição, vazias ignoradas, limite', () => {
  assert.deepEqual(parseBatchLines('PC-01; Mesa 1\n\n  PC-02  \nPC-03;Sala; A'), [
    { alias: 'PC-01', label: 'Mesa 1' }, { alias: 'PC-02', label: 'PC-02' }, { alias: 'PC-03', label: 'Sala; A' }])
  assert.throws(() => parseBatchLines('a\n'.repeat(5), 4), /até 4/)
})
