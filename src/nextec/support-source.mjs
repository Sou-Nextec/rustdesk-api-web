// Itens do gerador que podem virar o aplicativo de suporte avulso: gerações concluídas com um arquivo .exe.
// O painel só usa download autorizado do próprio gerador (generationDownload valida origem, uuid e nome do arquivo).
import { generationDownload, validGenerationId } from './generation-catalog.mjs'

const EXE = /\.exe$/i

export function supportCandidates (rows) {
  const out = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'success' || !validGenerationId(row.uuid) || row.submission_error) continue
    for (const file of row.files || []) {
      if (!file || typeof file.name !== 'string' || !EXE.test(file.name)) continue
      const url = generationDownload(file.url)
      if (!url) continue
      out.push({
        uuid: row.uuid,
        name: file.name,
        url,
        label: row.client_name || row.filename || file.name,
        createdAt: row.created_at || '',
        looksLikeSupport: /suporte|support/i.test(`${file.name} ${row.filename || ''} ${row.client_name || ''}`),
      })
    }
  }
  // Os que parecem app de suporte primeiro; depois o mais recente.
  return out.sort((a, b) => (Number(b.looksLikeSupport) - Number(a.looksLikeSupport)) || String(b.createdAt).localeCompare(String(a.createdAt)))
}
