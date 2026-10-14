// Abrir direto, protocolo por máquina e aviso da senha ainda não aplicada (módulos puros, sem navegador).
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appLabel, createOpenedStore, decideOpen, launchWatched, openConnection, passwordNotice, resolveScheme,
  schemeFromAppName, schemeOfUrl, watchOpened,
} from '../../src/nextec/connect-open.mjs'
import { prepareConnection } from '../../src/nextec/connect-flow.mjs'

const mem = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, raw: m }
}

test('esquema deriva do nome do app em minúsculas, sem nome fixo no código', () => {
  assert.equal(schemeFromAppName('Client-Nextec-Connect'), 'client-nextec-connect')
  assert.equal(schemeFromAppName('Outro-App'), 'outro-app')
  assert.equal(schemeFromAppName('RustDesk'), 'rustdesk')
  for (const ruim of ['', null, undefined, 42, 'a', '1app', 'Meu App', 'a_b', 'a.b', 'a://b', 'https', 'HTTP', 'javascript', 'data', 'x'.repeat(65)]) {
    assert.equal(schemeFromAppName(ruim), '', `deveria recusar ${JSON.stringify(ruim)}`)
  }
})

test('esquema do link: lê o protocolo e recusa os que o navegador trata de forma especial', () => {
  assert.equal(schemeOfUrl('client-nextec-connect://536822159?password=x'), 'client-nextec-connect')
  assert.equal(schemeOfUrl('RUSTDESK://1'), 'rustdesk')
  for (const ruim of ['', null, 'https://x', 'javascript://x', 'file:///c', 'sem-protocolo', '://x']) assert.equal(schemeOfUrl(ruim), '')
})

test('resolveScheme: servidor, depois nome do app, depois o link, depois o global configurado', () => {
  assert.equal(resolveScheme({ scheme: 'abc-app', appName: 'Outro', url: 'rustdesk://1', fallback: 'global' }), 'abc-app')
  assert.equal(resolveScheme({ appName: 'Client-Nextec-Connect', url: 'rustdesk://1', fallback: 'global' }), 'client-nextec-connect')
  assert.equal(resolveScheme({ url: 'nextec-connect://1', fallback: 'global' }), 'nextec-connect')
  assert.equal(resolveScheme({ fallback: 'global-app' }), 'global-app')
  assert.equal(resolveScheme({ scheme: 'https', appName: 'https', url: 'https://x', fallback: 'https' }), '')
  assert.equal(resolveScheme(), '')
})

test('rótulo do app: usa o nome informado e cai em texto genérico', () => {
  assert.equal(appLabel('Client-Nextec-Connect'), 'Client-Nextec-Connect')
  assert.equal(appLabel(''), 'aplicativo')
  assert.equal(appLabel('com espaco'), 'aplicativo')
})

test('lembrança por protocolo: grava, esquece e sobrevive a armazenamento quebrado', () => {
  const storage = mem()
  const store = createOpenedStore(storage, 'k', () => 1234)
  assert.equal(store.has('client-nextec-connect'), false)
  store.remember('client-nextec-connect')
  assert.equal(store.has('client-nextec-connect'), true)
  assert.equal(store.has('rustdesk'), false, 'a lembrança é por protocolo')
  assert.deepEqual(JSON.parse(storage.raw.get('k')), { 'client-nextec-connect': 1234 })
  store.forget('client-nextec-connect')
  assert.equal(store.has('client-nextec-connect'), false)
  store.remember('https') // protocolo proibido nunca é gravado
  assert.equal(store.has('https'), false)

  const quebrado = { getItem () { throw new Error('bloqueado') }, setItem () { throw new Error('bloqueado') } }
  const s2 = createOpenedStore(quebrado)
  assert.doesNotThrow(() => { s2.remember('rustdesk'); s2.forget('rustdesk') })
  assert.equal(s2.has('rustdesk'), false)
  const lixo = mem(); lixo.setItem('k', '{nao json'); assert.equal(createOpenedStore(lixo, 'k').has('rustdesk'), false)
  const lista = mem(); lista.setItem('k', '[1,2]'); assert.equal(createOpenedStore(lista, 'k').has('rustdesk'), false)
})

