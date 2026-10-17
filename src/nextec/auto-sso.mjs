// Entrada automática pelo login externo (Microsoft Entra). O painel fica atrás do Cloudflare Access, então quem vê a tela de
// login já provou quem é para a Microsoft; com um único provedor configurado, abrir o fluxo OIDC é transparente (a sessão do
// Entra já existe). Nada aqui confia em cabeçalho do Cloudflare: o login continua sendo validado pelo OIDC no servidor.
//
// Duas travas evitam o pior: quem saiu de propósito não é reconectado na hora, e uma tentativa que volta para o login (erro do
// Entra, aplicativo mal configurado) não vira loop de redirecionamentos.

export const OFF_KEY = 'nx-sso-off'
export const TRY_KEY = 'nx-sso-try'
export const RETRY_WINDOW_MS = 60 * 1000

const read = (storage, key) => { try { return storage ? storage.getItem(key) : null } catch (e) { return null } }
const write = (storage, key, value) => { try { if (storage) storage.setItem(key, value) } catch (e) { /* armazenamento indisponível: sem as travas, o botão manual continua valendo */ } }
const drop = (storage, key) => { try { if (storage) storage.removeItem(key) } catch (e) { /* idem */ } }

// Devolve o nome do provedor a abrir sozinho, ou '' quando a pessoa deve escolher/usar a senha.
export function autoSsoProvider({ ops, query = {}, storage, now = Date.now() }) {
  const list = Array.isArray(ops) ? ops.filter(Boolean) : []
  if (list.length !== 1) return ''
  // ?manual=1 (ou ?senha=1) mostra o formulário de sempre, para quem precisa entrar com usuário e senha
  if (query.manual !== undefined || query.senha !== undefined) return ''
  if (read(storage, OFF_KEY)) return ''
  const last = Number(read(storage, TRY_KEY)) || 0
  if (last && now - last >= 0 && now - last < RETRY_WINDOW_MS) return ''
  return String(list[0])
}

export const markAttempt = (storage, now = Date.now()) => write(storage, TRY_KEY, String(now))
// Saída explícita (menu do usuário): a próxima visita à tela de login mostra o botão em vez de reconectar na hora.
export const markLoggedOut = (storage) => write(storage, OFF_KEY, '1')
// Entrou de novo (por qualquer método): limpa as duas travas.
export const clearSsoFlags = (storage) => { drop(storage, OFF_KEY); drop(storage, TRY_KEY) }

export const isMicrosoft = (provider) => String(provider || '').toLowerCase() === 'microsoft'
export const providerLabel = (provider, translate = (x) => x) => (isMicrosoft(provider) ? 'Entrar com a Microsoft' : translate(provider))
