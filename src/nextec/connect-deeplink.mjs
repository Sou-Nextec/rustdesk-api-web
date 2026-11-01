// Link "Abrir no Connect" vindo de fora do painel (ex.: plataforma Sentinela):
//   https://<painel>/_admin/#/my/peer?conectar=<ID do RustDesk>
// Módulo puro (sem Vue, sem rede, armazenamento por injeção), testado em nextec/testes/connect-deeplink.test.mjs.
// Nada aqui libera acesso: o painel só pergunta se a pessoa quer conectar e, se sim, usa o caminho de sempre
// (connectDevice, que pede o link a /my/connect-link, onde o servidor aplica as permissões).

export const PARAM = 'conectar'
export const PENDING_KEY = 'nx-conectar-pendente'
// Tempo que o pedido sobrevive ao login (senha, MFA e a volta do login externo da Microsoft).
export const PENDING_TTL_MS = 15 * 60 * 1000
// Mesmo formato de ID aceito pelo servidor na entrada de máquinas (patch 0031) e pelo arquivo de ativação.
export const ID_RE = /^\d{6,64}$/
// Entrada bruta maior que isto nem é analisada.
const MAX_RAW = 128

// Telas em que ninguém está logado: o pedido fica guardado até depois do login.
const PUBLIC_PATHS = ['/login', '/register', '/404']
export const isPublicPath = (path) => PUBLIC_PATHS.includes(String(path || '')) || String(path || '').startsWith('/oauth')

// Valida o ID recebido. Tira espaços (inclusive o sem quebra), como o connectDevice; aceita só dígitos.
export function parseConnectId (value) {
  if (Array.isArray(value) || value === null || value === undefined) return { ok: false, id: '' }
  const raw = String(value)
  if (!raw.trim() || raw.length > MAX_RAW) return { ok: false, id: '' }
  const id = raw.replace(/[\s ]+/g, '')
  return ID_RE.test(id) ? { ok: true, id } : { ok: false, id: '' }
}

// Valor do parâmetro no hash da página (#/my/peer?conectar=...). undefined quando não existe.
export function paramFromHash (hash) {
  const h = String(hash || '')
  const i = h.indexOf('?')
  if (i < 0) return undefined
  const params = new URLSearchParams(h.slice(i + 1))
  if (!params.has(PARAM)) return undefined
  const all = params.getAll(PARAM)
  return all.length === 1 ? all[0] : all
}

// Query sem o parâmetro, para router.replace (não reabre ao recarregar a página).
export function queryWithout (query = {}) {
  const rest = { ...(query || {}) }
  delete rest[PARAM]
  return rest
}

// Nova query da tela atual depois de tratar o pedido, ou null quando nada muda. Em Meus dispositivos, com ID válido,
// a lista abre filtrada por ele (?q=<ID>), para a pessoa ver de qual máquina se trata.
export const DEVICES_PATH = '/my/peer'
export function nextQuery ({ path, query = {}, id = '' }) {
  const q = query || {}
  const rest = queryWithout(q)
  const filter = Boolean(id) && path === DEVICES_PATH && q.q !== id
  if (filter) rest.q = id
  return hasParam(q) || filter ? rest : null
}

export function hasParam (query) { return Boolean(query) && Object.prototype.hasOwnProperty.call(query, PARAM) }

// ---------- pedido pendente (sobrevive ao login) ----------
// Guarda o valor bruto: a validação acontece uma vez só, na hora de tratar. Sem armazenamento, nada é guardado.
export function savePending (storage, value, now = Date.now()) {
  if (!storage || value === undefined) return false
  try {
    const raw = Array.isArray(value) ? value : String(value).slice(0, MAX_RAW + 1)
    storage.setItem(PENDING_KEY, JSON.stringify({ value: raw, at: now }))
    return true
  } catch (e) { return false }
}

// Lê e apaga (o pedido é tratado uma vez só). Pedido vencido ou corrompido é descartado.
export function takePending (storage, now = Date.now()) {
  if (!storage) return undefined
  let raw = null
  try { raw = storage.getItem(PENDING_KEY) } catch (e) { return undefined }
  try { storage.removeItem(PENDING_KEY) } catch (e) { /* sem armazenamento: nada a limpar */ }
  if (!raw) return undefined
  try {
    const item = JSON.parse(raw)
    const at = Number(item && item.at)
    if (!at || now - at < 0 || now - at > PENDING_TTL_MS) return undefined
    return item.value
  } catch (e) { return undefined }
}

// ---------- decisão ----------
// Depois de cada navegação: o que fazer com o pedido.
//   loggedIn: há sessão e rotas carregadas; busy: já existe um pedido sendo tratado (diálogo aberto).
// Devolve { action: 'none' | 'wait' | 'invalid' | 'confirm', id, cleanUrl }.
//   wait: tela de login, o pedido vai para o armazenamento e é tratado depois de entrar.
//   cleanUrl: a URL atual tem o parâmetro e precisa ser limpa (router.replace).
export function decide ({ path, query, pending, loggedIn, busy = false }) {
  const inQuery = hasParam(query)
  const value = inQuery ? query[PARAM] : pending
  if (value === undefined) return { action: 'none', id: '', cleanUrl: false }
  if (!loggedIn || isPublicPath(path)) return { action: 'wait', id: '', value, cleanUrl: false }
  if (busy) return { action: 'none', id: '', cleanUrl: inQuery }
  const parsed = parseConnectId(value)
  return { action: parsed.ok ? 'confirm' : 'invalid', id: parsed.id, cleanUrl: inQuery }
}

// Texto da confirmação, com o ID formatado como o painel exibe (formatador injetado: fmtId de id.js).
export const confirmText = (id, fmt = (x) => x) => `Conectar ao dispositivo ${fmt(id)}?`
export const INVALID_TEXT = 'O link de conexão traz um ID de dispositivo inválido. Nada foi aberto. Confira o link ou use Conectar pelo ID.'
