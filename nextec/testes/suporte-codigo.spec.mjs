// Link por atendimento: cada linha mostra o código do atendimento (o token do link) em todos os estados, e o clique copia o
// código completo. A API é simulada com uma resposta no formato real da listagem.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'

const now = Math.floor(Date.now() / 1000)
const row = (id, token, status, extra = {}) => ({ id, token, label: 'Suporte rápido', ticket: '', status, created_at: now - 3600, expires_at: now + 3600, online: false, ...extra })
const LIST = [
  row(1, 'K7M2XP9Q', 'waiting'),
  row(2, 'ABCD2345', 'expired'),
  row(3, 'HJKL6789', 'connected', { peer_id: '422777974', peer_name: 'desktop-7ptksc7', online: true }),
  row(4, 'ZZ9988AA', 'revoked'),
  row(5, 'NP5QR6ST', 'downloaded'),
  row(6, 'QRSTUVWXYZ23456', 'waiting', { label: 'Código longo' }),
]

vi.mock('@/utils/request', () => {
  const fn = (cfg) => {
    const url = String((cfg && cfg.url) || '')
    const data = url.includes('/my/support/links') ? { list: LIST, has_app: true, queue_enabled: true } : { list: [], url: '' }
    return Promise.resolve({ code: 0, message: '', data })
  }
  fn.get = fn; fn.post = fn; fn.put = fn; fn.delete = fn
  fn.interceptors = { request: { use () {} }, response: { use () {} } }
  return { default: fn }
})

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const settle = async (n = 10) => { for (let i = 0; i < n; i++) { await nextTick(); await tick() } }
let app, host, SupportLinks, ElementPlus
const copied = []

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t) } }, configurable: true })
  ElementPlus = (await import('element-plus')).default
  SupportLinks = (await import('@/nextec/views/SupportLinks.vue')).default
})
afterEach(() => { if (app) app.unmount(); if (host) host.remove(); document.body.innerHTML = ''; app = null; copied.length = 0 })

async function mount () {
  app = createApp(SupportLinks)
  app.use(ElementPlus)
  host = document.createElement('div'); document.body.appendChild(host)
  app.mount(host)
  await settle()
}
const items = () => [...host.querySelectorAll('.nx-sl-list li')]
const badge = li => li.querySelector('button.nx-sl-code')

describe('Link por atendimento, código do atendimento na lista', () => {
  it('toda linha mostra o código, inclusive vencido e cancelado, e o título genérico fica distinguível', async () => {
    await mount()
    expect(items().length).toBe(LIST.length)
    const texts = items().map(li => badge(li) && badge(li).textContent.trim())
    expect(texts).toEqual(['K7M2-XP9Q', 'ABCD-2345', 'HJKL-6789', 'ZZ99-88AA', 'NP5Q-R6ST', 'QRSTUVWX…'])
    // linhas com o mesmo título "Suporte rápido" têm códigos diferentes
    const generic = items().filter(li => li.querySelector('strong').textContent.trim() === 'Suporte rápido')
    expect(new Set(generic.map(li => badge(li).textContent)).size).toBe(generic.length)
    // vencido e cancelado continuam sem botão Copiar link, mas com o código
    expect(items()[1].textContent).toContain('Vencido')
    expect(items()[3].textContent).toContain('Cancelado')
  })

  it('tooltip e acessibilidade trazem o código completo', async () => {
    await mount()
    expect(badge(items()[0]).getAttribute('title')).toContain('K7M2XP9Q')
    expect(badge(items()[5]).getAttribute('title')).toContain('QRSTUVWXYZ23456')
    expect(badge(items()[5]).getAttribute('aria-label')).toContain('QRSTUVWXYZ23456')
  })

  it('clicar copia o código completo, sem hífen, mesmo em linha vencida', async () => {
    await mount()
    badge(items()[1]).click(); await settle(2)
    badge(items()[0]).click(); await settle(2)
    badge(items()[5]).click(); await settle(2)
    expect(copied).toEqual(['ABCD2345', 'K7M2XP9Q', 'QRSTUVWXYZ23456'])
  })
})
