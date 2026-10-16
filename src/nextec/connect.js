// Conectar por ID. Pede ao painel o link: em máquinas com senha automática ele já leva a senha vigente
// (<protocolo>://<id>?password=...), então quem pode acessar a máquina só clica e entra.
// Falhas de permissão ou rede são exibidas sem abrir uma conexão alternativa silenciosa.
// O protocolo é o do app instalado NA MÁQUINA (nome do app informado pelo agente); sem ele, o global do painel.
// O app abre direto quando já abriu antes neste navegador ou a máquina tem agente ativo; o diálogo completo
// fica para a primeira vez e para "Não abriu?". Regras de decisão em connect-open.mjs (módulo puro testado).
import { h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getToken } from '@/utils/auth'
import { useUserStore } from '@/store/user'
import { connectSettings, connectNote, availableApp, secretsRotate } from './api'
import { useQuickAccess } from './quick-access'
import { prepareConnection } from './connect-flow.mjs'
import { urlForAction } from './connect-action.mjs'
import { appLabel, createOpenedStore, launchWatched, openConnection, passwordNotice, watchOpened } from './connect-open.mjs'

// localStorage pode lançar (modo privado, bloqueio): nunca derruba a conexão.
const safeStorage = {
  getItem: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* opcional */ } },
}
const openedStore = () => createOpenedStore(safeStorage)

function launch (url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const launchNow = ({ url, scheme }) => launchWatched({
  url, scheme, store: openedStore(), launch, watch: () => watchOpened({ win: window, doc: document }),
})

// Diálogo completo: primeira vez ou "Não abriu?". O clique final mantém a ativação do usuário depois da API.
function showDialog ({ url, scheme, appName }) {
  ElMessageBox.confirm(
    `Abra o aplicativo instalado para iniciar a conexão. Se o navegador pedir, autorize a abertura do ${appLabel(appName)}.`,
    'Conectar ao dispositivo', {
      confirmButtonText: 'Abrir aplicativo', cancelButtonText: 'Baixar aplicativo', distinguishCancelAndClose: true,
      beforeClose: (action, instance, done) => {
        if (action === 'confirm') launchNow({ url, scheme })
        done()
      },
    }).catch(action => { if (action === 'cancel') downloadCurrentApp() })
}

// Aviso de andamento: roxo da marca, com ícone girando (um aviso cinza com "i" parecia erro).
const progressToast = (message, extra = {}) => ElMessage({
  customClass: 'nx-toast-progress', icon: () => h('span', { class: 'nx-toast-spinner', 'aria-hidden': 'true' }), message, ...extra,
})

// Aviso curto da abertura direta, por 8 s, com saída discreta para o diálogo completo.
function showOpeningToast ({ appName, notOpened }) {
  let toast = null
  toast = progressToast(h('span', null, [
      `Abrindo o ${appLabel(appName)}... `,
      h('a', {
        href: '#', style: 'margin-left:8px;font-size:12px;',
        onClick: (e) => { e.preventDefault(); if (toast) toast.close(); notOpened() },
      }, 'Não abriu? Baixar aplicativo'),
    ]), { duration: 8000, showClose: true })
}

const isAdmin = () => { try { return (useUserStore().route_names || []).includes('*') } catch (e) { return false } }

// Máquina com agente ativo, mas a primeira senha ainda não foi aplicada: o app abriria pedindo a senha sem explicar.
// Devolve false para cancelar a abertura (o usuário escolheu aguardar ou pediu a troca).
async function reviewLink (peerId, link) {
  const notice = passwordNotice(link)
  if (!notice) return true
  const admin = isAdmin()
  try {
    await ElMessageBox.confirm(notice.text, 'Senha ainda não aplicada', {
      type: 'warning', distinguishCancelAndClose: true,
      confirmButtonText: 'Conectar mesmo assim', cancelButtonText: admin ? 'Trocar agora' : 'Aguardar',
    })
    return true
  } catch (action) {
    if (action === 'cancel' && admin) {
      const done = await secretsRotate(peerId).catch(() => false)
      if (done) {
        const quando = notice.minutes ? ` (cerca de ${notice.minutes} min)` : ''
        ElMessage.success(`Troca pedida. A senha é aplicada na próxima verificação do agente${quando}.`)
      }
    }
    return false
  }
}

export async function downloadCurrentApp () {
  const info = await availableApp().catch(() => false)
  if (!info?.data?.available) { ElMessage.info('Nenhuma versão foi disponibilizada para os analistas. Peça ao administrador para disponibilizar em Atualizações do app.'); return }
  const waiting = progressToast(`Baixando Nextec Connect ${info.data.version}…`, { duration: 0 })
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

// action: opcional, ex.: 'file-transfer' abre direto a transferência de arquivos, com a mesma senha do cofre.
export async function connectDevice (id, { action = '' } = {}) {
  id = String(id).replace(/\s+/g, '') // o painel mostra o ID em grupos (536 822 159); o link precisa dele sem espaços
  try { useQuickAccess().touch(id) } catch (e) { /* recentes são opcionais */ }
  try {
    const prepared = await prepareConnection(id, {
      loadSettings: connectSettings,
      askTicket,
      saveNote: (peerId, ticket) => connectNote(peerId, ticket, ''),
      reviewLink,
      requestLink: async peerId => {
        const response = await fetch(`${import.meta.env.VITE_SERVER_API}/my/connect-link?id=${encodeURIComponent(peerId)}`, {
          headers: { 'api-token': getToken() || '' },
        })
        const body = await response.json()
        return response.ok ? body : { ...body, code: body?.code === 0 ? response.status : body?.code }
      },
    })
    if (prepared) {
      openConnection({
        url: urlForAction(prepared.url, action), link: prepared.link, store: openedStore(), launch,
        watch: () => watchOpened({ win: window, doc: document }),
        toast: showOpeningToast, dialog: showDialog,
      }).catch(() => { /* aviso é só conveniência */ })
    }
  } catch (e) {
    ElMessage.error(e?.message || 'Não foi possível preparar a conexão. Tente novamente.')
  }
}

// Mantém as entradas antigas no mesmo caminho autorizado e preparado do painel.
export function connectLink (id) {
  return connectDevice(id)
}

export function connectFiles (id) {
  return connectDevice(id, { action: 'file-transfer' })
}