test('decisão: lembrado ou agente ativo abre direto; primeira vez mostra o diálogo', () => {
  assert.deepEqual(decideOpen({ remembered: true }), { mode: 'direct', reason: 'remembered' })
  assert.deepEqual(decideOpen({ agentActive: true }), { mode: 'direct', reason: 'agent' })
  assert.deepEqual(decideOpen({ remembered: true, agentActive: true }), { mode: 'direct', reason: 'remembered' })
  assert.deepEqual(decideOpen({}), { mode: 'dialog', reason: 'first' })
  assert.deepEqual(decideOpen(), { mode: 'dialog', reason: 'first' })
})

test('aviso de senha: só com agente ativo e primeira senha não aplicada, com a espera em minutos', () => {
  const now = 10000
  const base = { password_state: 'waiting_first', agent_active: true }
  const n = passwordNotice({ ...base, last_seen_at: now - 120 }, now)
  assert.equal(n.minutes, 3)
  assert.equal(n.text, 'A senha automática ainda não foi aplicada nesta máquina (próxima verificação em ~3 min). Você pode conectar e digitar a senha, ou aguardar.')
  const atrasado = passwordNotice({ ...base, last_seen_at: now - 400 }, now)
  assert.match(atrasado.text, /atrasada e deve ocorrer em instantes/)
  for (const link of [
    { ...base, agent_active: false, last_seen_at: now },
    { ...base, password_state: 'ready', last_seen_at: now },
    { ...base, password_state: 'none', last_seen_at: now },
    { ...base, password_state: 'restricted', last_seen_at: now },
    { ...base, password_state: 'pending_approval', last_seen_at: now },
    {}, null, undefined,
  ]) assert.equal(passwordNotice(link, now), null)
})

// ---------- detecção de abertura ----------
const fakeEnv = () => {
  const win = new EventTarget()
  const doc = new EventTarget()
  doc.visibilityState = 'visible'
  let fire = null
  let cleared = 0
  return {
    win, doc,
    setTimer: (fn) => { fire = fn; return 7 },
    clearTimer: () => { cleared++ },
    timeout: () => fire && fire(),
    get cleared () { return cleared },
  }
}

test('watchOpened: blur ou página oculta contam como aberto; sem isso, o prazo diz que não abriu', async () => {
  let e = fakeEnv()
  let p = watchOpened(e)
  e.win.dispatchEvent(new Event('blur'))
  assert.equal(await p, true)

  e = fakeEnv()
  p = watchOpened(e)
  e.doc.visibilityState = 'hidden'
  e.doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(await p, true)

  e = fakeEnv()
  p = watchOpened(e)
  e.doc.dispatchEvent(new Event('visibilitychange')) // continua visível: não vale
  e.timeout()
  assert.equal(await p, false)
  assert.ok(e.cleared >= 1)
  // depois de resolvido, eventos tardios não mudam nada nem vazam ouvintes
  e.win.dispatchEvent(new Event('blur'))
})

test('launchWatched aprende: abriu lembra, não abriu esquece', async () => {
  const store = createOpenedStore(mem(), 'k')
  const launched = []
  const common = { url: 'client-nextec-connect://1', scheme: 'client-nextec-connect', store, launch: u => launched.push(u) }
  assert.equal(await launchWatched({ ...common, watch: async () => true }), true)
  assert.equal(store.has('client-nextec-connect'), true)
  assert.equal(await launchWatched({ ...common, watch: async () => false }), false)
  assert.equal(store.has('client-nextec-connect'), false)
  assert.deepEqual(launched, ['client-nextec-connect://1', 'client-nextec-connect://1'])
})

// ---------- orquestração ----------
const rig = (link, remembered = []) => {
  const store = createOpenedStore(mem(), 'k')
  for (const s of remembered) store.remember(s)
  const calls = { launch: [], toast: [], dialog: [] }
  return {
    store, calls,
    deps: {
      url: link.url, link, store,
      launch: u => calls.launch.push(u),
      watch: async () => true,
      toast: t => calls.toast.push(t),
      dialog: d => calls.dialog.push(d),
    },
  }
}

