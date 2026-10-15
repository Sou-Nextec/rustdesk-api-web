// Ações do RustDesk que o link aceita no lugar de "conectar": <protocolo>://<ação>/<id>?password=...
// O link autorizado continua sendo o do servidor (com a senha só para quem pode lê-la); aqui só se troca o caminho.
export const CONNECT_ACTIONS = ['file-transfer']

export function urlForAction (url, action) {
  if (!action) return url
  if (!CONNECT_ACTIONS.includes(action)) throw new Error('Ação de conexão desconhecida.')
  const m = typeof url === 'string' ? url.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]+)(.*)$/) : null
  if (!m) throw new Error('Link de conexão inválido.')
  return `${m[1]}://${action}/${m[2]}${m[3]}`
}
