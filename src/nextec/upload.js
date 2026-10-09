// Envio de arquivo grande com barra de progresso (o axios do painel não expõe o progresso de envio de forma simples).
// Devolve { ok, data } ou { ok: false, message }; nunca lança.
import { getToken } from '@/utils/auth'

export function uploadFile (path, fields, file, onProgress) {
  return new Promise((resolve) => {
    const body = new FormData()
    Object.entries(fields || {}).forEach(([k, v]) => body.append(k, v))
    body.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SERVER_API}${path}`)
    xhr.setRequestHeader('api-token', getToken() || '')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => resolve({ ok: false, message: 'Não foi possível enviar. Confira a conexão e tente de novo; os campos foram mantidos.' })
    xhr.onload = () => {
      let res = {}
      try { res = JSON.parse(xhr.responseText) } catch (e) { /* resposta fora do padrão */ }
      if (xhr.status === 200 && res.code === 0) resolve({ ok: true, data: res.data })
      else resolve({ ok: false, message: res.message || (xhr.status === 413 ? 'O arquivo é maior que o limite aceito.' : 'O envio falhou. Tente de novo.') })
    }
    xhr.send(body)
  })
}
