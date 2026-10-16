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

// Baixa o .exe gerado (download autorizado do gerador) e o entrega ao envio do app de suporte. Nunca lança:
// devolve { ok: true } ou { ok: false, message }, para a tela mostrar o motivo onde o usuário está olhando.
export async function publishGeneratedApp ({ item, maxSize, fetchImpl = globalThis.fetch, upload, onProgress, fileCtor = globalThis.File, sizeLabel = (n) => `${n} bytes` }) {
  try {
    const download = await fetchImpl(item.url, { credentials: 'same-origin' })
    if (!download.ok) return { ok: false, message: `Não foi possível baixar o aplicativo gerado (HTTP ${download.status}).` }
    const blob = await download.blob()
    if (blob.size > maxSize) return { ok: false, message: `O arquivo passa do limite de ${sizeLabel(maxSize)}.` }
    const file = new fileCtor([blob], item.name, { type: 'application/octet-stream' })
    const result = await upload(file, onProgress)
    if (!result.ok) return { ok: false, message: result.message || 'O envio foi recusado. Tente de novo.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'Não foi possível publicar este aplicativo.' }
  }
}
