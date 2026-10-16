// Fluxo integrado de exclusão em "Itens gerados": a resposta REAL do endpoint do rdgen
// (fixtures/geracoes-contrato.json, gerada pelo teste Django test_contract_fixture_for_panel)
// monta a tela e o clique em Excluir percorre diálogo e chamada ao servidor.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const contract = JSON.parse(readFileSync(resolve(process.cwd(), 'nextec/testes/fixtures/geracoes-contrato.json'), 'utf-8'))
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const settle = async (n = 10) => { for (let i = 0; i < n; i++) { await nextTick(); await tick() } }

let ElementPlus, icons, GeneratedClients, app, host, calls

function fakeFetch(listing) {
  return vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' })
    const json = body => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body })
    if ((init.method || 'GET') === 'DELETE') {
      const uuid = String(url).match(/geracoes\/([^/]+)\/excluir/)[1]
      if (uuid === contract.imported_uuid && !String(url).includes('confirmar=1')) {
        return { ok: false, status: 409, headers: { get: () => 'application/json' }, json: async () => contract.delete_imported_without_confirm }
      }
      return json({ deleted: [uuid], blocked: [] })
    }
    return json(listing)
  })
}

beforeAll(async () => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.scrollTo = () => {}
  ElementPlus = (await import('element-plus')).default
  icons = await import('@element-plus/icons')
  GeneratedClients = (await import('@/nextec/views/GeneratedClients.vue')).default
})

async function mount(listing) {
  calls = []
  globalThis.fetch = fakeFetch(listing)
  app = createApp(GeneratedClients)
  app.use(ElementPlus)
  for (const k in icons) app.component('ElIcon' + k, icons[k])
  app.component('RouterLink', { template: '<a><slot/></a>' })
  app.config.globalProperties.$router = { push () {} }
  host = document.createElement('div'); document.body.appendChild(host)
  app.mount(host)
  await settle()
}
afterEach(() => { if (app) app.unmount(); if (host) host.remove(); document.body.innerHTML = ''; app = null })

const cards = () => [...host.querySelectorAll('.nx-generation')]
const removeButton = li => li && li.querySelector('button.nx-remove')
const dialog = () => document.querySelector('.el-message-box')

describe('Itens gerados, exclusão com a resposta real do rdgen', () => {
  it('item importado: botão Excluir visível, aviso no diálogo e chamada com confirmar=1', async () => {
    const imported = contract.listing.results.find(i => i.uuid === contract.imported_uuid)
    expect(imported.deletable).toBe(true)
    await mount({ ...contract.listing, results: [imported] })
    const button = removeButton(cards()[0])
    expect(button).toBeTruthy()
    button.click(); await settle()
    expect(dialog()).toBeTruthy()
    expect(dialog().textContent).toContain('já foi enviado para Atualizações')
    const confirm = dialog().querySelector('.el-message-box__btns .el-button--primary')
    expect(confirm.textContent.trim()).toBe('Excluir mesmo assim')
    confirm.click(); await settle()
    const deletes = calls.filter(c => c.method === 'DELETE')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].url).toContain(`/${contract.imported_uuid}/excluir/?confirmar=1`)
  })

  it('item importado: cancelar no diálogo não chama o servidor', async () => {
    const imported = contract.listing.results.find(i => i.uuid === contract.imported_uuid)
    await mount({ ...contract.listing, results: [imported] })
    removeButton(cards()[0]).click(); await settle()
    dialog().querySelectorAll('.el-message-box__btns button')[0].click(); await settle()
    expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(0)
  })

  it('item em andamento: sem botão Excluir nem caixa de seleção', async () => {
    const running = contract.listing.results.find(i => i.uuid === contract.in_progress_uuid)
    expect(running.deletable).toBe(false)
    await mount({ ...contract.listing, results: [running] })
    expect(cards()).toHaveLength(1)
    expect(removeButton(cards()[0])).toBeFalsy()
    expect(cards()[0].querySelector('.el-checkbox')).toBeFalsy()
  })

  it('item com falha: exclui com confirmação simples, sem confirmar=1', async () => {
    const failed = contract.listing.results.find(i => i.uuid === contract.failed_uuid)
    await mount({ ...contract.listing, results: [failed] })
    removeButton(cards()[0]).click(); await settle()
    expect(dialog().textContent).not.toContain('Atualizações')
    dialog().querySelector('.el-message-box__btns .el-button--primary').click(); await settle()
    const deletes = calls.filter(c => c.method === 'DELETE')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].url).not.toContain('confirmar')
  })
})
