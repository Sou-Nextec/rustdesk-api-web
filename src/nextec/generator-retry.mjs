// "Tentar de novo": monta a URL do formulario do gerador com os campos simples do item que falhou.
// Arquivos e segredos nunca voltam. Itens antigos nao tem app_name: nesse caso o campo fica de fora
// (o formulario usa o padrao) e appKnown=false para o painel avisar.
const EXT = /\.(msi|exe|deb|rpm|zip)$/i
const FIELDS = ['client_name', 'profile', 'platform', 'notes']

export function retryUrl(row) {
  const query = new URLSearchParams()
  const exename = String((row && row.filename) || '').replace(EXT, '')
  if (exename) query.set('exename', exename)
  const appName = String((row && row.app_name) || '').trim()
  if (appName) query.set('appname', appName)
  for (const field of FIELDS) if (row && row[field]) query.set(field, row[field])
  const qs = query.toString()
  return { src: '/gerador/' + (qs ? '?' + qs : ''), appKnown: !!appName }
}

// A cada tentativa o nonce muda, mesmo com a URL identica: o iframe mantido montado pode estar
// numa pagina de erro de POST e precisa recarregar.
export function nextRetry(state, row) {
  const { src, appKnown } = retryUrl(row)
  return { src, appKnown, nonce: ((state && state.nonce) || 0) + 1 }
}
