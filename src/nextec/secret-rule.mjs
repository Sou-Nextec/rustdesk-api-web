// De onde vem a regra de troca de senha de uma máquina. O servidor resolve assim (effectivePolicy): a regra da própria máquina
// vence a do cliente, mesmo desligada; sem regra da máquina vale a do grupo EXATO em que ela está (subgrupo não herda do cliente).

export function everyText(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return ''
  if (m % 60 === 0) return m / 60 === 1 ? 'hora' : `${m / 60} h`
  return `${m} min`
}

const list = (v) => (Array.isArray(v) ? v.filter(p => p && typeof p === 'object') : [])

export function ruleOf(device, policies) {
  const rows = list(policies)
  const peerId = String(device && device.peer_id !== undefined ? device.peer_id : '')
  const gid = device && device.group_id ? String(device.group_id) : ''
  const own = rows.find(p => p.kind === 'peer' && String(p.ref) === peerId)
  const group = gid ? rows.find(p => p.kind === 'group' && String(p.ref) === gid) : null
  if (own) return { source: 'machine', enabled: !!own.enabled, interval: Number(own.interval_minutes) || 0, clientRule: group || null }
  if (group) return { source: 'client', enabled: !!group.enabled, interval: Number(group.interval_minutes) || 0, clientRule: group }
  return { source: 'none', enabled: false, interval: 0, clientRule: null }
}

// Selo da coluna "Regra da senha": quem manda e quanto tempo.
export function ruleBadge(rule) {
  if (rule.source === 'machine' && rule.enabled) return { tone: 'machine', title: 'Da máquina', detail: `troca a cada ${everyText(rule.interval)}` }
  if (rule.source === 'machine') {
    const ignored = rule.clientRule && rule.clientRule.enabled
    return { tone: 'off', title: 'Desligada', detail: ignored ? 'nesta máquina (o cliente tem regra)' : 'nesta máquina' }
  }
  if (rule.source === 'client' && rule.enabled) return { tone: 'client', title: 'Do cliente', detail: `troca a cada ${everyText(rule.interval)}` }
  if (rule.source === 'client') return { tone: 'off', title: 'Desligada', detail: 'regra do cliente desligada' }
  return { tone: 'none', title: 'Sem regra', detail: 'a senha não troca sozinha' }
}

// O que cada escolha da janela da máquina manda para o servidor.
export function ruleChange(peerId, choice, interval) {
  const ref = String(peerId)
  if (choice === 'client') return { kind: 'peer', ref, remove: true }
  if (choice === 'off') return { kind: 'peer', ref, enabled: false, interval_minutes: Number(interval) || 180 }
  return { kind: 'peer', ref, enabled: true, interval_minutes: Number(interval) || 180 }
}

// Escolha inicial da janela, a partir do que vale hoje.
export function ruleChoice(rule) {
  if (rule.source === 'machine') return rule.enabled ? 'machine' : 'off'
  return 'client'
}

// Frase que explica o que "Seguir o cliente" faz para esta máquina.
export function followText(rule, clientName) {
  const cr = rule.clientRule
  if (!clientName) return 'Esta máquina ainda não tem cliente.'
  if (cr && cr.enabled) return `Troca a cada ${everyText(cr.interval_minutes)}, como as outras máquinas de ${clientName}.`
  if (cr) return `A regra de ${clientName} está desligada: a senha não troca.`
  return `${clientName} não tem regra ligada: a senha não troca.`
}

// Regras dos clientes: quantas máquinas seguem cada uma e quantas têm regra própria.
export function groupUsage(groupPolicy, devices, policies) {
  const rows = list(policies)
  const own = new Set(rows.filter(p => p.kind === 'peer').map(p => String(p.ref)))
  const inGroup = list(devices).filter(d => String(d.group_id || '') === String(groupPolicy.ref) && d.state !== 'pending')
  const own_ = inGroup.filter(d => own.has(String(d.peer_id))).length
  return { follow: inGroup.length - own_, own: own_, total: inGroup.length }
}
