// Conectar por ID. Pede ao painel o link: em máquinas com senha automática ele já leva a senha vigente
// (rustdesk://<id>?password=...), então quem pode acessar a máquina só clica e entra.
// Falhas de permissão ou rede são exibidas sem abrir uma conexão alternativa silenciosa.
// O protocolo é o do app instalado (um app gerado como Nextec-Connect registra nextec-connect://); admin define em Gerar cliente.
import { ElMessage, ElMessageBox } from 'element-plus'
import { getToken } from '@/utils/auth'
import { connectSettings, connectNote } from './api'
import { useQuickAccess } from './quick-access'

function abrir (url) {
  // The final click must keep browser user activation after the API request.
  ElMessageBox.confirm(
    'Abra o aplicativo instalado para iniciar a conexão. Se o navegador pedir, autorize a abertura do Nextec-Connect.',
    'Conectar ao dispositivo', {
      confirmButtonText: 'Abrir aplicativo', cancelButtonText: 'Cancelar',
      beforeClose: (action, instance, done) => {
        if (action === 'confirm') {
          const a = document.createElement('a')
          a.href = url
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          a.remove()
        }
        done()
      },
    }).catch(() => {})
}

// Chamado na conexão (opcional, ligado pelo admin em Auditoria > Relatório mensal). O último número fica pré-preenchido na sessão.
const TICKET_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/
let settingsCache = null
async function loadSettings () {
  if (!settingsCache || Date.now() - settingsCache.at > 60000) {
    const res = await connectSettings().catch(() => false)
    settingsCache = {
      at: Date.now(),
      mode: res && res.data ? res.data.mode : 'off',
      scheme: res && res.data && res.data.scheme ? res.data.scheme : 'rustdesk',
    }
  }
  return settingsCache
}
async function ticketMode () {
  return (await loadSettings()).mode
}

// Link simples <protocolo>://<id> (telas do upstream que só abrem o app, sem senha automática nem chamado)
export async function connectLink (id) {
  const { scheme } = await loadSettings()
  abrir(`${scheme}://${encodeURIComponent(String(id).replace(/\s+/g, ''))}`)
}
// devolve false se a pessoa cancelou; senão registra o chamado (sem travar a conexão se o registro falhar)
async function askTicket (id, mode) {
  let last = ''
  try { last = sessionStorage.getItem('nx-last-ticket') || '' } catch (e) { /* opcional */ }
  const required = mode === 'required'
  let value
  try {
    const r = await ElMessageBox.prompt(
      required ? 'Informe o número do chamado desta conexão.' : 'Número do chamado desta conexão (opcional).',
      'Chamado', {
        inputValue: last, inputPlaceholder: 'Ex.: CBQ-REQ-6054', confirmButtonText: 'Conectar', cancelButtonText: 'Cancelar',
        inputValidator: (v) => (v || '').trim() === '' ? (required ? 'Informe o chamado.' : true) : (TICKET_RE.test(v.trim()) || 'Use letras, números e hífen.'),
      })
    value = (r.value || '').trim()
  } catch (e) {
    return false
  }
  try { sessionStorage.setItem('nx-last-ticket', value) } catch (e) { /* opcional */ }
  await connectNote(id, value, '').catch(() => false)
  return true
}

export async function connectDevice (id) {
  id = String(id).replace(/\s+/g, '') // o painel mostra o ID em grupos (536 822 159); o link precisa dele sem espaços
  try { useQuickAccess().touch(id) } catch (e) { /* recentes são opcionais */ }
  const mode = await ticketMode()
  if (mode !== 'off' && !(await askTicket(id, mode))) return
  try {
    const res = await fetch(`${import.meta.env.VITE_SERVER_API}/my/connect-link?id=${encodeURIComponent(id)}`, {
      headers: { 'api-token': getToken() || '' },
    })
    const body = await res.json()
    if (!res.ok || !body || body.code !== 0 || !body.data?.url) {
      ElMessage.error(body?.msg || 'Não foi possível preparar a conexão. Verifique sua permissão e tente novamente.')
      return
    }
    abrir(body.data.url)
  } catch (e) {
    ElMessage.error('Não foi possível consultar o servidor para conectar. Tente novamente.')
  }
}
