import test from 'node:test'
import assert from 'node:assert/strict'
import { createRotationWatch, ROTATION_NOTICE } from '../../src/nextec/rotation-watch.mjs'

function fakeEnv (visible = true) {
  let clock = 1_000_000
  const timers = new Map()
  let id = 0
  const doc = { visibilityState: visible ? 'visible' : 'hidden' }
  return {
    doc,
    timers,
    now: () => clock,
    setTimeoutFn: (f) => { timers.set(++id, f); return id },
    clearTimeoutFn: (h) => timers.delete(h),
    advance (ms) { clock += ms },
    async fire () {
      const [handle, f] = [...timers.entries()][0] || []
      if (!handle) return false
      timers.delete(handle)
      await f()
      return true
    },
  }
}

test('o aviso diz "até 1 minuto" e nao promete o ritmo antigo de 5 minutos', () => {
  assert.match(ROTATION_NOTICE, /até 1 minuto/)
  assert.doesNotMatch(ROTATION_NOTICE, /5 minutos/)
})

test('recarrega a lista a cada rodada e avisa quando a versao da senha muda', async () => {
  const env = fakeEnv()
  let version = 3
  let reloads = 0
  const settled = []
  const w = createRotationWatch({ ...env, reload: async () => { reloads++ }, versionOf: () => version, onSettled: p => settled.push(p) })
  w.watch('111', 3)
  assert.equal(w.running, true)
  env.advance(15000)
  await env.fire()
  assert.equal(reloads, 1)
  assert.deepEqual(settled, [])
  assert.equal(w.running, true)
  version = 4
  env.advance(15000)
  await env.fire()
  assert.deepEqual(settled, ['111'])
  assert.equal(w.size, 0)
  assert.equal(w.running, false)
})

test('um unico timer para varias maquinas e desiste depois do prazo', async () => {
  const env = fakeEnv()
  const gaveUp = []
  const w = createRotationWatch({ ...env, reload: async () => {}, versionOf: () => 1, onGiveUp: p => gaveUp.push(p), maxMs: 60000 })
  w.watch('a', 1); w.watch('b', 1)
  assert.equal(env.timers.size, 1)
  env.advance(30000); await env.fire()
  assert.deepEqual(gaveUp, [])
  env.advance(31000); await env.fire()
  assert.deepEqual(gaveUp.sort(), ['a', 'b'])
  assert.equal(env.timers.size, 0)
})

test('aba oculta nao recarrega a lista (rodada pulada) e volta a recarregar ao ficar visivel', async () => {
  const env = fakeEnv(false)
  let reloads = 0
  const w = createRotationWatch({ ...env, reload: async () => { reloads++ }, versionOf: () => 1 })
  w.watch('a', 1)
  env.advance(15000); await env.fire()
  env.advance(15000); await env.fire()
  assert.equal(reloads, 0)
  env.doc.visibilityState = 'visible'
  env.advance(15000); await env.fire()
  assert.equal(reloads, 1)
  w.stop()
})

test('stop limpa o timer e as maquinas observadas; falha de recarga nao derruba a vigilancia', async () => {
  const env = fakeEnv()
  const w = createRotationWatch({ ...env, reload: async () => { throw new Error('rede') }, versionOf: () => 1 })
  w.watch('a', 1)
  env.advance(15000); await env.fire()
  assert.equal(w.running, true)
  w.stop()
  assert.equal(env.timers.size, 0)
  assert.equal(w.size, 0)
})
