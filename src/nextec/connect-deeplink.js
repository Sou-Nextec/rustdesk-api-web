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
import { INVALID_TEXT, confirmText, decide, hasParam, isPublicPath, nextQuery, paramFromHash, savePending, takePending } from './connect-deeplink.mjs'

const session = () => { try { return window.sessionStorage } catch (e) { return null } }

export function startConnectDeeplink ({ router, pinia }) {
  // reserva em memória para quando o armazenamento da sessão está bloqueado (não sobrevive ao login externo)
  let memory = paramFromHash(window.location.hash)
  if (memory !== undefined) savePending(session(), memory)
  let busy = false

  const loggedIn = () => {
    if (!getToken()) return false
    try { return (useUserStore(pinia).route_names || []).length > 0 } catch (e) { return false }
  }

  async function handle (to) {
    const logged = loggedIn()
    let pending
    if (logged && !busy && !isPublicPath(to.path)) {
      pending = takePending(session())
      if (pending === undefined) pending = memory
      memory = undefined
    }
    const d = decide({ path: to.path, query: to.query, pending, loggedIn: logged, busy })
    if (d.action === 'wait') {
      // chegou pela tela de login com o parâmetro na própria URL: guarda para depois de entrar
      if (hasParam(to.query)) { savePending(session(), d.value); memory = d.value }
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
