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
