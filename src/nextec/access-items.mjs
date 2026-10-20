// Acesso de pessoas e equipes a clientes e a máquinas avulsas (telas Equipes e Usuários e Permissões).
// Os itens vêm do servidor (GET /nextec/access/user e /access/team) já com nível, origem e contagem de máquinas.

export const RULE_READ = 1
export const RULE_RW = 2
export const TARGET_USER = 1
export const TARGET_TEAM = 2

export const ruleText = (rule) => (Number(rule) >= RULE_RW ? 'Controle total' : 'Somente ver')

export const originText = (origin) => ({
  direto: 'Direto na pessoa',
  equipe: 'Pela equipe',
  'direto e equipe': 'Direto e pela equipe',
}[origin] || origin || '')

// Separa clientes (listas "Cliente: X") de máquinas avulsas e ordena por nome.
export function splitItems(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  const by = (a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR', { sensitivity: 'base' })
  return {
    clients: list.filter(i => i.kind === 'client').sort(by),
    machines: list.filter(i => i.kind === 'machine').sort(by),
    other: list.filter(i => i.kind !== 'client' && i.kind !== 'machine').sort(by),
  }
}

// Corpo da chamada POST /nextec/access/grant. Cliente exige group_id; máquina exige peer_id (só dígitos).
export function grantPayload({ targetType, targetId, scope, groupId = 0, peerId = '', rule = RULE_READ, remove = false }) {
  const p = { target_type: Number(targetType), target_id: Number(targetId), scope, rule: Number(rule) === RULE_RW ? RULE_RW : RULE_READ }
  if (remove) p.remove = true
  if (scope === 'client') {
    if (!(Number(groupId) > 0)) throw new Error('Escolha o cliente.')
    p.group_id = Number(groupId)
  } else if (scope === 'machine') {
    const id = String(peerId || '').replace(/\s+/g, '')
    if (!id) throw new Error('Escolha a máquina.')
    p.peer_id = id
  } else {
    throw new Error('Tipo de acesso inválido.')
  }
  return p
}

// Só o acesso direto pode ser tirado na tela da pessoa; o que vem da equipe se tira na tela da equipe.
export const removableOnUser = (item) => !!item && (item.origin === 'direto' || item.origin === 'direto e equipe')

// Filtro de texto da tabela de pessoas (usuário, nome, equipe).
export function filterUsers(users, q) {
  const t = String(q || '').trim().toLowerCase()
  const list = Array.isArray(users) ? users : []
  if (!t) return list
  return list.filter(u => [u.username, u.nickname, u.team].some(v => String(v || '').toLowerCase().includes(t)))
}
