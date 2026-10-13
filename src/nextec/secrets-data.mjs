// Normaliza as respostas de GET /nextec/secrets e da lista de clientes. O Go serializa slice nil como null e um
// servidor mais antigo pode não mandar os campos novos: a tela nunca deve receber null onde espera lista.
const list = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [])
const count = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function normalizeOverview(res) {
  const data = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : {}
  const devices = list(data.devices)
  const pending = devices.filter(d => d.state === 'pending')
  return {
    devices,
    policies: list(data.policies).map(p => ({ ...p })),
    blocked: list(data.blocked),
    agentKeySet: Boolean(data.agent_key_set),
    pendingCount: count(data.pending_count) || pending.length,
    staleCount: count(data.stale_count) || pending.filter(d => d.stale_key === true).length,
  }
}

export function normalizeGroups(res) {
  const data = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : {}
  return list(data.list)
}
