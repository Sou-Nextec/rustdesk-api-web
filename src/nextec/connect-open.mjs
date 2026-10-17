// Abertura do link de conexão: quando abrir o app direto, qual protocolo usar e o aviso da senha ainda não aplicada.
// Módulo puro (sem Vue nem rede; o DOM entra por injeção), testado em nextec/testes/connect-open.test.mjs.
// Nada aqui libera acesso: autorização, senha e protocolo da máquina vêm do servidor (/my/connect-link).
import { nextCheck } from './agent-cycle.mjs'
import { lastContactAt } from './agent-state.mjs'

// Mesmas regras do servidor (service/nextec_appname.go): nome do app e protocolo.
export const APP_NAME_RE = /^[A-Za-z0-9-]{1,64}$/
export const SCHEME_RE = /^[a-z][a-z0-9+.-]{1,31}$/
// Protocolos tratados de forma especial pelo navegador nunca servem de protocolo do app.
const DENIED_SCHEMES = new Set([
  'http', 'https', 'file', 'ftp', 'ftps', 'ws', 'wss', 'javascript', 'vbscript', 'data', 'blob', 'about', 'mailto',
  'tel', 'sms', 'chrome', 'edge', 'view-source', 'ms-msdt', 'search-ms',
])

export const validScheme = (s) => typeof s === 'string' && SCHEME_RE.test(s) && !DENIED_SCHEMES.has(s)

// O RustDesk registra o protocolo com o nome do app em minúsculas: Client-Nextec-Connect abre client-nextec-connect://.
// Devolve '' quando o nome não serve de protocolo (o chamador cai no protocolo global configurado).
export function schemeFromAppName (appName) {
  const name = typeof appName === 'string' ? appName.trim() : ''
  if (!APP_NAME_RE.test(name)) return ''
  const s = name.toLowerCase()
  return validScheme(s) ? s : ''
}

// Protocolo de um link (rustdesk://123456789?password=...). '' se não houver ou não servir.
export function schemeOfUrl (url) {
  const m = typeof url === 'string' ? url.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//) : null
  const s = m ? m[1].toLowerCase() : ''
  return validScheme(s) ? s : ''
}

// Protocolo desta máquina: o que o servidor informou, senão o derivado do nome do app, senão o do próprio link,
// senão o global configurado (fallback). Servidor antigo (sem scheme) continua funcionando pelo link.
export function resolveScheme ({ scheme, appName, url, fallback = '' } = {}) {
  const s = typeof scheme === 'string' ? scheme.toLowerCase() : ''
  if (validScheme(s)) return s
  return schemeFromAppName(appName) || schemeOfUrl(url) || (validScheme(fallback) ? fallback : '')
}

// Nome para mostrar ao usuário. Sem nome conhecido, texto genérico (nada de nome fixo no painel).
export const appLabel = (appName) => (typeof appName === 'string' && APP_NAME_RE.test(appName.trim()) ? appName.trim() : 'aplicativo')

// ---------- "lembrar que o app está instalado" ----------
// Guarda, por protocolo, que o app já abriu neste navegador. Convenience: sem armazenamento (bloqueado, modo
// privado) tudo continua funcionando, só não lembra.
export const OPENED_KEY = 'nx-app-opened'

export function createOpenedStore (storage, key = OPENED_KEY, now = () => Date.now()) {
  const read = () => {
    try {
      const raw = JSON.parse(storage.getItem(key) || '{}')
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    } catch (e) { return {} }
  }
  const write = (v) => { try { storage.setItem(key, JSON.stringify(v)) } catch (e) { /* opcional */ } }
  return {
    has: (scheme) => validScheme(scheme) && Number(read()[scheme]) > 0,
    remember: (scheme) => { if (validScheme(scheme)) write({ ...read(), [scheme]: now() }) },
    forget: (scheme) => { const v = read(); if (scheme in v) { delete v[scheme]; write(v) } },
  }
}

// ---------- decisão ----------
// Abre direto quando o painel já viu o app abrir com sucesso neste navegador para esse protocolo, ou quando a máquina
// tem agente ativo (app instalado). Caso contrário, mostra o diálogo completo (primeira vez).
export function decideOpen ({ remembered = false, agentActive = false } = {}) {
  if (remembered) return { mode: 'direct', reason: 'remembered' }
  if (agentActive) return { mode: 'direct', reason: 'agent' }
  return { mode: 'dialog', reason: 'first' }
}

