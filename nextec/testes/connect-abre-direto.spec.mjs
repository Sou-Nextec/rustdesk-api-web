// Montagem real da tela "Senhas dos servidores" e do Acesso rápido em jsdom: o botão Conectar abre o app direto
// (sem o diálogo) quando já abriu antes ou a máquina tem agente ativo, usa o protocolo DA MÁQUINA e avisa quando a
// senha automática ainda não foi aplicada. A API é simulada; o que se valida é o que a pessoa vê e o que é aberto.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'

const state = { devices: [], groups: [{ id: 7, name: 'Cobraq' }], link: null, rotates: [] }
vi.mock('@/utils/request', () => {
  const fn = (opts) => {
    const url = opts && opts.url
    if (url === '/nextec/secrets') return Promise.resolve({ code: 0, data: { devices: state.devices, policies: [], blocked: [] } })
    if (url === '/device_group/list') return Promise.resolve({ code: 0, data: { list: state.groups, total: state.groups.length } })
    if (url === '/my/connect-settings') return Promise.resolve({ code: 0, data: { mode: 'off', scheme: 'rustdesk' } })
    if (url === '/nextec/secrets/rotate') { state.rotates.push(opts.data.id); return Promise.resolve({ code: 0, data: {} }) }
    return Promise.resolve({ code: 0, data: { list: [] } })
  }
  fn.get = fn; fn.post = fn
  fn.interceptors = { request: { use () {} }, response: { use () {} } }
  return { default: fn }
})

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const waitFor = async (cond, label) => {
  for (let i = 0; i < 80; i++) { if (cond()) return; await nextTick(); await tick(15) }
  throw new Error('tempo esgotado: ' + label)
}
const pronta = { peer_id: '536822159', alias: 'srv-pronto', group_id: 7, enrolled: true, managed: true, has_password: true, version: 2, interval_minutes: 180, last_seen_at: Date.now() / 1000, app_name: 'Client-Nextec-Connect' }

let ElementPlus, icons, Panel, Quick, pinia, useUserStore
let app, host, clicks, anchorSpy

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.scrollTo = () => {}
  ElementPlus = (await import('element-plus')).default
  icons = await import('@element-plus/icons')
  pinia = (await import('@/store')).pinia
  useUserStore = (await import('@/store/user')).useUserStore
  Panel = (await import('@/nextec/views/SecretsPanel.vue')).default
  Quick = (await import('@/nextec/views/QuickAccess.vue')).default
})

async function mount (component, props = {}) {
  app = createApp(component, props)
  app.use(ElementPlus)
  app.use(pinia)
  for (const k in icons) app.component('ElIcon' + k, icons[k])
  app.component('RouterLink', { template: '<a><slot/></a>' })
  host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  for (let i = 0; i < 12; i++) { await nextTick(); await tick() }
}

const linkOf = (extra = {}) => ({
  url: 'client-nextec-connect://536822159?password=opaque', auto_password: true, scheme: 'client-nextec-connect',
  scheme_source: 'machine', app_name: 'Client-Nextec-Connect', agent_enrolled: true, agent_active: true,
  password_state: 'ready', last_seen_at: Date.now() / 1000, ...extra,
})

beforeEach(() => {
  state.rotates = []
  clicks = []
  try { localStorage.clear() } catch (e) { /* jsdom */ }
  useUserStore(pinia).$patch({ route_names: [] })
  window.fetch = vi.fn(async (url) => {
    if (String(url).includes('/my/connect-link')) return { ok: true, json: async () => ({ code: 0, data: state.link }) }
    return { ok: false, json: async () => ({}) }
  })
  anchorSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push(this.getAttribute('href')) })
})
afterEach(() => {
  anchorSpy.mockRestore()
  if (app) app.unmount()
  if (host) host.remove()
  document.body.innerHTML = ''
  app = null
})

const dialog = () => document.querySelector('.el-message-box')
const dialogButtons = () => [...document.querySelectorAll('.el-message-box__btns button')].map(b => b.textContent.trim())
const clickDialog = (label) => [...document.querySelectorAll('.el-message-box__btns button')].find(b => b.textContent.trim() === label).click()
const toastText = () => [...document.querySelectorAll('.el-message')].map(m => m.textContent.replace(/\s+/g, ' ').trim()).join(' | ')
const connectNow = async () => { host.querySelector('.nx-next').click() }
const protocolClicks = () => clicks.filter(h => h && h !== '#')

