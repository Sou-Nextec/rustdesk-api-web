import test from 'node:test'
import assert from 'node:assert/strict'
import { nextCheck, createAutoRefresh, AGENT_CYCLE_SECONDS } from '../../src/nextec/agent-cycle.mjs'

const NOW = 1_800_000_000

test('nextCheck: contagem regressiva dentro do ciclo de 1 minuto', () => {
  assert.equal(AGENT_CYCLE_SECONDS, 60)
  assert.deepEqual(nextCheck(NOW - 10, NOW), { state: 'waiting', minutes: 1, text: 'Próxima verificação em ~1 min.' })
  assert.equal(nextCheck(NOW - 59, NOW).minutes, 1)
  assert.equal(nextCheck(NOW + 50, NOW).minutes, 1)
})

test('nextCheck: em instantes, atrasada (passou do ritmo antigo), parada e sem contato', () => {
  assert.equal(nextCheck(NOW - 61, NOW).state, 'due')
  assert.equal(nextCheck(NOW - 61, NOW).text, 'Próxima verificação em instantes.')
  // agente ainda no ritmo antigo de 5 minutos não aparece como atrasado
  assert.equal(nextCheck(NOW - 299, NOW).state, 'due')
  assert.equal(nextCheck(NOW - 301, NOW).state, 'late')
  assert.equal(nextCheck(NOW - 1199, NOW).state, 'late')
  assert.equal(nextCheck(NOW - 1200, NOW).state, 'stalled')
  for (const v of [0, null, undefined, 'x', -5]) assert.equal(nextCheck(v, NOW).state, 'unknown')
})

function fakeEnv (visible = true) {
  const handlers = []
  const doc = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener (e, f) { if (e === 'visibilitychange') handlers.push(f) },
    removeEventListener (e, f) { const i = handlers.indexOf(f); if (i >= 0) handlers.splice(i, 1) },
  }
  const timers = new Map()
  let id = 0
  return {
    doc, handlers, timers,
    setIntervalFn: (f) => { timers.set(++id, f); return id },
    clearIntervalFn: (h) => timers.delete(h),
    fire: () => [...timers.values()].forEach(f => f()),
    setVisible (v) { doc.visibilityState = v ? 'visible' : 'hidden'; handlers.slice().forEach(h => h()) },
  }
}

test('auto-refresh: tick a cada ciclo curto e recarga a cada 2 ticks', () => {
  const env = fakeEnv()
  let ticks = 0; let refreshes = 0
  const r = createAutoRefresh({ onTick: () => ticks++, onRefresh: () => refreshes++, tickMs: 30000, refreshMs: 60000, ...env })
  r.start()
  assert.equal(r.running, true)
  env.fire(); env.fire(); env.fire(); env.fire()
  assert.equal(ticks, 4)
  assert.equal(refreshes, 2)
  r.stop()
})

test('auto-refresh: aba oculta pausa o timer e ao voltar recarrega na hora', () => {
  const env = fakeEnv()
  let refreshes = 0
  const r = createAutoRefresh({ onRefresh: () => refreshes++, ...env })
  r.start()
  env.setVisible(false)
  assert.equal(env.timers.size, 0)
  assert.equal(r.running, false)
  env.setVisible(true)
  assert.equal(refreshes, 1)
  assert.equal(env.timers.size, 1)
  r.stop()
})

test('auto-refresh: stop limpa o timer e o listener; iniciar oculto não arma timer', () => {
  const env = fakeEnv()
  const r = createAutoRefresh({ ...env })
  r.start(); r.start()
  assert.equal(env.timers.size, 1)
  assert.equal(env.handlers.length, 1)
  r.stop()
  assert.equal(env.timers.size, 0)
  assert.equal(env.handlers.length, 0)
  const hid = fakeEnv(false)
  const r2 = createAutoRefresh({ ...hid })
  r2.start()
  assert.equal(hid.timers.size, 0)
  r2.stop()
})
