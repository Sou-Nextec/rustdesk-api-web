// Saídas de um convite de instalação: o link para o cliente e o comando PowerShell silencioso.
// O MSI sai com o código no nome (<app>-<código>.msi): é por esse nome que o instalador sabe de qual convite veio.
// O comando confere o SHA-256 que já vai escrito nele (um painel adulterado não consegue trocar o arquivo) e só então instala.

import { installerLinkUrl } from './public-links.mjs'

const SAFE_NAME = /[^A-Za-z0-9._-]/g
const CODE_RE = /^[A-HJ-NP-Z2-9]{20}$/
const SHA_RE = /^[a-f0-9]{64}$/i

export function inviteLink (origin, code) {
  if (!CODE_RE.test(code)) throw new Error('Código de convite inválido.')
  return installerLinkUrl(origin, code)
}

export function inviteFileName (fileName, code) {
  if (!CODE_RE.test(code)) throw new Error('Código de convite inválido.')
  const base = String(fileName || 'Nextec-Connect.msi').replace(/\.msi$/i, '').replace(SAFE_NAME, '') || 'Nextec-Connect'
  return `${base}-${code}.msi`
}

export function inviteCommand ({ origin, code, release }) {
  if (!release || !SHA_RE.test(String(release.sha256 || ''))) throw new Error('Nenhuma versão publicada para todos.')
  const link = inviteLink(origin, code)
  const file = inviteFileName(release.file_name, code)
  return [
    `$f = Join-Path $env:TEMP '${file}'`,
    `Invoke-WebRequest -UseBasicParsing -Uri '${link}/baixar' -OutFile $f`,
    `if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -ne '${release.sha256.toLowerCase()}') { Remove-Item -LiteralPath $f -Force; throw 'O arquivo baixado nao confere (hash).' }`,
    `Start-Process -FilePath msiexec.exe -ArgumentList '/i', ('"' + $f + '"'), '/qn', '/norestart' -Wait`,
    'Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue',
  ].join('; ')
}

export function inviteMessage ({ origin, code, label }) {
  return `Olá! Para instalar o aplicativo da Nextec${label ? ' (' + label + ')' : ''}, abra este link no computador, baixe o instalador e dê dois cliques: ${inviteLink(origin, code)}`
}

const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'

// CSV do lote: apelido, descrição, link e comando de cada convite.
export function inviteBatchCsv ({ origin, release, rows }) {
  const lines = ['apelido,descricao,link,comando']
  for (const r of rows) {
    lines.push([r.alias, r.label, inviteLink(origin, r.code), inviteCommand({ origin, code: r.code, release })].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

// Linhas do lote: "apelido; descrição" (a descrição é opcional e, ausente, vale o apelido). Linhas vazias são ignoradas.
export function parseBatchLines (text, max = 200) {
  const items = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [alias, ...rest] = line.split(';')
    const label = rest.join(';').trim() || alias.trim()
    items.push({ alias: alias.trim(), label })
  }
  if (items.length > max) throw new Error(`O lote aceita até ${max} linhas.`)
  return items
}

// O convite só vincula a máquina ao cliente se o instalador (MSI) foi gerado com o gerador 2.3.11 ou mais novo: é dele que
// vem o caminho do arquivo, de onde o agente lê o código. A versão do pacote é a do gerador que o construiu.
export const MIN_INVITE_PACKAGE = '2.3.11'

// true = a versão suporta convites (ou não deu para saber: nunca bloqueia nem avisa à toa).
export function packageSupportsInvites (version, min = MIN_INVITE_PACKAGE) {
  const parse = (v) => String(v || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10))
  const a = parse(version)
  const b = parse(min)
  if (a.length < 2 || a.some(Number.isNaN) || b.some(Number.isNaN)) return true
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return true
}