describe('Conectar abre o app direto', () => {
  it('app já aberto antes neste navegador: abre na hora, sem diálogo, só o toast curto', async () => {
    state.devices = [pronta]
    state.link = linkOf({ agent_active: false })
    localStorage.setItem('nx-app-opened', JSON.stringify({ 'client-nextec-connect': Date.now() }))
    await mount(Panel)
    await connectNow()
    await waitFor(() => protocolClicks().length === 1, 'abrir o protocolo')
    expect(protocolClicks()[0]).toBe('client-nextec-connect://536822159?password=opaque')
    expect(dialog()).toBeNull()
    expect(toastText()).toContain('Abrindo o Client-Nextec-Connect...')
    expect(toastText()).toContain('Não abriu? Baixar aplicativo')
  })

  it('máquina com agente ativo: abre direto mesmo na primeira vez, com o protocolo da máquina', async () => {
    state.devices = [pronta]
    state.link = linkOf({ url: 'outro-app://536822159', scheme: 'outro-app', app_name: 'Outro-App', auto_password: false })
    await mount(Panel)
    await connectNow()
    await waitFor(() => protocolClicks().length === 1, 'abrir o protocolo')
    expect(protocolClicks()[0]).toBe('outro-app://536822159')
    expect(dialog()).toBeNull()
    expect(toastText()).toContain('Abrindo o Outro-App...')
  })

  it('primeira vez e sem agente ativo: o diálogo completo aparece e só o clique abre o app', async () => {
    state.devices = [pronta]
    state.link = linkOf({ agent_active: false, agent_enrolled: false, password_state: 'none', auto_password: false, url: 'rustdesk://536822159', scheme: 'rustdesk', scheme_source: 'global', app_name: '' })
    await mount(Panel)
    await connectNow()
    await waitFor(() => dialog(), 'diálogo')
    expect(dialog().textContent).toContain('Abra o aplicativo instalado para iniciar a conexão')
    expect(dialog().textContent).toContain('autorize a abertura do aplicativo')
    expect(dialogButtons()).toEqual(expect.arrayContaining(['Abrir aplicativo', 'Baixar aplicativo']))
    expect(protocolClicks()).toEqual([])
    clickDialog('Abrir aplicativo')
    await waitFor(() => protocolClicks().length === 1, 'abrir após o clique')
    expect(protocolClicks()[0]).toBe('rustdesk://536822159')
  })

  it('"Não abriu? Baixar aplicativo" no toast leva ao diálogo completo', async () => {
    state.devices = [pronta]
    state.link = linkOf()
    await mount(Panel)
    await connectNow()
    await waitFor(() => document.querySelector('.el-message a'), 'link do toast')
    expect(dialog()).toBeNull()
    // O click() de <a> está simulado para registrar protocolos; o link do toast recebe o evento de verdade.
    document.querySelector('.el-message a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await waitFor(() => dialog(), 'diálogo completo')
    expect(dialogButtons()).toEqual(expect.arrayContaining(['Abrir aplicativo', 'Baixar aplicativo']))
  })
})

describe('Senha automática ainda não aplicada', () => {
  const aguardando = { ...pronta, has_password: false }
  const link = () => linkOf({ password_state: 'waiting_first', auto_password: false, url: 'client-nextec-connect://536822159', last_seen_at: Date.now() / 1000 - 20 })

  it('avisa com o tempo da próxima verificação e nunca abre antes de a pessoa escolher', async () => {
    state.devices = [aguardando]
    state.link = link()
    await mount(Panel)
    await connectNow()
    await waitFor(() => dialog(), 'aviso')
    const t = dialog().textContent.replace(/\s+/g, ' ')
    expect(t).toContain('A senha automática ainda não foi aplicada nesta máquina (próxima verificação em ~1 min).')
    expect(t).toContain('Você pode conectar e digitar a senha, ou aguardar.')
    expect(dialogButtons()).toEqual(expect.arrayContaining(['Conectar mesmo assim']))
    expect(dialogButtons()).not.toContain('Trocar agora')
    expect(protocolClicks()).toEqual([])
    clickDialog('Conectar mesmo assim')
    await waitFor(() => protocolClicks().length === 1, 'abrir depois de conectar mesmo assim')
    expect(protocolClicks()[0]).toBe('client-nextec-connect://536822159')
  })

  it('quem é administrador pode pedir a troca e a conexão não abre', async () => {
    useUserStore(pinia).$patch({ route_names: ['*'] })
    state.devices = [aguardando]
    state.link = link()
    await mount(Panel)
    await connectNow()
    await waitFor(() => dialog(), 'aviso')
    expect(dialogButtons()).toEqual(expect.arrayContaining(['Trocar agora', 'Conectar mesmo assim']))
    clickDialog('Trocar agora')
    await waitFor(() => state.rotates.length === 1, 'pedido de troca')
    expect(state.rotates).toEqual(['536822159'])
    await tick(100)
    expect(protocolClicks()).toEqual([])
  })

  it('aguardar não abre nada e não registra troca', async () => {
    state.devices = [aguardando]
    state.link = link()
    await mount(Panel)
    await connectNow()
    await waitFor(() => dialog(), 'aviso')
    clickDialog('Aguardar')
    await tick(100)
    expect(protocolClicks()).toEqual([])
    expect(state.rotates).toEqual([])
  })
})

describe('Acesso rápido usa o mesmo caminho', () => {
  it('Conectar de um favorito abre direto quando a máquina tem agente ativo', async () => {
    localStorage.setItem('nx-quick-anon', JSON.stringify({ favorites: [{ id: '536822159', label: 'srv-pronto' }], recents: [] }))
    state.link = linkOf({ auto_password: false, url: 'client-nextec-connect://536822159' })
    await mount(Quick)
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Conectar')
    expect(btn).toBeTruthy()
    btn.click()
    await waitFor(() => protocolClicks().length === 1, 'abrir o protocolo')
    expect(dialog()).toBeNull()
    expect(protocolClicks()[0]).toBe('client-nextec-connect://536822159')
  })
})
