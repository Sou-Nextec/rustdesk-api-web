import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { normalizeOverview, normalizeGroups } from '../../src/nextec/secrets-data.mjs'

const views = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/nextec/views')

// Nomes que o template usa sem ter sido declarados no <script setup> viram `_ctx.nome` na compilação.
// Em runtime isso é undefined e o render quebra (tela em branco). Foi o que aconteceu com `blockedDlg` na 2.11.0.
export function undeclaredTemplateNames(source, filename = 'x.vue') {
  const { descriptor } = parse(source, { filename })
  const script = compileScript(descriptor, { id: 'x' })
  const out = compileTemplate({
    source: descriptor.template.content, filename, id: 'x',
    compilerOptions: { bindingMetadata: script.bindings, prefixIdentifiers: true },
  })
  assert.deepEqual(out.errors, [])
  const names = new Set()
  for (const m of out.code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  return [...names].filter(n => !n.startsWith('$')).sort()
}

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
  const vazio = { devices: [], policies: [], blocked: [], agentKeySet: false, pendingCount: 0, staleCount: 0 }
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
