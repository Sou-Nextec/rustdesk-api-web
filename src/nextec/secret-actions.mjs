export function secretActionState(row = {}) {
  const canReveal = Boolean(row.has_password || row.pending)
  const canRotate = Boolean(row.enrolled && row.managed)

  return {
    rotation: !row.managed ? 'disabled' : row.enrolled ? 'active' : 'waiting-agent',
    canReveal,
    revealReason: canReveal
      ? ''
      : row.enrolled && row.managed
        ? 'Aguardando o agente registrar a primeira senha.'
        : row.enrolled
          ? 'Nenhuma senha foi registrada pelo agente ainda.'
          : 'Instale o agente Nextec nesta máquina para receber a primeira senha.',
    canRotate,
    rotateReason: canRotate
      ? ''
      : row.enrolled
        ? 'Ligue a regra de senha automática para esta máquina ou grupo.'
        : 'Instale o agente Nextec nesta máquina para solicitar a troca.',
  }
}

// Corpo do POST /nextec/secrets/assign: o intervalo só vai com a regra da máquina e o uuid visto na lista segue junto,
// para a API recusar se a identidade da pendente mudou depois que o admin a viu.
// 'group-enable' (padrão quando o cliente não tem regra) vira rule 'group' + enable_group_rule: o backend liga a regra
// do cliente e atribui na mesma transação; o intervalo escolhido vai como group_interval_minutes.
export function assignPayload(form = {}) {
  const enable = form.rule === 'group-enable'
  const body = { id: form.peer, client_id: form.client, rule: enable ? 'group' : form.rule, move: Boolean(form.move) }
  if (form.rule === 'peer') body.interval_minutes = form.interval
  if (enable) {
    body.enable_group_rule = true
    if (Number(form.interval) > 0) body.group_interval_minutes = Number(form.interval)
  }
  if (form.uuid) body.uuid = form.uuid
  return body
}

// Pendentes da lista: total e quantas foram inscritas com uma credencial já girada (selo "chave anterior").
export function pendingSummary(devices = []) {
  const pending = devices.filter(d => d && d.state === 'pending')
  return { total: pending.length, stale: pending.filter(d => d.stale_key === true).length }
}
