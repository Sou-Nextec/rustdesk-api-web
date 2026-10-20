// Parâmetros da lista de dispositivos paginada no servidor (GET /nextec/devices) e a árvore de clientes da lateral.
// Os filtros da tela são: cliente (id, 0 = sem cliente), subgrupo ('none' = só o cliente, ou o id do subgrupo com os níveis abaixo),
// situação (online, offline, fav), busca e ordem. O servidor devolve só a página pedida.

export const PAGE_MAX = 200

export function deviceQueryParams({ page = 1, pageSize = 20, q = '', client = null, sub = null, status = null, sort = 'online', favorites = [] } = {}) {
  const p = { page: Math.max(1, Number(page) || 1), page_size: Math.min(PAGE_MAX, Math.max(1, Number(pageSize) || 20)), sort }
  const term = String(q || '').trim()
  if (term) p.q = term
  const c = typeof client === 'number' ? client : null
  if (c === 0) p.no_client = 1
  else if (c > 0 && sub === 'none') p.sub_id = c // só as máquinas direto no cliente
  else if (typeof sub === 'number' && sub > 0) p.client_id = sub // subgrupo e os níveis abaixo
  else if (c > 0) p.client_id = c // cliente com todos os subgrupos
  if (status === 'online' || status === 'offline') p.status = status
  if (status === 'fav') {
    const ids = (Array.isArray(favorites) ? favorites : []).map(f => String(f && f.id !== undefined ? f.id : f).replace(/\s+/g, '')).filter(Boolean)
    p.ids = ids.length ? ids.join(',') : '-' // sem favoritos: nada na lista
  }
  return p
}

// Árvore plana (cliente, depois os subgrupos) com profundidade, contagem e pai, pronta para desenhar com recuo.
export function treeRows(nodes) {
  const list = (Array.isArray(nodes) ? nodes : []).filter(n => n && typeof n === 'object')
  const byParent = new Map()
  for (const n of list) {
    const k = Number(n.parent_id) || 0
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(n)
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' })
  const out = []
  const seen = new Set()
  const walk = (parent, depth, root) => {
    for (const n of (byParent.get(parent) || []).sort(byName)) {
      if (seen.has(n.group_id) || depth > 8) continue
      seen.add(n.group_id)
      const kids = (byParent.get(Number(n.group_id)) || []).length
      out.push({ ...n, depth, root: root || n.group_id, kids, label: depth === 0 ? n.name : String(n.name).split(' / ').slice(-1)[0] })
      walk(Number(n.group_id), depth + 1, root || n.group_id)
    }
  }
  walk(0, 0, 0)
  return out
}

// O que um clique na árvore muda nos filtros da tela.
export function treeSelection(row) {
  if (!row) return { client: null, sub: null }
  if (row.kind === 'none') return { client: 0, sub: null }
  if (!row.group_id) return { client: null, sub: null }
  if (row.depth === 0) return { client: row.group_id, sub: null }
  return { client: row.root, sub: row.group_id }
}

// A linha da árvore está marcada com os filtros atuais?
export function treeActive(row, client, sub) {
  if (row.kind === 'all') return client === null && sub === null
  if (row.kind === 'none') return client === 0
  if (row.depth === 0) return client === row.group_id && (sub === null || sub === undefined)
  return sub === row.group_id
}

// Exportação: baixa todas as páginas do filtro até o total que o servidor informa. Acima de EXPORT_MAX recusa de forma explícita
// (reason 'too_many') em vez de cortar em silêncio; se o servidor parar de devolver linhas antes do total, é 'incomplete'.
export const EXPORT_MAX = 20000

export async function collectAllPages(fetchPage, { max = EXPORT_MAX } = {}) {
  const rows = []
  let total = 0
  for (let page = 1; ; page++) {
    const r = await fetchPage(page).catch(() => false)
    if (!r || !r.data) return { ok: false, reason: 'error', rows: [], total }
    total = Number(r.data.total) || 0
    if (total > max) return { ok: false, reason: 'too_many', rows: [], total }
    const list = Array.isArray(r.data.list) ? r.data.list : []
    rows.push(...list)
    if (rows.length >= total) return { ok: true, rows, total }
    if (!list.length) return { ok: false, reason: 'incomplete', rows, total }
  }
}
