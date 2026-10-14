// Pacote do agente embutido no Ativar-Nextec-<ID>.cmd: os scripts oficiais do painel (nextec/atualizacao) vão dentro do
// próprio arquivo, comprimidos (gzip) e em base64, cada um com o SHA-256 dos bytes. O .cmd confere o hash depois de
// descomprimir e ANTES de gravar qualquer coisa; nada é baixado da internet. Módulo puro: roda no navegador e no node.
//
// Contêiner (antes do gzip): para cada arquivo, uma linha ASCII "<nome> <tamanho>\n" seguida dos <tamanho> bytes
// (UTF-8, BOM preservado). O gzip do conjunto vai em base64, cortado em partes (uma por linha `rem NXPKG <parte>`).

export const AGENT_PACKAGE_FILES = [
  'Coordenar-Agente-Nextec.ps1',
  'Provisionar-Agente-Nextec.ps1',
  'Agente-Senha-Nextec.ps1',
]
export const PACKAGE_PART_SIZE = 7000
export const PACKAGE_MAX_BYTES = 262144

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

const encoder = new TextEncoder()

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(text) {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export async function sha256Hex(bytes) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export const gzipBytes = (bytes) => streamBytes(bytes, new CompressionStream('gzip'))
export const gunzipBytes = (bytes) => streamBytes(bytes, new DecompressionStream('gzip'))

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

// files: { 'Nome.ps1': 'texto' } (o texto já com o BOM, se houver). Devolve { parts, shas, names, size }.
export async function buildAgentPackage(files, names = AGENT_PACKAGE_FILES) {
  const chunks = []
  const shas = {}
  for (const name of names) {
    if (!NAME_RE.test(name)) throw new Error('Nome de script do agente inválido.')
    const text = files && files[name]
    if (typeof text !== 'string' || text.length < 64) throw new Error(`Script do agente ausente no painel: ${name}.`)
    const bytes = encoder.encode(text)
    shas[name] = await sha256Hex(bytes)
    chunks.push(encoder.encode(`${name} ${bytes.length}\n`), bytes)
  }
  const packed = await gzipBytes(concat(chunks))
  if (packed.length > PACKAGE_MAX_BYTES) throw new Error('Pacote do agente grande demais.')
  const b64 = toBase64(packed)
  const parts = []
  for (let i = 0; i < b64.length; i += PACKAGE_PART_SIZE) parts.push(b64.slice(i, i + PACKAGE_PART_SIZE))
  return { names: [...names], parts, shas, size: packed.length }
}

// Contraparte de teste do que o .cmd faz em PowerShell: lê as linhas rem, confere os hashes e devolve os bytes.
export async function readAgentPackage(cmdText) {
  const lines = String(cmdText).split(/\r?\n/)
  const parts = lines.filter(l => l.startsWith('rem NXPKG ')).map(l => l.slice(10).trim())
  const shas = {}
  for (const l of lines) {
    const m = l.match(/^rem NXSHA (\S+) ([0-9a-f]{64})$/)
    if (m) shas[m[1]] = m[2]
  }
  const raw = await gunzipBytes(fromBase64(parts.join('')))
  const out = {}
  let at = 0
  while (at < raw.length) {
    const nl = raw.indexOf(10, at)
    const m = new TextDecoder().decode(raw.subarray(at, nl)).match(/^(\S+) (\d+)$/)
    if (!m || !NAME_RE.test(m[1])) throw new Error('Pacote inválido.')
    const len = Number(m[2])
    const bytes = raw.subarray(nl + 1, nl + 1 + len)
    if (bytes.length !== len) throw new Error('Pacote truncado.')
    if (shas[m[1]] !== await sha256Hex(bytes)) throw new Error(`Hash divergente: ${m[1]}.`)
    out[m[1]] = bytes
    at = nl + 1 + len
  }
  return out
}
