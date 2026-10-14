const TICKET_MODES = new Set(['off', 'optional', 'required'])
const REQUIRED_TICKET_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/

/** Executa a preparação comum de conexão com dependências injetadas para testes. */
export async function prepareConnection (id, { loadSettings, askTicket, saveNote, requestLink, reviewLink }) {
  const peerId = String(id).replace(/\s+/g, '')
  if (!peerId) throw new Error('ID do dispositivo vazio.')

  const settings = await loadSettings()
  const mode = settings?.data?.mode
  if (settings?.code !== 0 || !TICKET_MODES.has(mode)) {
    throw new Error('Não foi possível confirmar as regras de conexão. Tente novamente.')
  }

  let ticket = ''
  if (mode !== 'off') {
    const answer = await askTicket(peerId, mode)
    if (answer === false) return null
    ticket = String(answer || '').trim()
    if (mode === 'required' && !REQUIRED_TICKET_RE.test(ticket)) {
      throw new Error('Informe um número de chamado válido para iniciar a conexão.')
    }

    try {
      const result = await saveNote(peerId, ticket)
      if (result?.code !== 0) throw new Error('Falha ao registrar o chamado.')
    } catch (error) {
      if (mode === 'required') throw new Error('Não foi possível registrar o chamado obrigatório. A conexão não foi iniciada.')
    }
  }

  const result = await requestLink(peerId)
  const url = result?.data?.url
  if (result?.code !== 0 || typeof url !== 'string' || !url) {
    throw new Error(result?.msg || 'Não foi possível preparar a conexão. Verifique sua permissão e tente novamente.')
  }
  // Gancho opcional: o painel pode avisar do estado da máquina (senha ainda não aplicada) antes de abrir o app.
  // Devolver false cancela sem abrir nada. O link autorizado continua sendo o do servidor, sem alteração.
  if (typeof reviewLink === 'function') {
    const proceed = await reviewLink(peerId, result.data)
    if (proceed === false) return null
  }
  return { id: peerId, url, link: result.data }
}
