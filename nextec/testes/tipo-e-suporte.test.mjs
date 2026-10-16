import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseKind, analystsDownloadNotice } from '../../src/nextec/release-kind.mjs'
import { supportCandidates } from '../../src/nextec/support-source.mjs'

test('tipo da versão vem do "Destinado a" declarado', () => {
  assert.equal(releaseKind({ profile: 'analysts' }).label, 'Analistas')
  assert.equal(releaseKind({ profile: 'client' }).label, 'Cliente específico')
  assert.equal(releaseKind({ profile: 'default' }).label, 'Cliente padrão')
  assert.equal(releaseKind({ profile: '', generation_uuid: 'x' }).label, 'Cliente padrão')
  assert.equal(releaseKind({}).label, 'Tipo não registrado')
  assert.equal(releaseKind({}).key, 'unknown')
})

test('tipo não registrado bloqueia disponibilizar até definir o tipo', () => {
  const n = analystsDownloadNotice({ id: 5, version: '2.0.9' }, { id: 1, version: '2.0.7', profile: 'analysts' })
  assert.equal(n.blocked, true)
  assert.match(n.message, /Defina o tipo/)
  assert.equal(analystsDownloadNotice({ id: 6, version: '2.4.0', profile: 'analysts' }, null).blocked, false)
})

test('confirmação de disponibilizar avisa a substituição e o tipo errado', () => {
  const current = { id: 1, version: '2.0.9', profile: 'analysts' }
  const clientApp = { id: 2, version: '2.3.6', profile: 'default', client_name: 'Cliente-Nextec-Connect' }
  const n = analystsDownloadNotice(clientApp, current)
  assert.equal(n.danger, true)
  assert.match(n.message, /2\.3\.6/)
  assert.match(n.message, /substitui a versão 2\.0\.9/)
  assert.match(n.message, /NÃO foi gerada como "Analistas"/)
  const ok = analystsDownloadNotice({ id: 3, version: '2.4.0', profile: 'analysts' }, current)
  assert.equal(ok.danger, false)
  assert.doesNotMatch(ok.message, /NÃO foi gerada/)
})

const uuid = 'aaaaaaaa-0000-0000-0000-000000000001'
const uuid2 = 'bbbbbbbb-0000-0000-0000-000000000002'
test('candidatos a app de suporte: só gerações prontas com .exe e download válido', () => {
  const rows = [
    { uuid, status: 'success', filename: 'Suporte-Nextec', created_at: '2026-10-15T10:00:00Z', files: [{ name: 'Suporte-Nextec.exe', url: `/gerador/download?uuid=${uuid}&filename=Suporte-Nextec.exe` }] },
    { uuid: uuid2, status: 'success', filename: 'Nextec-Connect', created_at: '2026-10-16T10:00:00Z', files: [{ name: 'Nextec-Connect.msi', url: `/gerador/download?uuid=${uuid2}&filename=Nextec-Connect.msi` }, { name: 'Nextec-Connect.exe', url: `/gerador/download?uuid=${uuid2}&filename=Nextec-Connect.exe` }] },
    { uuid: 'cccccccc-0000-0000-0000-000000000003', status: 'failure', files: [{ name: 'x.exe', url: '/gerador/download?uuid=cccccccc-0000-0000-0000-000000000003&filename=x.exe' }] },
    { uuid: 'dddddddd-0000-0000-0000-000000000004', status: 'success', files: [{ name: 'evil.exe', url: 'https://evil.example/x.exe' }] },
  ]
  const list = supportCandidates(rows)
  assert.equal(list.length, 2)
  assert.equal(list[0].name, 'Suporte-Nextec.exe')
  assert.equal(list[0].looksLikeSupport, true)
  assert.equal(list[1].name, 'Nextec-Connect.exe')
  assert.equal(supportCandidates(null).length, 0)
})