test('primeira vez e sem agente: diálogo completo, nada é aberto antes do clique', async () => {
  const link = { url: 'client-nextec-connect://536822159', scheme: 'client-nextec-connect', app_name: 'Client-Nextec-Connect', agent_active: false }
  const r = rig(link)
  const out = await openConnection(r.deps)
  assert.equal(out.mode, 'dialog')
  assert.deepEqual(r.calls.launch, [])
  assert.equal(r.calls.toast.length, 0)
  assert.deepEqual(r.calls.dialog, [{ url: link.url, scheme: 'client-nextec-connect', appName: 'Client-Nextec-Connect' }])
})

test('app já aberto neste navegador: abre direto, com toast curto e sem diálogo', async () => {
  const link = { url: 'client-nextec-connect://536822159?password=x', scheme: 'client-nextec-connect', app_name: 'Client-Nextec-Connect' }
  const r = rig(link, ['client-nextec-connect'])
  const out = await openConnection(r.deps)
  assert.equal(out.mode, 'direct')
  assert.equal(out.reason, 'remembered')
  assert.deepEqual(r.calls.launch, [link.url])
  assert.equal(r.calls.dialog.length, 0)
  assert.equal(r.calls.toast.length, 1)
  assert.equal(r.calls.toast[0].appName, 'Client-Nextec-Connect')
  // "Não abriu?" leva ao diálogo completo
  r.calls.toast[0].notOpened()
  assert.equal(r.calls.dialog.length, 1)
})

test('agente ativo abre direto mesmo sem lembrança e passa a lembrar quando abriu', async () => {
  const link = { url: 'nextec-suporte://1', scheme: 'nextec-suporte', agent_active: true }
  const r = rig(link)
  const out = await openConnection(r.deps)
  assert.equal(out.reason, 'agent')
  assert.equal(out.opened, true)
  assert.equal(r.store.has('nextec-suporte'), true)
})

test('lembrança é por protocolo: outro app da outra máquina volta ao diálogo', async () => {
  const link = { url: 'outro-app://1', scheme: 'outro-app' }
  const r = rig(link, ['client-nextec-connect'])
  assert.equal((await openConnection(r.deps)).mode, 'dialog')
})

test('abriu direto e não respondeu: esquece a lembrança para a próxima vez cair no diálogo', async () => {
  const link = { url: 'client-nextec-connect://1', scheme: 'client-nextec-connect' }
  const r = rig(link, ['client-nextec-connect'])
  r.deps.watch = async () => false
  const out = await openConnection(r.deps)
  assert.equal(out.opened, false)
  assert.equal(r.store.has('client-nextec-connect'), false)
})

test('servidor antigo sem scheme: o protocolo vem do link e o global entra como fallback', async () => {
  const r = rig({ url: 'nextec-connect://1' }, ['nextec-connect'])
  assert.equal((await openConnection(r.deps)).scheme, 'nextec-connect')
  const r2 = rig({ url: 'sem-protocolo' }, [])
  r2.deps.fallbackScheme = 'global-app'
  assert.equal((await openConnection(r2.deps)).scheme, 'global-app')
})

// ---------- integração com o preparo da conexão ----------
const okSettings = { code: 0, data: { mode: 'off', scheme: 'rustdesk' } }
const deps = (data, review) => ({
  loadSettings: async () => okSettings,
  askTicket: async () => '',
  saveNote: async () => ({ code: 0 }),
  requestLink: async () => ({ code: 0, data }),
  reviewLink: review,
})

test('reviewLink recebe o estado da máquina e false cancela sem abrir nada', async () => {
  const data = { url: 'client-nextec-connect://1', password_state: 'waiting_first', agent_active: true, last_seen_at: 1 }
  let visto = null
  const cancelado = await prepareConnection('1', deps(data, async (id, link) => { visto = { id, link }; return false }))
  assert.equal(cancelado, null)
  assert.deepEqual(visto, { id: '1', link: data })
  const seguiu = await prepareConnection('1', deps(data, async () => true))
  assert.equal(seguiu.url, data.url)
  assert.deepEqual(seguiu.link, data)
  const semGancho = await prepareConnection('1', deps(data, undefined))
  assert.equal(semGancho.url, data.url)
})

test('o aviso nunca altera o link autorizado pelo servidor', async () => {
  const data = { url: 'client-nextec-connect://1?password=segredo', password_state: 'ready', agent_active: true }
  const r = await prepareConnection('1', deps(data, async (id, link) => { link.url = 'outro://x'; return true }))
  assert.equal(r.url, 'client-nextec-connect://1?password=segredo')
})
