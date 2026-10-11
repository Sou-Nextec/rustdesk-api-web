const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const validGenerationId = value => typeof value === 'string' && UUID.test(value)
export const activeGeneration = row => ['starting', 'queued', 'in_progress', 'waiting', 'pending'].includes(row.status)
export function generationDownload(url) {
  if (typeof url !== 'string') return null
  let parsed
  try { parsed = new URL(url, 'https://catalog.invalid/gerador/') } catch { return null }
  if (parsed.origin !== 'https://catalog.invalid' || parsed.pathname !== '/gerador/download') return null
  if (!validGenerationId(parsed.searchParams.get('uuid')) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(parsed.searchParams.get('filename') || '')) return null
  return parsed.pathname + parsed.search
}
export function generationEvent(event, origin, source) {
  return event.origin === origin && event.source === source && event.data?.type === 'nextec-generation-started' && validGenerationId(event.data.uuid) ? event.data.uuid : null
}
export function generationState(row) {
  if (row.status === 'success' && row.files?.length) return { label: 'Pronto para baixar', tone: 'success' }
  if (row.status === 'incomplete') return { label: 'Arquivos incompletos', tone: 'danger' }
  if (row.status === 'submission_unknown') return { label: 'Envio não confirmado', tone: 'warning' }
  if (['failure', 'submission_failed', 'cancelled', 'timed_out', 'skipped', 'action_required'].includes(row.status)) return { label: 'Falhou', tone: 'danger' }
  return { label: 'Gerando', tone: 'warning' }
}
