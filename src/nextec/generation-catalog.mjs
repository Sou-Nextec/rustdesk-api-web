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
  if (row.submission_error && row.status !== 'success') return { label: 'Falhou', tone: 'danger' }
  if (row.status === 'success' && row.files?.length) return { label: 'Pronto para baixar', tone: 'success' }
  if (row.status === 'incomplete') return { label: 'Arquivos incompletos', tone: 'danger' }
  if (row.status === 'submission_unknown') return { label: 'Envio não confirmado', tone: 'warning' }
  if (['failure', 'submission_failed', 'cancelled', 'timed_out', 'skipped', 'action_required'].includes(row.status)) return { label: 'Falhou', tone: 'danger' }
  return { label: 'Gerando', tone: 'warning' }
}
const FAILED_STATUS = ['failure', 'submission_failed', 'cancelled', 'timed_out', 'skipped', 'action_required', 'submission_unknown', 'incomplete']
// Item que deu erro e não precisa ficar na lista.
export const failedGeneration = row => !!row && (!!row.submission_error || FAILED_STATUS.includes(row.status))
// O servidor decide (deletable); aqui só evita pedir o que sabemos que será recusado.
export const deletableGeneration = row => !!row && validGenerationId(row.uuid) && !activeGeneration(row) && row.deletable !== false
const HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Nextec-Acao': 'excluir' }
async function send(url, init, fetchImpl) {
  const response = await fetchImpl(url, { credentials: 'same-origin', ...init, headers: HEADERS })
  let body = {}
  try { body = await response.json() } catch { /* sem corpo */ }
  if (!response.ok) {
    const error = new Error(body.error || (response.status === 403 ? 'Entre com uma conta autorizada a gerar clientes.' : 'Não foi possível excluir. Tente novamente.'))
    error.code = body.code || ''
    error.status = response.status
    throw error
  }
  return body
}
// Exclui um item. confirmImported só depois de o usuário aceitar o aviso de "já enviado para Atualizações".
export async function deleteGeneration(uuid, { confirmImported = false, fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  if (!validGenerationId(uuid)) throw Object.assign(new Error('Identificador de item inválido.'), { code: 'invalid' })
  return send(`/gerador/nextec/geracoes/${uuid}/excluir/${confirmImported ? '?confirmar=1' : ''}`, { method: 'DELETE' }, fetchImpl)
}
// Exclui vários: { uuids } ou { scope: 'failed' } ("Limpar falhas"). Devolve { deleted, blocked }.
export async function deleteGenerations({ uuids, scope, confirmImported = false, fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const payload = {}
  if (scope === 'failed') payload.scope = 'failed'
  else {
    const valid = (uuids || []).filter(validGenerationId)
    if (!valid.length || valid.length !== (uuids || []).length) throw Object.assign(new Error('Selecione itens válidos para excluir.'), { code: 'invalid' })
    payload.uuids = valid
  }
  if (confirmImported) payload.confirm_imported = true
  return send('/gerador/nextec/geracoes/excluir/', { method: 'POST', body: JSON.stringify(payload) }, fetchImpl)
}
