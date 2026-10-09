// ID do RustDesk com "máscara": o painel mostra em grupos de três, como o app (268 304 385), mas o que é copiado,
// enviado e salvo é sempre o ID sem espaços (268304385).

// tira espaços (inclusive o espaço sem quebra) e deixa só o ID
export function rawId (value) {
  return String(value == null ? '' : value).replace(/[\s ]+/g, '')
}

// formata como o app: só IDs numéricos, grupos de três a partir da direita (1 234 567 890)
export function fmtId (value) {
  const id = rawId(value)
  if (!/^\d+$/.test(id) || id.length <= 3) return id
  const first = id.length % 3
  const parts = []
  if (first) parts.push(id.slice(0, first))
  for (let i = first; i < id.length; i += 3) parts.push(id.slice(i, i + 3))
  return parts.join(' ')
}
