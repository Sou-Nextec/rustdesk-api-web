export function applicableRollout(row, rollout, scoped = []) {
  const matches = rule => rule.mode !== 'off' && !!rule.version && (rule.mode === 'all' || rule.peers?.includes(row.peer_id || row.id) || (row.group_id && rule.groups?.includes(row.group_id)))
  return scoped.find(matches) || (matches(rollout) ? rollout : null)
}
export function updateState(row, rollout, scoped = [], now = Date.now()) {
  const target = applicableRollout(row, rollout, scoped)
  if (!target) return { label: 'Sem atualização destinada', tone: 'off', eligible: false, target: '' }
  if (!row.seen_at) return { label: 'Nunca informou atualização', tone: 'warn', eligible: true, target: target.version }
  if (now / 1000 - row.seen_at > 48 * 3600) return { label: 'Sem checagem recente', tone: 'warn', eligible: true, target: target.version }
  if (row.version === target.version) return { label: 'Atualizada', tone: 'on', eligible: true, target: target.version }
  return { label: 'Aguardando atualizar', tone: 'warn', eligible: true, target: target.version }
}
