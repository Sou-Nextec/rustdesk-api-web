// Recuperação automática quando o painel fica aberto durante uma atualização:
// os arquivos antigos somem do servidor e a importação dinâmica de uma tela falha.
export const RELOAD_KEY = 'nextec-stale-reload'
export const RELOAD_WINDOW_MS = 60000
export const RELOAD_NOTICE = 'Nova versão do painel. Recarregando...'

const PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
]

export function isStaleAssetError (error) {
  const text = typeof error === 'string' ? error : String(error?.message ?? '')
  return PATTERNS.some(p => p.test(text))
}

// Função pura: recarrega se for erro de asset antigo e não houve recarga nos últimos 60 s.
export function shouldReload (error, lastReloadAt, now) {
  if (!isStaleAssetError(error)) return false
  const last = Number(lastReloadAt)
  if (Number.isFinite(last) && last > 0 && now - last >= 0 && now - last < RELOAD_WINDOW_MS) return false
  return true
}

// Efeitos: storage, aviso e recarga são injetados para facilitar o teste.
export function recoverFromStaleAssets (error, { storage, now = Date.now(), notify, reload } = {}) {
  let last = null
  try { last = storage?.getItem(RELOAD_KEY) } catch (e) { /* storage indisponível */ }
  if (!shouldReload(error, last, now)) return false
  try { storage?.setItem(RELOAD_KEY, String(now)) } catch (e) { /* sem storage: ainda recarrega uma vez por evento */ }
  try { notify?.(RELOAD_NOTICE) } catch (e) { /* aviso é opcional */ }
  reload?.()
  return true
}