// ---------- senha ainda não aplicada ----------
// Agente ativo, regra ligada e a primeira senha ainda não aplicada: o app abriria pedindo a senha sem explicar.
export function passwordNotice (link = {}, nowSec = Date.now() / 1000) {
  if (!link || link.password_state !== 'waiting_first' || !link.agent_active) return null
  // Última consulta REAL (last_sync_at, 0035); servidor anterior ao campo cai em last_seen_at.
  const next = nextCheck(lastContactAt(link), nowSec)
  let when = ''
  if (next.state === 'waiting') when = ` (próxima verificação em ~${next.minutes} min)`
  else if (next.state === 'due') when = ' (próxima verificação em instantes)'
  else if (next.state === 'late') when = ' (a verificação está atrasada e deve ocorrer em instantes)'
  return {
    minutes: next.minutes,
    state: next.state,
    text: `A senha automática ainda não foi aplicada nesta máquina${when}. Você pode conectar e digitar a senha, ou aguardar.`,
  }
}

// ---------- detecção de abertura ----------
// Técnica padrão: ao abrir um protocolo externo a página perde o foco (blur) ou fica oculta. Sem isso dentro do prazo,
// consideramos que não abriu. É uma pista, não uma prova: só decide aviso e lembrança, nunca acesso.
export function watchOpened ({ win, doc, timeoutMs = 3500, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise(resolve => {
    let done = false
    let timer = null
    const finish = (ok) => {
      if (done) return
      done = true
      clearTimer(timer)
      win.removeEventListener('blur', onBlur)
      win.removeEventListener('pagehide', onBlur)
      doc.removeEventListener('visibilitychange', onVisibility)
      resolve(ok)
    }
    const onBlur = () => finish(true)
    const onVisibility = () => { if (doc.visibilityState === 'hidden') finish(true) }
    win.addEventListener('blur', onBlur)
    win.addEventListener('pagehide', onBlur)
    doc.addEventListener('visibilitychange', onVisibility)
    timer = setTimer(() => finish(false), timeoutMs)
  })
}

// Dispara o protocolo e aprende com o resultado: abriu, lembra; não abriu, esquece (volta ao diálogo completo).
export async function launchWatched ({ url, scheme, store, launch, watch }) {
  const watching = watch()
  launch(url)
  const opened = await watching
  if (scheme) { if (opened) store.remember(scheme); else store.forget(scheme) }
  return opened
}

// Orquestra a abertura depois que o link autorizado chegou.
//   dialog(ctx): diálogo completo (primeira vez ou "Não abriu?"); ele mesmo usa launchWatched ao confirmar.
//   toast({ appName, notOpened }): aviso curto da abertura direta; notOpened() abre o diálogo completo.
export async function openConnection ({ url, link = {}, store, launch, watch, toast, dialog, fallbackScheme = '' }) {
  const scheme = resolveScheme({ scheme: link.scheme, appName: link.app_name, url, fallback: fallbackScheme })
  const decision = decideOpen({ remembered: store.has(scheme), agentActive: Boolean(link.agent_active) })
  const ctx = { url, scheme, appName: link.app_name || '' }
  if (decision.mode === 'dialog') {
    dialog(ctx)
    return { ...decision, scheme, opened: null }
  }
  toast({ appName: ctx.appName, notOpened: () => dialog(ctx) })
  const opened = await launchWatched({ url, scheme, store, launch, watch })
  return { ...decision, scheme, opened }
}

// ---------- celular ----------
// No celular só existe o app oficial do RustDesk (protocolo rustdesk://); o protocolo do Nextec Connect é de Windows. Por isso,
// em navegador de celular o painel abre o RustDesk direto, sem diálogo, trocando o protocolo do link autorizado.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.carriez.flutter_hbb'
export const APP_STORE_URL = 'https://apps.apple.com/app/rustdesk-remote-desktop/id1581225015'

// iPadOS 13+ no Safari "pede o site de computador" e envia um UA idêntico ao do Mac: o que o separa de um Mac de verdade é a tela de toque.
export function isIpadOs (ua = '', platform = '', touchPoints = 0) {
  return /Macintosh|MacIntel/i.test(`${ua} ${platform}`) && Number(touchPoints) > 1
}

export function isMobileBrowser (ua = '', uaDataMobile = false, platform = '', touchPoints = 0) {
  if (uaDataMobile === true) return true
  return /Android|iPhone|iPad|iPod/i.test(String(ua)) || isIpadOs(ua, platform, touchPoints)
}

export function toMobileUrl (url) {
  return String(url || '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, 'rustdesk://')
}

export const mobileStoreUrl = (ua = '', platform = '', touchPoints = 0) => (/iPhone|iPad|iPod/i.test(String(ua)) || isIpadOs(ua, platform, touchPoints) ? APP_STORE_URL : PLAY_STORE_URL)
