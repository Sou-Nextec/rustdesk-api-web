// Liga o link "Abrir no Connect" (#/my/peer?conectar=<ID>) ao painel. Regras puras em connect-deeplink.mjs.
// O pedido é lido da URL assim que o painel carrega, antes de qualquer redirecionamento (guarda de login, entrada
// automática pela Microsoft, 404 antes de as rotas carregarem), e guardado na sessão desta aba. Depois de entrar,
// o painel pergunta se a pessoa quer conectar e só então chama connectDevice: o servidor (/my/connect-link) continua
// decidindo quem pode conectar, o chamado continua sendo pedido e nenhuma senha aparece.
import { ElMessage, ElMessageBox } from 'element-plus'
import { getToken } from '@/utils/auth'
import { useUserStore } from '@/store/user'
import { fmtId } from './id'
import { connectDevice } from './connect'
import { INVALID_TEXT, confirmText, decide, hasParam, isPublicPath, memoryPending, nextQuery, paramFromHash, rememberPending, savePending, takePending } from './connect-deeplink.mjs'

const session = () => { try { return window.sessionStorage } catch (e) { return null } }

export function startConnectDeeplink ({ router, pinia }) {
  // reserva em memória só para quando o armazenamento da sessão está bloqueado (não sobrevive ao login externo)
  let memory
  let busy = false

  // Guarda o pedido assim que ele aparece na URL, antes de qualquer guarda do roteador: na carga do painel e também
  // quando o link é aberto numa aba já carregada (só o hash muda e a guarda de login redirecionaria antes de afterEach).
  const capture = (hash) => {
    const value = paramFromHash(hash)
    if (value === undefined) return
    memory = rememberPending(value, savePending(session(), value))
  }
  capture(window.location.hash)
  window.addEventListener('hashchange', () => capture(window.location.hash))

  const loggedIn = () => {
    if (!getToken()) return false
    try { return (useUserStore(pinia).route_names || []).length > 0 } catch (e) { return false }
  }

  async function handle (to) {
    const logged = loggedIn()
    let pending
    if (logged && !busy && !isPublicPath(to.path)) {
      pending = takePending(session())
      if (pending === undefined) pending = memoryPending(memory)
      memory = undefined
    }
    const d = decide({ path: to.path, query: to.query, pending, loggedIn: logged, busy })
    if (d.action === 'wait') {
      // chegou pela tela de login com o parâmetro na própria URL: guarda para depois de entrar
      if (hasParam(to.query)) memory = rememberPending(d.value, savePending(session(), d.value))
      return
    }
    // limpa a URL antes de perguntar (recarregar a página não reabre a pergunta); em Meus dispositivos, filtra pelo ID
    const query = (d.cleanUrl || d.action === 'confirm') ? nextQuery({ path: to.path, query: to.query, id: d.id }) : null
    if (query) await router.replace({ path: to.path, query, hash: to.hash }).catch(() => {})
    if (d.action === 'invalid') { ElMessage.error({ message: INVALID_TEXT, duration: 8000, showClose: true }); return }
    if (d.action !== 'confirm') return
    busy = true
    try {
      await ElMessageBox.confirm(confirmText(d.id, fmtId), 'Abrir conexão', {
        confirmButtonText: 'Conectar', cancelButtonText: 'Cancelar', type: 'info', distinguishCancelAndClose: true,
      })
    } catch (e) {
      busy = false
      return
    }
    busy = false
    // mesmo caminho do botão Conectar: permissões no servidor, chamado quando configurado, abertura do app
    connectDevice(d.id)
  }

  router.afterEach((to, from, failure) => {
    if (failure) return
    handle(to).catch(() => { busy = false })
  })
}
