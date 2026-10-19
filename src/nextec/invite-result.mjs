// Resultado da instalação de cada máquina com um convite (vem de /nextec/invites, campo results).
const TONES = { linked: 'success', conflict: 'danger', identity: 'warning', invalid: 'danger' }
const FALLBACK = {
  linked: 'vinculado',
  conflict: 'conflito: a máquina já pertence a outro cliente',
  identity: 'a identidade da máquina mudou; refaça a instalação',
  invalid: 'convite recusado',
}

const fmtId = (id) => String(id || '').replace(/(\d{3})(?=\d)/g, '$1 ')
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Linhas para mostrar no convite: "123 456 789: Vinculado a Cliente A" ou "...: Conflito: já pertence a Cliente B".
export function inviteResultLines(results) {
  const list = Array.isArray(results) ? results : []
  return list.map(r => ({
    key: `${r.peer_id}:${r.at || 0}`,
    peer: fmtId(r.peer_id),
    tone: TONES[r.result] || 'info',
    text: cap(String(r.detail || '').trim() || FALLBACK[r.result] || 'resultado desconhecido'),
  }))
}

// Resumo curto: "2 vinculadas, 1 com problema" (vazio quando não houve tentativa).
export function inviteResultSummary(results) {
  const list = Array.isArray(results) ? results : []
  if (!list.length) return ''
  const ok = list.filter(r => r.result === 'linked').length
  const bad = list.length - ok
  const parts = []
  if (ok) parts.push(`${ok} ${ok === 1 ? 'vinculada' : 'vinculadas'}`)
  if (bad) parts.push(`${bad} com problema`)
  return parts.join(', ')
}
