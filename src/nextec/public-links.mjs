// Endereços públicos dos links entregues ao cliente. O domínio é configurável no painel (ex.: https://suporte.nex.tec.br);
// os caminhos são fixos para o proxy poder repassar só estes prefixos ao painel: /instalador/<código> e /atendimento/<código>.

export const INSTALLER_PREFIX = '/instalador'
export const SUPPORT_PREFIX = '/atendimento'

// Base efetiva: o endereço configurado ou, sem ele, o endereço em que o painel foi aberto. Sem barra no fim.
export function publicBase (configured, fallback) {
  const pick = String(configured || '').trim() || String(fallback || '').trim()
  return pick.replace(/\/+$/, '')
}

export function installerLinkUrl (base, code) {
  return `${publicBase(base, '')}${INSTALLER_PREFIX}/${encodeURIComponent(code)}`
}

export function supportLinkUrl (base, token) {
  return `${publicBase(base, '')}${SUPPORT_PREFIX}/${encodeURIComponent(token)}`
}

// Validação no navegador, igual à do servidor: https://dominio, sem porta, caminho ou parâmetros. Vazio é válido.
export function checkPublicUrl (raw) {
  const v = String(raw || '').trim()
  if (!v) return { ok: true, value: '' }
  const bad = { ok: false, message: 'Use https://dominio, sem porta, caminho ou parâmetros (ex.: https://suporte.empresa.com.br).' }
  if (v.length > 200) return bad
  let u
  try { u = new URL(v) } catch (e) { return bad }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return bad
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return bad
  return { ok: true, value: `https://${host}` }
}
