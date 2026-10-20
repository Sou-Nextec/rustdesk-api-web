// Seleção de Cliente e Subgrupo pela hierarquia real (parent_id), usada na edição do dispositivo, nos detalhes e na troca em lote.
// O valor final é sempre UM id de grupo: o subgrupo, ou o cliente quando se escolhe "raiz" (sem subgrupo), ou 0 (sem cliente).

const rows = (groups) => (Array.isArray(groups) ? groups : []).filter(g => g && g.id !== undefined && g.name)
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })
const label = (g) => String(g.path || g.name || '').trim()
const byLabel = (a, b) => collator.compare(a.label, b.label)

// Cadeia do grupo até a raiz, o próprio grupo primeiro; protege contra ciclo e profundidade absurda.
export function chainOf(groups, id) {
  const map = new Map(rows(groups).map(g => [Number(g.id), g]))
  const out = []
  let cur = Number(id) || 0
  while (cur && map.has(cur) && !out.includes(cur) && out.length < 8) {
    out.push(cur)
    cur = Number(map.get(cur).parent_id) || 0
  }
  return out
}

// Clientes: grupos sem pai.
export function clientsOf(groups) {
  return rows(groups).filter(g => !Number(g.parent_id)).map(g => ({ value: Number(g.id), label: label(g) })).sort(byLabel)
}

// Subgrupos de um cliente (todos os níveis abaixo dele), rotulados pelo caminho sem o nome do cliente.
export function subsOf(groups, clientId) {
  const cid = Number(clientId) || 0
  if (!cid) return []
  const root = rows(groups).find(g => Number(g.id) === cid)
  const prefix = root ? label(root) + ' / ' : ''
  return rows(groups)
    .filter(g => Number(g.id) !== cid && chainOf(groups, g.id).slice(1).includes(cid))
    .map(g => ({ value: Number(g.id), label: prefix && label(g).startsWith(prefix) ? label(g).slice(prefix.length) : label(g) }))
    .sort(byLabel)
}

// Do id do grupo do dispositivo para os dois selects.
export function pickOf(groups, groupId) {
  const chain = chainOf(groups, groupId)
  if (!chain.length) return { client: 0, sub: 0 }
  const client = chain[chain.length - 1]
  return { client, sub: chain.length > 1 ? chain[0] : 0 }
}

// Dos dois selects para o id que vai no dispositivo ("raiz" = o próprio cliente).
export function groupIdOf(client, sub) {
  return Number(sub) || Number(client) || 0
}

// Ao trocar o cliente o subgrupo volta para "raiz", salvo se o subgrupo atual pertence ao novo cliente.
export function keepSub(groups, client, sub) {
  return Number(sub) && chainOf(groups, sub).includes(Number(client)) && Number(sub) !== Number(client) ? Number(sub) : 0
}

export function describe(groups, groupId) {
  const g = rows(groups).find(x => Number(x.id) === Number(groupId))
  return g ? label(g) : ''
}
