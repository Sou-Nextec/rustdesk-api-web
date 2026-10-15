// Assinatura do manifesto de uma versão do Nextec Connect feita no navegador do operador.
// A chave privada (PEM PKCS#8 cifrado) é lida do disco pelo próprio navegador, aberta com a senha digitada aqui e usada
// só para assinar; nada disso é enviado ao painel. O formato do manifesto é idêntico ao de
// nextec/atualizacao/assinador/assinar-pedido-connect.py (_build_manifest), RSA PKCS#1 v1.5 com SHA-256.

const subtle = () => {
  const c = globalThis.crypto
  if (!c || !c.subtle) throw new Error('Este navegador não oferece criptografia segura (use HTTPS).')
  return c.subtle
}

// ---------- DER mínimo ----------
function readTlv (buf, off) {
  if (off + 2 > buf.length) throw new Error('Chave em formato inesperado.')
  const tag = buf[off]
  let len = buf[off + 1]
  let p = off + 2
  if (len & 0x80) {
    const n = len & 0x7f
    if (n < 1 || n > 4 || p + n > buf.length) throw new Error('Chave em formato inesperado.')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++]
  }
  if (p + len > buf.length) throw new Error('Chave em formato inesperado.')
  return { tag, start: p, end: p + len, next: p + len }
}

function children (buf, tlv) {
  const out = []
  let o = tlv.start
  while (o < tlv.end) {
    const t = readTlv(buf, o)
    out.push(t)
    o = t.next
  }
  return out
}

function oid (buf, tlv) {
  if (tlv.tag !== 0x06 || tlv.end <= tlv.start) throw new Error('Chave em formato inesperado.')
  const bytes = buf.subarray(tlv.start, tlv.end)
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40]
  let value = 0
  for (let i = 1; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f)
    if (!(bytes[i] & 0x80)) { parts.push(value); value = 0 }
  }
  return parts.join('.')
}

const intValue = (buf, tlv) => {
  if (tlv.tag !== 0x02) throw new Error('Chave em formato inesperado.')
  let v = 0
  for (let i = tlv.start; i < tlv.end; i++) v = v * 256 + buf[i]
  return v
}

const OID_PBES2 = '1.2.840.113549.1.5.13'
const OID_PBKDF2 = '1.2.840.113549.1.5.12'
const PRF = {
  '1.2.840.113549.2.7': 'SHA-1',
  '1.2.840.113549.2.9': 'SHA-256',
  '1.2.840.113549.2.10': 'SHA-384',
  '1.2.840.113549.2.11': 'SHA-512',
}
const AES_CBC = { '2.16.840.1.101.3.4.1.2': 128, '2.16.840.1.101.3.4.1.22': 192, '2.16.840.1.101.3.4.1.42': 256 }
const MAX_ITERATIONS = 5000000

export function pemToDer (text) {
  const match = String(text || '').match(/-----BEGIN ENCRYPTED PRIVATE KEY-----([\s\S]+?)-----END ENCRYPTED PRIVATE KEY-----/)
  if (!match) {
    if (/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(String(text || ''))) {
      throw new Error('A chave não está cifrada com senha. Use a chave cifrada (PKCS#8) do atualizador.')
    }
    throw new Error('Arquivo não é uma chave privada cifrada (PEM).')
  }
  const b64 = match[1].replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Abre a chave cifrada (PBES2: PBKDF2 + AES-CBC) e devolve a CryptoKey de assinatura (não exportável). */
export async function openPrivateKey (pemText, passphrase) {
  const der = pemToDer(pemText)
  if (typeof passphrase !== 'string' || !passphrase) throw new Error('Digite a senha da chave.')
  const root = readTlv(der, 0)
  const [algId, data] = children(der, root)
  if (!algId || !data || data.tag !== 0x04) throw new Error('Chave em formato inesperado.')
  const [algOid, algParams] = children(der, algId)
  if (oid(der, algOid) !== OID_PBES2) throw new Error('Cifra da chave não suportada (esperado PBES2/PBKDF2 com AES).')
  const [kdf, scheme] = children(der, algParams)
  const [kdfOid, kdfParams] = children(der, kdf)
  if (oid(der, kdfOid) !== OID_PBKDF2) throw new Error('Derivação de chave não suportada (esperado PBKDF2).')
  const kp = children(der, kdfParams)
  if (kp[0].tag !== 0x04) throw new Error('Chave em formato inesperado.')
  const salt = der.slice(kp[0].start, kp[0].end)
  const iterations = intValue(der, kp[1])
  if (iterations < 1 || iterations > MAX_ITERATIONS) throw new Error('Número de iterações da chave fora do limite.')
  let hash = 'SHA-1'
  for (const extra of kp.slice(2)) {
    if (extra.tag === 0x30) {
      const [prfOid] = children(der, extra)
      hash = PRF[oid(der, prfOid)]
      if (!hash) throw new Error('Função de derivação da chave não suportada.')
    }
  }
  const [schemeOid, ivTlv] = children(der, scheme)
  const bits = AES_CBC[oid(der, schemeOid)]
  if (!bits) throw new Error('Cifra da chave não suportada (esperado AES-CBC).')
  const iv = der.slice(ivTlv.start, ivTlv.end)
  if (ivTlv.tag !== 0x04 || iv.length !== 16) throw new Error('Chave em formato inesperado.')

  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const aes = await subtle().deriveKey({ name: 'PBKDF2', salt, iterations, hash }, base, { name: 'AES-CBC', length: bits }, false, ['decrypt'])
  try {
    const pkcs8 = await subtle().decrypt({ name: 'AES-CBC', iv }, aes, der.subarray(data.start, data.end))
    return await subtle().importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  } catch (e) {
    throw new Error('Senha incorreta ou chave inválida.')
  }
}

// ---------- manifesto ----------
function stable (value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

const isoZ = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Mesmo manifesto do assinador local: JSON com chaves ordenadas, sem espaços, validade de 30 dias. */
export function buildManifest (request, now = new Date()) {
  const when = new Date(Math.floor(now.getTime() / 1000) * 1000)
  const manifest = {
    produto: 'nextec-connect',
    formato: 1,
    sequencia: request.sequencia,
    versao: request.versao,
    publicado_em: isoZ(when),
    valido_ate: isoZ(new Date(when.getTime() + 30 * 86400000)),
    linux: {},
  }
  for (const [arch, item] of Object.entries(request.linux || {})) {
    manifest.linux[arch] = { arquivo: `files/nextec-acesso-${request.versao}-${arch}.deb`, sha256: item.sha256, tamanho: item.tamanho }
  }
  if (request.windows) {
    manifest.windows = { arquivo: `files/nextec-acesso-${request.versao}.msi`, sha256: request.windows.sha256, tamanho: request.windows.tamanho }
  }
  return new TextEncoder().encode(stable(manifest))
}

const toHex = (buffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Confere que o arquivo baixado é exatamente o que o pedido descreve (hash e tamanho). */
export async function checkAsset (buffer, asset, label) {
  if (buffer.byteLength !== asset.tamanho) throw new Error(`${label}: tamanho diferente do pedido.`)
  const digest = toHex(await subtle().digest('SHA-256', buffer))
  if (digest !== asset.sha256) throw new Error(`${label}: hash SHA-256 diferente do pedido. Nada foi assinado.`)
}

export async function signManifest (key, manifestBytes) {
  const signature = await subtle().sign({ name: 'RSASSA-PKCS1-v1_5' }, key, manifestBytes)
  return toBase64(signature)
}

export { toBase64 as bytesToBase64 }
