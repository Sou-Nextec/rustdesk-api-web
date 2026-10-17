// Clientes e subgrupos na lista de dispositivos. Um subgrupo é um grupo chamado "Cliente / Subgrupo" (ver Clientes.vue);
// o filtro por cliente lista só os clientes e inclui os subgrupos deles, e o filtro de subgrupo refina dentro do cliente.

export const SEP = ' / '
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })
const byLabel = (a, b) => collator.compare(a.label, b.label)

export function splitGroupName(name) {
  const text = String(name || '')
  const at = text.indexOf(SEP)
  if (at < 0) return { client: text.trim(), sub: '' }
  return { client: text.slice(0, at).trim(), sub: text.slice(at + SEP.length).trim() }
}

const list = (groups) => (Array.isArray(groups) ? groups : []).filter(g => g && g.id !== undefined && g.name)

// Clientes para o filtro: só os de primeiro nível. Um subgrupo cujo cliente não existe como grupo ganha um cliente virtual
// ('n:Nome'), para nunca ficar fora do filtro.
export function clientOptions(groups) {
  const rows = list(groups)
  const roots = rows.filter(g => !String(g.name).includes(SEP)).map(g => ({ value: g.id, label: String(g.name).trim() }))
  const known = new Set(roots.map(r => r.label))
  const orphans = new Set()
  for (const g of rows) {
    const { client, sub } = splitGroupName(g.name)
    if (sub && !known.has(client) && !orphans.has(client)) orphans.add(client)
  }
  return [...roots, ...[...orphans].map(name => ({ value: 'n:' + name, label: name }))].sort(byLabel)
}

// Nome do cliente que o valor do filtro representa ('' para "Sem cliente" ou sem filtro).
export function clientRootOf(clientValue, nameOf) {
  if (clientValue === null || clientValue === undefined || clientValue === '' || clientValue === 0) return ''
  if (typeof clientValue === 'string' && clientValue.startsWith('n:')) return clientValue.slice(2)
  return splitGroupName(nameOf(clientValue)).client
}

// Subgrupos do cliente escolhido (para o segundo filtro), com a contagem de dispositivos.
export function subOptions(groups, clientValue, nameOf, devices = []) {
  const root = clientRootOf(clientValue, nameOf)
  if (!root) return []
  return list(groups)
    .map(g => ({ g, parts: splitGroupName(g.name) }))
    .filter(x => x.parts.client === root && x.parts.sub)
    // a contagem usa o mesmo critério do filtro: inclui as máquinas dos níveis abaixo do subgrupo
    .map(x => ({ value: x.g.id, label: x.parts.sub, count: devices.filter(d => matchesSub(d.group_id || 0, x.g.id, nameOf)).length }))
    .sort(byLabel)
}

export function matchesClient(groupId, clientValue, nameOf) {
  if (clientValue === null || clientValue === undefined || clientValue === '') return true
  if (clientValue === 0) return !groupId
  return !!groupId && splitGroupName(nameOf(groupId)).client === clientRootOf(clientValue, nameOf)
}

// subValue: null (todos), 'none' (só o cliente, sem subgrupo) ou o id de um subgrupo (inclui níveis abaixo dele).
export function matchesSub(groupId, subValue, nameOf) {
  if (subValue === null || subValue === undefined || subValue === '') return true
  const name = String(nameOf(groupId) || '')
  if (subValue === 'none') return !splitGroupName(name).sub
  const wanted = String(nameOf(subValue) || '')
  return !!wanted && (name === wanted || name.startsWith(wanted + SEP))
}

// Texto do cliente e do subgrupo de um dispositivo, para a coluna e as seções.
export function deviceClientParts(groupName) {
  const { client, sub } = splitGroupName(groupName)
  return { client, sub }
}
