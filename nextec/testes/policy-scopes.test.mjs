import test from 'node:test'
import assert from 'node:assert/strict'
import { scopeRows, secretText, appText } from '../../src/nextec/policy-scopes.mjs'

const catalog = [{ key: 'enable-file-transfer', label: 'Transferência de arquivos' }, { key: 'enable-terminal', label: 'Terminal' }]

const scopes = [
  { group_id: 3, name: 'Acme / Servidores', path: 'Acme / Servidores', parent_id: 1, devices: 2, own_secret: false, own_app: true,
    secret: { enabled: true, interval_minutes: 60, auto_approve: true, origin: 'group', origin_group_id: 1, origin_name: 'Acme' },
    app_enabled: true, app_options: { 'enable-terminal': 'N' }, app_origin: { origin: 'group', origin_group_id: 3, origin_name: 'Acme / Servidores' } },
  { group_id: 1, name: 'Acme', path: 'Acme', parent_id: 0, devices: 5, own_secret: true, own_app: false,
    secret: { enabled: true, interval_minutes: 60, auto_approve: true, origin: 'group', origin_group_id: 1, origin_name: 'Acme' },
    app_enabled: true, app_options: { 'enable-file-transfer': 'N' }, app_origin: { origin: 'global' } },
  { group_id: 2, name: 'Zeta', path: 'Zeta', parent_id: 0, devices: 0, own_secret: false, own_app: false,
    secret: { enabled: false, interval_minutes: 0, auto_approve: false, origin: 'none' }, app_enabled: false, app_origin: { origin: 'none' } },
]

test('árvore: cliente antes do subgrupo, recuo pela profundidade', () => {
  const rows = scopeRows(scopes, catalog)
  assert.deepEqual(rows.map(r => r.name), ['Acme', 'Acme / Servidores', 'Zeta'])
  assert.deepEqual(rows.map(r => r.depth), [0, 1, 0])
})

test('origem: própria, herdada de X, global e sem regra', () => {
  const [acme, sub, zeta] = scopeRows(scopes, catalog)
  assert.equal(acme.secretOrigin, 'Própria')
  assert.equal(sub.secretOrigin, 'Herdada de Acme')
  assert.equal(sub.secretTone, 'inherited')
  assert.equal(sub.appOrigin, 'Própria')
  assert.equal(acme.appOrigin, 'Global')
  assert.equal(zeta.secretOrigin, 'Sem regra')
  assert.equal(zeta.appOrigin, 'Sem regra')
})

test('textos da regra de senha e do app', () => {
  assert.equal(secretText({ enabled: true, interval_minutes: 60, auto_approve: true, origin: 'group' }), 'troca a cada hora, aprova sozinho')
  assert.equal(secretText({ enabled: false, origin: 'group' }), 'troca desligada')
  assert.equal(secretText({ origin: 'none' }), 'a senha não troca sozinha')
  assert.equal(appText(true, { 'enable-file-transfer': 'N', 'enable-terminal': 'Y' }, catalog), 'bloqueia transferência de arquivos, permite terminal')
  assert.equal(appText(false, {}, catalog), 'sem ajustes: o app fica como está')
})

test('entrada inválida não quebra', () => {
  assert.deepEqual(scopeRows(null, catalog), [])
  assert.deepEqual(scopeRows([null, 3], catalog), [])
})
