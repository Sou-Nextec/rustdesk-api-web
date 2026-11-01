// Link "Abrir no Connect" montado de verdade em jsdom, com o router, a guarda de login do upstream (src/permission.js) e a
// camada Nextec: o pedido sobrevive ao redirecionamento para o login, pede confirmação com o ID formatado, usa o caminho
// de conexão de sempre (/my/connect-link) e some da URL depois de tratado. A API é simulada.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { createApp, nextTick } from 'vue'

const state = { linkRequests: [] }
vi.mock('@/utils/request', () => {
  const fn = (opts) => {
    const url = opts && opts.url
    if (url === '/my/connect-settings') return Promise.resolve({ code: 0, data: { mode: 'off', scheme: 'rustdesk' } })
    return Promise.resolve({ code: 0, data: { list: [], total: 0 } })
  }
  fn.get = fn; fn.post = fn; fn.put = fn; fn.delete = fn
  fn.interceptors = { request: { use () {} }, response: { use () {} } }
  return { default: fn }
})

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const waitFor = async (cond, label) => {
  for (let i = 0; i < 150; i++) { if (cond()) return; await nextTick(); await tick(15) }
  throw new Error('tempo esgotado: ' + label)
}
const box = () => document.querySelector('.el-message-box')
const clickBox = (label) => [...document.querySelectorAll('.el-message-box__btns button')].find(b => b.textContent.trim() === label).click()
const toasts = () => [...document.querySelectorAll('.el-message')].map(m => m.textContent.replace(/\s+/g, ' ').trim()).join(' | ')
const closeAll = async () => {
  const { ElMessageBox, ElMessage } = await import('element-plus')
  ElMessageBox.close(); ElMessage.closeAll()
  await waitFor(() => !box(), 'fechar diálogos')
}

let app, host, router, pinia, useUserStore, useRouteStore, setToken, removeToken

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.scrollTo = () => {}
  window.fetch = vi.fn(async (url) => {
    const u = String(url)
    if (u.includes('/my/connect-link')) {
      state.linkRequests.push(new URL(u, 'http://x').searchParams.get('id'))
      return { ok: true, json: async () => ({ code: 0, data: { url: 'rustdesk://123456789', scheme: 'rustdesk' } }) }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try { localStorage.clear(); sessionStorage.clear() } catch (e) { /* jsdom */ }
  // quem chega pelo link do Sentinela sem sessão: o hash já traz o pedido quando o painel carrega
  window.location.hash = '#/my/peer?conectar=123%20456%20789'

  const ElementPlus = (await import('element-plus')).default
  router = (await import('@/router')).router
  pinia = (await import('@/store')).pinia
  ;({ setToken, removeToken } = await import('@/utils/auth'))
  await import('@/permission')
  const nextec = (await import('@/nextec')).default
  const App = (await import('@/App.vue')).default
  useUserStore = (await import('@/store/user')).useUserStore
  useRouteStore = (await import('@/store/router')).useRouteStore
  app = createApp(App)
  app.use(ElementPlus)
  const icons = await import('@element-plus/icons')
  for (const k in icons) app.component('ElIcon' + k, icons[k])
  app.use(nextec)
  app.use(pinia)
  app.use(router)
  host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  app.mount(host)
})

afterAll(() => { app && app.unmount() })
beforeEach(() => { state.linkRequests = [] })

const entrar = () => {
  // o que o login faz: grava o token, carrega as rotas e volta para o ?redirect=
  setToken('token-de-teste')
  useUserStore(pinia).$patch({ route_names: ['*'] })
  useRouteStore(pinia).addRoutes(['*'])
}

describe('link Abrir no Connect (?conectar=<ID>)', () => {
  it('sem sessão: vai para o login sem perguntar nada e o pedido fica guardado', async () => {
    await router.isReady()
    await waitFor(() => router.currentRoute.value.path === '/login', 'ir para o login')
    expect(router.currentRoute.value.query.redirect).toBe('/my/peer')
    await tick(100)
    expect(box()).toBeNull()
    expect(sessionStorage.getItem('nx-conectar-pendente')).toContain('123 456 789')
  })

  it('depois de entrar: pergunta com o ID formatado, filtra a lista e só conecta ao confirmar', async () => {
    entrar()
    await router.push({ path: router.currentRoute.value.query.redirect || '/', replace: true })
    await waitFor(() => box(), 'confirmação')
    expect(box().textContent).toContain('Conectar ao dispositivo 123 456 789?')
    expect(state.linkRequests).toEqual([])
    expect(sessionStorage.getItem('nx-conectar-pendente')).toBeNull()
    await waitFor(() => router.currentRoute.value.query.q === '123456789', 'filtro da lista')
    expect(router.currentRoute.value.query.conectar).toBeUndefined()
    clickBox('Conectar')
    await waitFor(() => state.linkRequests.length === 1, 'pedir o link ao servidor')
    expect(state.linkRequests).toEqual(['123456789'])
    await closeAll()
  })

  it('logado: link direto pergunta, cancelar não conecta e recarregar a URL não pergunta de novo', async () => {
    await router.push('/home')
    await router.push('/my/peer?conectar=987654321')
    await waitFor(() => box(), 'confirmação')
    expect(box().textContent).toContain('Conectar ao dispositivo 987 654 321?')
    expect(router.currentRoute.value.query.conectar).toBeUndefined()
    clickBox('Cancelar')
    await waitFor(() => !box(), 'fechar')
    await router.push('/home')
    await router.push(router.resolve({ path: '/my/peer', query: { q: '987654321' } }).fullPath)
    await tick(150)
    expect(box()).toBeNull()
    expect(state.linkRequests).toEqual([])
  })

  it('ID inválido: aviso claro, nada é aberto e a URL é limpa', async () => {
    await router.push('/home')
    await router.push('/my/peer?conectar=abc%3Fpassword%3Dx')
    await waitFor(() => toasts().includes('ID de dispositivo inválido'), 'aviso')
    expect(toasts()).toContain('Nada foi aberto')
    expect(box()).toBeNull()
    expect(router.currentRoute.value.query.conectar).toBeUndefined()
    await tick(100)
    expect(state.linkRequests).toEqual([])
    await closeAll()
  })

  it('sessão expirada no meio: o link volta a esperar o login', async () => {
    removeToken()
    useUserStore(pinia).$patch({ route_names: [] })
    await router.push('/login?redirect=/my/peer&conectar=111222333')
    await tick(100)
    expect(box()).toBeNull()
    expect(sessionStorage.getItem('nx-conectar-pendente')).toContain('111222333')
  })

  it('regressão: link aberto numa aba já carregada e sem sessão sobrevive à guarda de login', async () => {
    sessionStorage.clear()
    await router.push('/login')
    // só o hash muda: a carga do painel não roda de novo e a guarda redireciona para o login sem o parâmetro
    window.location.hash = '#/my/peer?conectar=444555666'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => router.currentRoute.value.path === '/login', 'voltar ao login')
    await tick(100)
    expect(box()).toBeNull()
    expect(sessionStorage.getItem('nx-conectar-pendente')).toContain('444555666')
    entrar()
    await router.push({ path: '/my/peer', replace: true })
    await waitFor(() => box(), 'confirmação depois de entrar')
    expect(box().textContent).toContain('Conectar ao dispositivo 444 555 666?')
    clickBox('Cancelar')
    await waitFor(() => !box(), 'fechar')
    expect(state.linkRequests).toEqual([])
  })
})
