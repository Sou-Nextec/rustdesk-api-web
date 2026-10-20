// Linhas da "Visão por cliente e subgrupo" (tela Políticas). Os dados vêm de GET /nextec/policies/scopes, que já traz a regra
// efetiva e a origem de cada grupo; aqui só vira texto para a tela e ordem em árvore (cliente, depois seus subgrupos).
import { everyText } from './secret-rule.mjs'

const list = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [])

// own = regra no próprio grupo; inherited = de um grupo acima; global = regra global; none = sem regra
function toneOf(origin, ownFlag) {
  if (origin === 'global') return 'global'
  if (origin === 'group') return ownFlag ? 'own' : 'inherited'
  return 'none'
}

function originLabel(tone, name) {
  if (tone === 'own') return 'Própria'
  if (tone === 'inherited') return name ? `Herdada de ${name}` : 'Herdada'
  if (tone === 'global') return 'Global'
  return 'Sem regra'
}

export function secretText(s) {
  if (!s || s.origin === 'none') return 'a senha não troca sozinha'
  if (!s.enabled) return 'troca desligada'
  return `troca a cada ${everyText(s.interval_minutes)}${s.auto_approve ? ', aprova sozinho' : ''}`
}

export function appText(enabled, options, catalog) {
  if (!enabled) return 'sem ajustes: o app fica como está'
  const names = new Map(list(catalog).map(c => [c.key, c.label.toLowerCase()]))
  const items = Object.entries(options || {}).filter(([, v]) => v).map(([k, v]) => {
    if (k === 'access-mode') return v === 'view' ? 'só visualizar' : `modo de acesso ${v}`
    return `${v === 'Y' ? 'permite' : v === 'N' ? 'bloqueia' : v} ${names.get(k) || k}`
  })
  return items.length ? items.join(', ') : 'nada alterado (tudo no padrão)'
}

// Ordena em árvore pelo caminho ("Cliente", "Cliente / Sub") e marca a profundidade para o recuo.
export function scopeRows(scopes, catalog) {
  const rows = list(scopes).map(s => {
    const secretTone = toneOf(s.secret && s.secret.origin, s.own_secret)
    const appTone = toneOf(s.app_origin && s.app_origin.origin, s.own_app)
    const path = String(s.path || s.name || '')
    return {
      ...s,
      path,
      depth: Math.max(0, path.split(' / ').length - 1),
      secretTone,
      secretOrigin: originLabel(secretTone, s.secret && s.secret.origin_name),
      secretText: secretText(s.secret),
      appTone,
      appOrigin: originLabel(appTone, s.app_origin && s.app_origin.origin_name),
      appText: appText(s.app_enabled, s.app_options, catalog),
    }
  })
  return rows.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'))
}
