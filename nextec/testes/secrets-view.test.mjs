import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { undeclaredTemplateNames } from './template-names.mjs'
import { normalizeOverview, normalizeGroups } from '../../src/nextec/secrets-data.mjs'

const views = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/nextec/views')

test('o template da tela Senhas dos servidores só usa nomes declarados no script', () => {
  const src = fs.readFileSync(path.join(views, 'SecretsPanel.vue'), 'utf8')
  assert.deepEqual(undeclaredTemplateNames(src, 'SecretsPanel.vue'), [])
})

test('o detector acusa um nome do template que não existe no script', () => {
  const src = '<template><el-dialog v-model="faltando.visible"/></template><script setup>import { ref } from "vue"\nconst ok = ref(1)</script>'
  assert.deepEqual(undeclaredTemplateNames(src), ['faltando'])
})

test('a rota abre a tela dentro da proteção contra falha de renderização', () => {
  const src = fs.readFileSync(path.join(views, 'Secrets.vue'), 'utf8')
  assert.match(src, /<render-guard>/)
  assert.match(src, /<secrets-panel\/>/)
  assert.match(fs.readFileSync(path.join(views, 'RenderGuard.vue'), 'utf8'), /onErrorCaptured/)
})

test('normalizeOverview troca null, ausente e tipos errados por listas vazias e contadores', () => {
  const vazio = { devices: [], policies: [], blocked: [], rejected: [], agentKeySet: false, pendingCount: 0, staleCount: 0 }
  for (const res of [null, undefined, false, {}, { data: null }, { data: {} }, { data: { devices: null, policies: null, blocked: null } },
    { data: { devices: 'x', policies: {}, blocked: 7, pending_count: 'abc', stale_count: -3 } }]) {
    assert.deepEqual(normalizeOverview(res), vazio)
  }
})

test('normalizeOverview mantém dados válidos, descarta itens nulos e deriva contagens das pendentes', () => {
  const n = normalizeOverview({ data: {
    agent_key_set: true,
    devices: [null, { peer_id: '1', state: 'pending', stale_key: true }, { peer_id: '2', state: 'pending' }, { peer_id: '3', state: 'approved' }],
    policies: [{ kind: 'group', ref: '1', enabled: true }],
    blocked: [{ peer_id: '9' }],
  } })
  assert.equal(n.devices.length, 3)
  assert.equal(n.pendingCount, 2)
  assert.equal(n.staleCount, 1)
  assert.equal(n.agentKeySet, true)
  assert.deepEqual(n.blocked, [{ peer_id: '9' }])
  assert.equal(normalizeOverview({ data: { pending_count: 5, stale_count: 2, devices: [] } }).pendingCount, 5)
})

test('normalizeGroups aceita lista nula ou ausente', () => {
  assert.deepEqual(normalizeGroups(null), [])
  assert.deepEqual(normalizeGroups({ data: { list: null } }), [])
  assert.deepEqual(normalizeGroups({ data: { list: [{ id: 1, name: 'A' }] } }), [{ id: 1, name: 'A' }])
})

test('normalizeOverview traz as rejeições em carência e ignora tipo errado', () => {
  assert.deepEqual(normalizeOverview({ data: { rejected: [null, { peer_id: '5', reason: 'teste', until: 10 }] } }).rejected, [{ peer_id: '5', reason: 'teste', until: 10 }])
  assert.deepEqual(normalizeOverview({ data: { rejected: 'x' } }).rejected, [])
})

test('Bloquear deixa claro o escopo e a rejeição pede motivo e explica a carência', () => {
  const src = fs.readFileSync(path.join(views, 'SecretsPanel.vue'), 'utf8')
  assert.match(src, /Bloquear cadastro de senha desta máquina/)
  assert.match(src, /Rejeitar solicitação/)
  assert.match(src, /carência/)
  assert.match(src, /Nova após rejeição/)
  assert.doesNotMatch(src, /<span class="nx-danger-text">Bloquear<\/span>/)
  assert.match(fs.readFileSync(path.join(views, '../api.js'), 'utf8'), /secretsReject = \(id, block, uuid, reason\)/)
})
