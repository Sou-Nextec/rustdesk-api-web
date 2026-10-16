// Cor de cada cliente na lista de dispositivos: um tom por cliente (subclientes "Cliente / Filial" herdam o do cliente),
// para bater o olho e saber de quem é a máquina. As cores são atribuídas na ordem dos clientes (menor id primeiro), então os
// primeiros dez nunca se repetem. Pares fundo/texto com contraste de leitura (AA) nos dois temas.

export const CLIENT_PALETTE = Object.freeze([
  { light: ['#E9DDFF', '#3F2A7A'], dark: ['#3A2F5E', '#D9C9FF'] }, // roxo
  { light: ['#D6EEFF', '#0B4A73'], dark: ['#123B57', '#BFE3FF'] }, // azul
  { light: ['#D5F3E3', '#0F5132'], dark: ['#14422F', '#B7ECCF'] }, // verde
  { light: ['#FFE8C7', '#6B3E00'], dark: ['#55370A', '#FFD99A'] }, // âmbar
  { light: ['#FFD9DE', '#7A1B2B'], dark: ['#5B1F2A', '#FFC2CC'] }, // rosa
  { light: ['#D3F1F1', '#0E5757'], dark: ['#0F4444', '#A8E8E8'] }, // turquesa
  { light: ['#E3E7FF', '#2B3A8F'], dark: ['#2A3470', '#CBD3FF'] }, // índigo
  { light: ['#F6DCF3', '#6D1F66'], dark: ['#55204F', '#F3C7EE'] }, // magenta
  { light: ['#E7F0C8', '#3F5A0A'], dark: ['#34480F', '#D5EBA2'] }, // lima
  { light: ['#EBE0D3', '#5A3A1B'], dark: ['#46331F', '#E8D3BC'] }, // areia
])

export const rootClientName = (name) => String(name || '').split(' / ')[0].trim()

// groups: [{ id, name }]. Devolve Map(id do cliente -> índice na paleta).
export function clientColorIndex(groups = []) {
  const rows = (Array.isArray(groups) ? groups : []).filter(g => g && g.id !== undefined && g.name)
    .slice().sort((a, b) => Number(a.id) - Number(b.id))
  const byRoot = new Map()
  const out = new Map()
  for (const g of rows) {
    const root = rootClientName(g.name).toLowerCase()
    if (!byRoot.has(root)) byRoot.set(root, byRoot.size % CLIENT_PALETTE.length)
    out.set(g.id, byRoot.get(root))
  }
  return out
}

// Variáveis de CSS do chip do cliente (o tema escuro usa as --nx-ct-*-dark).
export function clientChipStyle(index) {
  const c = CLIENT_PALETTE[index]
  if (!c) return {}
  return { '--nx-ct-bg': c.light[0], '--nx-ct-fg': c.light[1], '--nx-ct-bg-dark': c.dark[0], '--nx-ct-fg-dark': c.dark[1] }
}
