// Rótulo do link de Suporte rápido. O código do atendimento é o próprio token do link (o mesmo que vai na URL e que o cliente
// vê na página), por isso não existe mais um número sorteado à parte.

export const QUICK_DEFAULT_LABEL = 'Suporte rápido'

// Rótulo gravado no link: o texto opcional do técnico (chamado ou cliente) ou "Suporte rápido".
export function sessionLabel (text) {
  const t = String(text || '').trim().slice(0, 100)
  return t || QUICK_DEFAULT_LABEL
}

// Código do atendimento como aparece na lista de links: o token do link em maiúsculas (8 caracteres, sem 0, 1, I e O), em dois
// blocos para ler ao telefone (ABCD-EFGH). Mais longo que CODE_SHOWN mostra só os 8 primeiros e reticências; o completo vai no
// tooltip e na cópia. `full` é o que se copia (sem hífen); `text` é o que se vê.
export const CODE_SHOWN = 12

export function attendanceCode (token) {
  const full = String(token || '').trim().toUpperCase()
  if (!full) return { full: '', text: '', truncated: false }
  if (full.length > CODE_SHOWN) return { full, text: full.slice(0, 8) + '…', truncated: true }
  return { full, text: full.length === 8 ? full.slice(0, 4) + '-' + full.slice(4) : full, truncated: false }
}
