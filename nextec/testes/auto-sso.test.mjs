import test from 'node:test'
import assert from 'node:assert/strict'
import { autoSsoProvider, markAttempt, markLoggedOut, clearSsoFlags, providerLabel, isMicrosoft, RETRY_WINDOW_MS } from '../../src/nextec/auto-sso.mjs'

const memory = () => {
  const data = new Map()
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }
}

test('com um único provedor, entra sozinho', () => {
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: memory() }), 'Microsoft')
})

test('com mais de um provedor ou nenhum, a pessoa escolhe', () => {
  assert.equal(autoSsoProvider({ ops: ['Microsoft', 'github'], storage: memory() }), '')
  assert.equal(autoSsoProvider({ ops: [], storage: memory() }), '')
  assert.equal(autoSsoProvider({ ops: null, storage: memory() }), '')
})

test('?manual=1 ou ?senha=1 mostram o formulário de sempre', () => {
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], query: { manual: '1' }, storage: memory() }), '')
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], query: { senha: '' }, storage: memory() }), '')
})

test('quem saiu de propósito não é reconectado na hora', () => {
  const s = memory()
  markLoggedOut(s)
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s }), '')
  clearSsoFlags(s)
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s }), 'Microsoft')
})

test('uma tentativa que volta para o login não vira loop', () => {
  const s = memory()
  const t0 = 1_000_000
  markAttempt(s, t0)
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s, now: t0 + 5_000 }), '')
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s, now: t0 + RETRY_WINDOW_MS - 1 }), '')
  // passado o prazo, tenta de novo (token expirado depois de horas, por exemplo)
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s, now: t0 + RETRY_WINDOW_MS + 1 }), 'Microsoft')
})

test('login demorado (senha, MFA): a volta com erro registra o horário e suprime o próximo redirecionamento', () => {
  const s = memory()
  const t0 = 1_000_000
  markAttempt(s, t0)                       // saiu para o Entra
  const volta = t0 + 5 * 60 * 1000         // voltou 5 minutos depois, com erro
  markAttempt(s, volta)                    // a tela registra a volta
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: s, now: volta + 1_000 }), '')
  assert.ok(RETRY_WINDOW_MS >= 5 * 60 * 1000)
})

test('sem como gravar as travas, não entra sozinho (melhor um clique do que um loop)', () => {
  const broken = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') }, removeItem() { throw new Error('bloqueado') } }
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: broken }), '')
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: undefined }), '')
  assert.equal(markAttempt(broken), false)
  assert.equal(markAttempt(memory()), true)
  assert.doesNotThrow(() => { markLoggedOut(broken); clearSsoFlags(broken) })
  // armazenamento que aceita gravar mas não devolve o valor também conta como quebrado
  const amnesia = { getItem: () => null, setItem() {}, removeItem() {} }
  assert.equal(autoSsoProvider({ ops: ['Microsoft'], storage: amnesia }), '')
})

test('o provedor Microsoft ganha o rótulo e os outros usam a tradução', () => {
  assert.equal(isMicrosoft('Microsoft'), true)
  assert.equal(isMicrosoft('microsoft'), true)
  assert.equal(isMicrosoft('github'), false)
  assert.equal(providerLabel('Microsoft'), 'Entrar com a Microsoft')
  assert.equal(providerLabel('github', x => x.toUpperCase()), 'GITHUB')
})
