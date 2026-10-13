// Navegação real do painel: monta o App com o router, o layout e as telas Nextec e percorre as rotas em sequência
// (A, B, A, C...). Falha se houver erro de render, rejeição não tratada, tela vazia ou RenderGuard preso.
// A API é simulada; o que se valida é o ciclo de montar e desmontar as telas.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('@/utils/request', () => {
  const body = () => ({
    code: 0, message: '', data: {
      list: [], total: 0, devices: [], policies: [], blocked: [], groups: [], sessions: [], rows: [], items: [],
      releases: [], keys: [], tags: [], collections: [], enabled: false, config: {}, settings: {},
    },
  })
  const fn = () => Promise.resolve(body())
  fn.get = fn; fn.post = fn; fn.put = fn; fn.delete = fn
  fn.interceptors = { request: { use () {} }, response: { use () {} } }
  return { default: fn }
})

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms))
// espera a tela nova (import dinâmico + transição) por até 5 s; vazia depois disso é defeito
const conteudo = () => { const m = document.querySelector('.app-main'); return m ? m.innerHTML.replace(/<!--.*?-->/g, '').trim() : '' }
async function settle () {
  for (let i = 0; i < 100; i++) { await nextTick(); await tick(50); if (conteudo()) break }
  await tick(60) // deixa a transição de saída terminar
}

const errors = []
let app, host, router, pinia

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.scrollTo = () => {}
  window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)))
  process.on('unhandledRejection', r => errors.push('unhandledRejection: ' + (r && r.message || r)))
  const origError = console.error
  console.error = (...a) => { errors.push('console.error: ' + a.map(x => (x && x.message) || String(x)).join(' ').slice(0, 400)); }
  console.error.orig = origError
  const warn = console.warn
  console.warn = (...a) => {
    const t = a.map(String).join(' ')
    // avisos do Vue que indicam o defeito de navegação (transição sobre raiz sem elemento, componente sem elemento etc.)
    if (/Transition|non-element root|Extraneous non-props|Unhandled error|Failed to resolve component/.test(t)) errors.push('warn: ' + t.slice(0, 400))
    else warn(...a)
  }

  const ElementPlus = (await import('element-plus')).default
  const { router: r } = await import('@/router')
  const { pinia: p } = await import('@/store')
  const nextec = (await import('@/nextec')).default
  const App = (await import('@/App.vue')).default
  const { useRouteStore } = await import('@/store/router')
  const { useUserStore } = await import('@/store/user')
  router = r; pinia = p
  app = createApp(App)
  app.config.errorHandler = (err, _i, info) => { errors.push('errorHandler: ' + info + ' ' + (err && err.message || err)) }
  app.use(ElementPlus)
  const icons = await import('@element-plus/icons')
  for (const k in icons) app.component('ElIcon' + k, icons[k])
  app.use(nextec)
  app.use(pinia)
  const user = useUserStore(pinia)
  user.route_names = ['*']
  useRouteStore(pinia).addRoutes(['*'])
  app.use(router)
  host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  app.mount(host)
})

afterAll(() => { app && app.unmount() })

const main = () => host.querySelector('.app-main')
// por nome de rota (os caminhos mudam; os nomes são o contrato do menu)
const A = {
  secrets: 'NxSecrets', peer: 'Peer', generator: 'NxGenerator', people: 'UserList', updates: 'NxUpdates', clients: 'DeviceGroup',
  support: 'NxSupport', report: 'NxReport', policies: 'NxPolicies', sessions: 'NxSessions', access: 'NxClientAccess', home: 'NxHome',
  groups: 'UserGroup', server: 'ServerCmd',
}
const SEQUENCE = process.env.NX_SEQ ? process.env.NX_SEQ.split(',').map(k => A[k]) : [
  A.secrets, A.people, A.secrets, A.generator, A.peer, A.secrets, A.people, A.secrets,
  A.updates, A.clients, A.peer, A.secrets, A.support, A.report, A.policies, A.sessions,
  A.access, A.home, A.secrets, A.people, A.generator, A.updates, A.clients, A.groups, A.server, A.home, A.secrets, A.peer,
]

describe('navegação do painel', () => {
  it('as rotas Nextec existem no router', () => {
    for (const n of Object.values(A)) {
      expect(router.hasRoute(n), n).toBe(true)
    }
  })

  it('percorre A, B, A, C sem erro e com conteúdo em todas as telas', async () => {
    const vazias = []
    for (const name of SEQUENCE) {
      const path = name
      await router.push({ name })
      expect(router.currentRoute.value.name, 'rota ' + name).toBe(name)
      await settle()
      const m = main()
      const html = m ? m.innerHTML.replace(/<!--.*?-->/g, '').trim() : ''
      if (!html) { vazias.push(path); if (process.env.NX_DEBUG) console.log('VAZIA', path, router.currentRoute.value.fullPath, (main() ? main().outerHTML : 'sem .app-main').slice(0, 600), JSON.stringify(errors)) }
      expect(host.querySelector('.nx-render-guard'), 'RenderGuard preso em ' + path).toBeNull()
    }
    expect(vazias, 'telas vazias').toEqual([])
    expect(errors).toEqual([])
  })

  it('toda tela do menu abre, alterna com Senhas dos servidores e volta sem erro', async () => {
    const { asyncRoutes } = await import('@/router')
    const nomes = []
    const coletar = (rs) => rs.forEach(r => {
      if (r.children && r.children.length) coletar(r.children)
      else if (r.name && !/[:*]/.test(r.path) && !r.meta?.hide && !r.redirect) nomes.push(r.name)
    })
    coletar(asyncRoutes.filter(r => r.name !== 'My' && !String(r.name).startsWith('NxMy_')))
    expect(nomes.length).toBeGreaterThan(10)
    const vazias = []
    for (const name of [...new Set(nomes)]) {
      for (const alvo of [A.secrets, name, A.secrets]) {
        await router.push({ name: alvo })
        await settle()
        if (!conteudo()) vazias.push(`${alvo} (apos ${name})`)
        expect(host.querySelector('.nx-render-guard'), 'RenderGuard preso em ' + alvo).toBeNull()
      }
    }
    expect(vazias, 'telas vazias').toEqual([])
    expect(errors).toEqual([])
  })
})
