// Recuperação automática quando o painel fica aberto durante uma atualização:
// os arquivos antigos somem do servidor e a importação dinâmica de uma tela falha.
export const RELOAD_KEY = 'nextec-stale-reload'
export const RELOAD_WINDOW_MS = 60000
export const RELOAD_NOTICE = 'Nova versão do painel. Recarregando...'
export const MANUAL_NOTICE = 'Nova versão do painel. Recarregue a página para continuar.'

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
// Só recarrega sozinho se a flag anti-loop puder ser lida E gravada (e conferida);
// caso contrário apenas avisa, com botão para recarregar manualmente.
export function recoverFromStaleAssets (error, { storage, now = Date.now(), notify, notifyManual, reload } = {}) {
  if (!isStaleAssetError(error)) return false
  let last = null
  let seguro = !!storage
  try { last = storage.getItem(RELOAD_KEY) } catch (e) { seguro = false }
  if (!shouldReload(error, last, now)) return false
  if (seguro) {
    try {
      storage.setItem(RELOAD_KEY, String(now))
      seguro = storage.getItem(RELOAD_KEY) === String(now)
    } catch (e) { seguro = false }
  }
  if (!seguro) {
    try { notifyManual?.(MANUAL_NOTICE) } catch (e) { /* aviso é opcional */ }
    return false
  }
  try { notify?.(RELOAD_NOTICE) } catch (e) { /* aviso é opcional */ }
  reload?.()
  return true
}
