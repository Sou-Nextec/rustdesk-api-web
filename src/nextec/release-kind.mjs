// Tipo de uma versão enviada em Atualizações do app, a partir do "Destinado a" escolhido no gerador (campo profile).
// O painel não adivinha pelo nome do app: o tipo é o que foi declarado na geração.
export function releaseKind (row) {
  const profile = row && row.profile
  if (profile === 'analysts') return { key: 'analysts', label: 'Analistas', tone: 'success' }
  if (profile === 'client') return { key: 'client', label: 'Cliente específico', tone: 'warning' }
  return { key: 'default', label: 'Cliente padrão', tone: 'info' }
}

const label = (row) => `${row.version}${row.client_name ? ' (' + row.client_name + ')' : ''}`

// Texto da confirmação ao disponibilizar uma versão como o app que os analistas baixam. Só uma versão fica assim por
// vez, então ela substitui a atual e o protocolo automático do Conectar passa a seguir o nome do arquivo.
export function analystsDownloadNotice (row, current) {
  const kind = releaseKind(row)
  const parts = [`A versão ${label(row)} (${kind.label}) passa a ser o aplicativo que os analistas baixam em "Baixar aplicativo".`]
  if (current && current.id !== row.id) {
    parts.push(`Ela substitui a versão ${label(current)}, que deixa de ser oferecida aos analistas.`)
  }
  parts.push('O protocolo do botão Conectar passa a seguir o nome deste arquivo, e ninguém é atualizado por isso (para atualizar máquinas, use Publicar).')
  const danger = kind.key !== 'analysts'
  if (danger) {
    parts.push('Atenção: esta versão NÃO foi gerada como "Analistas". Se ela é o cliente dos servidores (com agente de senha), não disponibilize aos analistas.')
  }
  return { title: 'Disponibilizar aos analistas', message: parts.join('\n\n'), danger }
}
