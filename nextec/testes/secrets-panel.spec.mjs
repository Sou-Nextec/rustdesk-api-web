// Montagem real da tela "Senhas dos servidores" em jsdom, nos quatro estados do fluxo guiado:
// sem cliente, sem agente, senha automática desligada e pronta, mais o estado vazio.
// A API é simulada; o que se valida é o que a pessoa vê: botão primário por máquina, CTA do topo e diálogos.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'

const state = { devices: [], groups: [{ id: 7, name: 'Cobraq' }] }
vi.mock('@/utils/request', () => {
  const fn = (opts) => {
    const url = opts && opts.url
    if (url === '/nextec/secrets') return Promise.resolve({ code: 0, data: { devices: state.devices, policies: [], blocked: [] } })
    if (url === '/device_group/list') return Promise.resolve({ code: 0, data: { list: state.groups, total: state.groups.length } })
    return Promise.resolve({ code: 0, data: { list: [] } })
  }
  fn.get = fn; fn.post = fn
  fn.interceptors = { request: { use () {} }, response: { use () {} } }
  return { default: fn }
})

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const semCliente = { peer_id: '536822159', alias: 'servidor', group_id: 0, enrolled: false, managed: false }
const semAgente = { peer_id: '222222222', alias: 'srv-agente', group_id: 7, enrolled: false, managed: false }
const semRegra = { peer_id: '333333333', alias: 'srv-regra', group_id: 7, enrolled: true, managed: false, last_seen_at: Date.now() / 1000 }
const pronta = { peer_id: '444444444', alias: 'srv-pronto', group_id: 7, enrolled: true, managed: true, has_password: true, version: 2, interval_minutes: 180, last_seen_at: Date.now() / 1000 }

let ElementPlus, icons, Panel, pinia
let app, host

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.scrollTo = () => {}
  ElementPlus = (await import('element-plus')).default
  icons = await import('@element-plus/icons')
  pinia = (await import('@/store')).pinia
  Panel = (await import('@/nextec/views/SecretsPanel.vue')).default
})

async function mount (devices) {
  state.devices = devices
  app = createApp(Panel)
  app.use(ElementPlus)
  app.use(pinia)
  for (const k in icons) app.component('ElIcon' + k, icons[k])
  app.component('RouterLink', { template: '<a><slot/></a>' })
  host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  for (let i = 0; i < 20; i++) { await nextTick(); await tick() }
}

beforeEach(() => { try { localStorage.removeItem('nx-secrets-how-open') } catch (e) { /* jsdom */ } })
afterEach(() => { if (app) app.unmount(); if (host) host.remove(); document.body.innerHTML = ''; app = null })

const rowTexts = () => [...host.querySelectorAll('.el-table__body tr')].map(tr => tr.textContent.replace(/\s+/g, ' '))
const buttons = (root = host) => [...root.querySelectorAll('button')].map(b => b.textContent.trim())

describe('Senhas dos servidores, fluxo guiado', () => {
  it('estado 1, sem cliente: CTA do topo e botão Escolher cliente na linha', async () => {
    await mount([semCliente])
    expect(host.querySelector('.nx-hero-title').textContent).toBe('Você tem 1 máquina sem cliente.')
    expect(host.querySelector('.nx-hero-cta').textContent.trim()).toBe('Escolher cliente')
    const row = rowTexts().find(t => t.includes('servidor'))
    expect(row).toContain('Sem cliente')
    expect(row).toContain('Etapa 1 de 3: Cliente')
    expect(row).toContain('Escolher cliente')
    expect(host.querySelectorAll('.nx-next').length).toBe(1)
  })

  it('estado 2, com cliente e sem agente: Instalar agente', async () => {
    await mount([semAgente])
    const row = rowTexts().find(t => t.includes('srv-agente'))
    expect(row).toContain('Cobraq')
    expect(row).toContain('Etapa 2 de 3: Agente')
    expect(row).toContain('Instalar agente')
    expect(host.querySelector('.nx-hero-cta').textContent.trim()).toBe('Instalar agente')
  })

  it('estado 3, agente cadastrado e regra desligada: Ligar senha automática', async () => {
    await mount([semRegra])
    const row = rowTexts().find(t => t.includes('srv-regra'))
    expect(row).toContain('Etapa 3 de 3: Senha automática')
    expect(row).toContain('Ligar senha automática')
    expect(host.querySelector('.nx-hero-cta').textContent.trim()).toBe('Ligar senha automática')
  })

  it('estado 4, pronta: Conectar e sem CTA no topo', async () => {
    await mount([pronta])
    const row = rowTexts().find(t => t.includes('srv-pronto'))
    expect(row).toContain('Tudo pronto')
    expect(row).toContain('Conectar')
    expect(host.querySelector('.nx-hero-cta')).toBeNull()
    expect(host.querySelector('.nx-hero-title').textContent).toContain('Tudo pronto')
  })

  it('o stepper é acessível: lista com etapa atual marcada e texto para leitor de tela', async () => {
    await mount([semAgente])
    const steps = host.querySelectorAll('.nx-steps-list .nx-step')
    expect(steps.length).toBe(3)
    expect(steps[1].getAttribute('aria-current')).toBe('step')
    expect(steps[0].textContent).toContain('Cliente: concluída')
    expect(steps[2].textContent).toContain('Senha automática: pendente')
  })

  it('o Como funciona abre, recolhe e guarda a escolha; ações secundárias ficam em Mais', async () => {
    await mount([semCliente])
    const toggle = host.querySelector('.nx-how-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelectorAll('.nx-how-list li').length).toBe(3)
    toggle.click()
    await nextTick()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('nx-secrets-how-open')).toBe('0')
    const barra = buttons(host.querySelector('.nx-bar'))
    expect(barra).toEqual(expect.arrayContaining(['Atualizar', 'Mais']))
    for (const t of ['Regras', 'Auditoria', 'Credencial de inscrição', 'Autorização individual']) expect(barra).not.toContain(t)
  })

  it('Escolher cliente abre o diálogo curto na própria tela', async () => {
    await mount([semCliente])
    host.querySelector('.nx-next').click()
    for (let i = 0; i < 5; i++) { await nextTick(); await tick() }
    const dlg = document.body.textContent
    expect(dlg).toContain('Escolher cliente')
    expect(dlg).toContain('Criar cliente')
    expect(dlg).toContain('Confirmar e seguir')
  })

  it('Instalar agente abre o passo a passo com a máquina já escolhida e o aviso de link público', async () => {
    await mount([semAgente])
    host.querySelector('.nx-next').click()
    for (let i = 0; i < 5; i++) { await nextTick(); await tick() }
    const txt = document.body.textContent
    expect(txt).toContain('Dê duplo clique como administrador')
    expect(txt).toContain('Não envie o arquivo por link público')
    expect(txt).not.toContain('assistente local')
    expect(txt).toContain('Baixar arquivo de ativação')
    expect(document.body.querySelector('.nx-agent-warn')).toBeNull()
  })

  it('lista vazia: o estado vazio explica o próximo passo e oferece a credencial', async () => {
    await mount([])
    expect(host.querySelector('.nx-hero-title').textContent).toContain('Nenhuma máquina ainda')
    expect(host.textContent).toContain('aguarde 1 minuto')
    expect(host.querySelector('.nx-hero-cta').textContent.trim()).toBe('Ver credencial de inscrição')
  })
})
