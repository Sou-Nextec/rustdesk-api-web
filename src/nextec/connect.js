// Conectar por ID. Pede ao painel o link: em máquinas com senha automática ele já leva a senha vigente
// (rustdesk://<id>?password=...), então quem pode acessar a máquina só clica e entra.
// Falhas de permissão ou rede são exibidas sem abrir uma conexão alternativa silenciosa.
// O protocolo é o do app instalado (um app gerado como Nextec-Connect registra nextec-connect://); admin define em Gerar cliente.
import { ElMessage, ElMessageBox } from 'element-plus'
import { getToken } from '@/utils/auth'
import { connectSettings, connectNote, availableApp } from './api'
import { useQuickAccess } from './quick-access'
import { prepareConnection } from './connect-flow.mjs'

function abrir (url) {
  // The final click must keep browser user activation after the API request.
  ElMessageBox.confirm(
    'Abra o aplicativo instalado para iniciar a conexão. Se o navegador pedir, autorize a abertura do Nextec-Connect.',
    'Conectar ao dispositivo', {
      confirmButtonText: 'Abrir aplicativo', cancelButtonText: 'Baixar aplicativo', distinguishCancelAndClose: true,
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
    }).catch(action => { if (action === 'cancel') downloadCurrentApp() })
}

export async function downloadCurrentApp () {
  const info = await availableApp().catch(() => false)
  if (!info?.data?.available) { ElMessage.info('Nenhuma versão foi disponibilizada para os analistas. Peça ao administrador para disponibilizar em Atualizações do app.'); return }
  const waiting = ElMessage({ message: `Baixando Nextec Connect ${info.data.version}…`, duration: 0 })
  try {
    const response = await fetch(`${import.meta.env.VITE_SERVER_API}/my/app-download?version=${encodeURIComponent(info.data.version)}`, { headers: { 'api-token': getToken() || '' } })
    if (!response.ok || response.headers.get('content-type')?.includes('application/json')) throw new Error('Download indisponível.')
    const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = info.data.filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch { ElMessage.error('Não foi possível baixar o aplicativo. Tente novamente.') }
  finally { waiting.close() }
}

// Chamado na conexão (opcional, ligado pelo admin em Auditoria > Relatório mensal). O último número fica pré-preenchido na sessão.
const TICKET_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/
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
  return value
}

export async function connectDevice (id) {
  id = String(id).replace(/\s+/g, '') // o painel mostra o ID em grupos (536 822 159); o link precisa dele sem espaços
  try { useQuickAccess().touch(id) } catch (e) { /* recentes são opcionais */ }
  try {
    const prepared = await prepareConnection(id, {
      loadSettings: connectSettings,
      askTicket,
      saveNote: (peerId, ticket) => connectNote(peerId, ticket, ''),
      requestLink: async peerId => {
        const response = await fetch(`${import.meta.env.VITE_SERVER_API}/my/connect-link?id=${encodeURIComponent(peerId)}`, {
          headers: { 'api-token': getToken() || '' },
        })
        const body = await response.json()
        return response.ok ? body : { ...body, code: body?.code === 0 ? response.status : body?.code }
      },
    })
    if (prepared) abrir(prepared.url)
  } catch (e) {
    ElMessage.error(e?.message || 'Não foi possível preparar a conexão. Tente novamente.')
  }
}

// Mantém as entradas antigas no mesmo caminho autorizado e preparado do painel.
export function connectLink (id) {
  return connectDevice(id)
}
