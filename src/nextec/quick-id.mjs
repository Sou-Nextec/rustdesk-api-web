// Rótulo do link de Suporte rápido. O código do atendimento é o próprio token do link (o mesmo que vai na URL e que o cliente
// vê na página), por isso não existe mais um número sorteado à parte.

export const QUICK_DEFAULT_LABEL = 'Suporte rápido'

// Rótulo gravado no link: o texto opcional do técnico (chamado ou cliente) ou "Suporte rápido".
export function sessionLabel (text) {
  const t = String(text || '').trim().slice(0, 100)
  return t || QUICK_DEFAULT_LABEL
}
