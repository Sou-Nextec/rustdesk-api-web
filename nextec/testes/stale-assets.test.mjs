import test from 'node:test'
import assert from 'node:assert/strict'
import { isStaleAssetError, shouldReload, recoverFromStaleAssets, RELOAD_KEY } from '../../src/nextec/stale-assets.mjs'

const chrome = new TypeError('Failed to fetch dynamically imported module: https://painel/assets/Index-abc.js')
const firefox = new TypeError('error loading dynamically imported module: https://painel/assets/Index-abc.js')
const store = (initial) => {
  const data = new Map(initial ? [[RELOAD_KEY, initial]] : [])
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data }
}

test('reconhece a falha de módulo dinâmico nos navegadores', () => {
  assert.equal(isStaleAssetError(chrome), true)
  assert.equal(isStaleAssetError(firefox), true)
  assert.equal(isStaleAssetError(new Error('Network Error')), false)
  assert.equal(isStaleAssetError(null), false)
})
test('recarrega uma vez e avisa antes', () => {
  const s = store(); const calls = []
  const done = recoverFromStaleAssets(chrome, { storage: s, now: 1000000, notify: m => calls.push(['aviso', m]), reload: () => calls.push(['reload']) })
  assert.equal(done, true)
  assert.deepEqual(calls.map(c => c[0]), ['aviso', 'reload'])
  assert.match(calls[0][1], /Nova versão do painel/)
  assert.equal(s.getItem(RELOAD_KEY), '1000000')
})
test('não entra em loop: ignora nova falha em menos de 60 s', () => {
  const s = store('1000000'); let reloads = 0
  assert.equal(recoverFromStaleAssets(chrome, { storage: s, now: 1030000, reload: () => reloads++ }), false)
  assert.equal(reloads, 0)
  assert.equal(shouldReload(chrome, '1000000', 1060000), true)
})
test('erro comum não recarrega', () => {
  assert.equal(shouldReload(new Error('x'), null, 1), false)
})
test('storage lançando exceção no get e no set: nunca recarrega sozinho, mostra aviso manual', () => {
  const broken = { getItem () { throw new Error('bloqueado') }, setItem () { throw new Error('bloqueado') } }
  let reloads = 0; const manual = []
  assert.equal(recoverFromStaleAssets(chrome, { storage: broken, reload: () => reloads++, notifyManual: m => manual.push(m) }), false)
  assert.equal(reloads, 0)
  assert.equal(manual.length, 1)
})
test('storage com set lançando exceção (get ok): não recarrega, aviso manual', () => {
  const noSet = { getItem: () => null, setItem () { throw new Error('cota') } }
  let reloads = 0; const manual = []
  assert.equal(recoverFromStaleAssets(chrome, { storage: noSet, reload: () => reloads++, notifyManual: m => manual.push(m) }), false)
  assert.equal(reloads, 0)
  assert.equal(manual.length, 1)
})
test('storage que ignora a escrita em silêncio: não recarrega', () => {
  const mute = { getItem: () => null, setItem () {} }
  let reloads = 0
  assert.equal(recoverFromStaleAssets(chrome, { storage: mute, reload: () => reloads++ }), false)
  assert.equal(reloads, 0)
})
test('sem storage algum: não recarrega', () => {
  let reloads = 0
  assert.equal(recoverFromStaleAssets(chrome, { reload: () => reloads++ }), false)
  assert.equal(reloads, 0)
})
