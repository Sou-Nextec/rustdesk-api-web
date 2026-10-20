// De onde vem a regra de troca de senha de uma máquina. O servidor resolve assim (nextec_policy_inherit.go): vale a regra MAIS
// PRÓXIMA da máquina, inteira: a da própria máquina (mesmo desligada), senão a do subgrupo, senão a do cliente (subindo pela
// hierarquia), senão a global. Uma regra de grupo desligada também vale e encerra a busca.
// O servidor devolve rule_origin / rule_origin_group / rule_origin_name em cada máquina; sem esses campos (servidor antigo)
// o cálculo é refeito aqui com a hierarquia dos grupos (parent_id).

export function everyText(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return ''
  if (m % 60 === 0) return m / 60 === 1 ? 'hora' : `${m / 60} h`
  return `${m} min`
}

const list = (v) => (Array.isArray(v) ? v.filter(p => p && typeof p === 'object') : [])

// Grupo e seus ancestrais (o próprio grupo primeiro), pela hierarquia real.
function chain(groups, gid) {
  const map = new Map(list(groups).map(g => [Number(g.id), g]))
  const out = []
  let cur = Number(gid) || 0
  while (cur && !out.includes(cur) && out.length < 8) {
    out.push(cur)
    const g = map.get(cur)
    cur = g ? Number(g.parent_id) || 0 : 0
  }
  return out
}

const nameOfGroup = (groups, id) => {
  const g = list(groups).find(x => Number(x.id) === Number(id))
  return g ? String(g.path || g.name || '') : ''
}

// Qual regra de GRUPO valeria para a máquina sem a regra própria: cliente ou subgrupo mais próximo, depois a global.
function groupSideRule(gid, rows, groups) {
  const ids = list(groups).length ? chain(groups, gid) : (gid ? [Number(gid)] : []) // sem a lista de grupos, só o grupo exato
  for (const id of ids) {
    const hit = rows.find(p => p.kind === 'group' && String(p.ref) === String(id))
    if (hit) return { row: hit, source: 'client', groupId: id }
  }
  const global = rows.find(p => p.kind === 'global')
  return global ? { row: global, source: 'global', groupId: 0 } : null
}

export function ruleOf(device, policies, groups) {
  const rows = list(policies)
  const peerId = String(device && device.peer_id !== undefined ? device.peer_id : '')
  const gid = device && device.group_id ? Number(device.group_id) : 0
  const own = rows.find(p => p.kind === 'peer' && String(p.ref) === peerId)
  const global = rows.find(p => p.kind === 'global')
  const side = groupSideRule(gid, rows, groups)
  const base = { clientRule: side ? side.row : null, autoApprove: false, inheritedFrom: '', originGroup: 0 }
  const fromRow = (row, source, groupId) => ({
    ...base, source, enabled: !!row.enabled, interval: Number(row.interval_minutes) || 0, autoApprove: !!row.auto_approve, originGroup: groupId,
    inheritedFrom: source === 'client' && groupId && groupId !== gid ? (nameOfGroup(groups, groupId) || `grupo ${groupId}`) : '',
  })
  const none = { ...base, source: 'none', enabled: false, interval: 0 }
  // o servidor já resolveu: usa a origem dele e busca só a linha da regra (intervalo)
  const origin = device && device.rule_origin
  if (origin === 'none') return none
  if (origin === 'peer' && own) return fromRow(own, 'machine', 0)
  if (origin === 'group' && device.rule_origin_group) {
    const row = rows.find(p => p.kind === 'group' && String(p.ref) === String(device.rule_origin_group))
    if (row) return fromRow(row, 'client', Number(device.rule_origin_group))
  }
  if (origin === 'global' && global) return fromRow(global, 'global', 0)
  if (own) return fromRow(own, 'machine', 0)
  if (side) return fromRow(side.row, side.source, side.groupId)
  return none
}

// Selo da coluna "Regra da senha": quem manda e quanto tempo.
export function ruleBadge(rule) {
  if (rule.source === 'machine' && rule.enabled) return { tone: 'machine', title: 'Da máquina', detail: `troca a cada ${everyText(rule.interval)}` }
  if (rule.source === 'machine') {
    const ignored = rule.clientRule && rule.clientRule.enabled
    return { tone: 'off', title: 'Desligada', detail: ignored ? 'nesta máquina (o cliente tem regra)' : 'nesta máquina' }
  }
  if (rule.source === 'client' && rule.enabled) {
    const from = rule.inheritedFrom ? ` (herdada de ${rule.inheritedFrom})` : ''
    return { tone: 'client', title: rule.inheritedFrom ? 'Herdada' : 'Do cliente', detail: `troca a cada ${everyText(rule.interval)}${from}` }
  }
  if (rule.source === 'client') return { tone: 'off', title: 'Desligada', detail: rule.inheritedFrom ? `regra desligada em ${rule.inheritedFrom}` : 'regra do cliente desligada' }
  if (rule.source === 'global' && rule.enabled) return { tone: 'global', title: 'Global', detail: `troca a cada ${everyText(rule.interval)}, todas as máquinas` }
  if (rule.source === 'global') return { tone: 'off', title: 'Desligada', detail: 'regra global desligada' }
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

// Frase que explica o que "Seguir o cliente" faz para esta máquina (a regra do cliente, do subgrupo ou a global).
export function followText(rule, clientName) {
  const cr = rule.clientRule
  if (!clientName) return 'Esta máquina ainda não tem cliente.'
  if (cr && cr.kind === 'global') {
    return cr.enabled ? `Segue a regra global: troca a cada ${everyText(cr.interval_minutes)}.` : 'A regra global está desligada: a senha não troca.'
  }
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

// Frases de origem para o painel de detalhes e a tela Políticas ("própria", "herdada de X", "global").
export function originText(origin, originName, originGroupId, deviceGroupId) {
  if (origin === 'peer') return 'própria desta máquina'
  if (origin === 'global') return 'global (todas as máquinas)'
  if (origin === 'group') return Number(originGroupId) && Number(originGroupId) === Number(deviceGroupId) ? `do grupo ${originName || ''}`.trim() : `herdada de ${originName || 'um grupo acima'}`
  return 'sem regra'
}
