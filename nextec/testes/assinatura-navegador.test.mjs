import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { openPrivateKey, buildManifest, signManifest, checkAsset, pemToDer } from '../../src/nextec/assinatura-navegador.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const assinador = path.resolve(here, '../atualizacao/assinador')
const atualizacao = path.resolve(here, '../atualizacao')

const request = {
  produto: 'nextec-connect', formato: 1, versao: '2.0.9', sequencia: 7,
  windows: { arquivo: 'files/nextec-acesso-2.0.9.msi', sha256: 'a'.repeat(64), tamanho: 1234 },
  linux: { amd64: { arquivo: 'files/nextec-acesso-2.0.9-amd64.deb', sha256: 'b'.repeat(64), tamanho: 99 } },
}
const NOW = new Date('2026-10-15T20:30:45.678Z')

function encryptedKey (cipher = 'aes-256-cbc') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem', cipher, passphrase: 'senha-de-teste' })
  return { pem, publicKey }
}

test('abre a chave PKCS#8 cifrada e gera assinatura RSA SHA-256 verificável', async () => {
  for (const cipher of ['aes-256-cbc', 'aes-128-cbc']) {
    const { pem, publicKey } = encryptedKey(cipher)
    const key = await openPrivateKey(pem, 'senha-de-teste')
    const manifest = buildManifest(request, NOW)
    const sig = Buffer.from(await signManifest(key, manifest), 'base64')
    assert.equal(crypto.verify('sha256', manifest, publicKey, sig), true)
  }
})

test('senha errada e chave sem cifra são recusadas', async () => {
  const { pem, publicKey } = encryptedKey()
  await assert.rejects(() => openPrivateKey(pem, 'outra-senha'), /Senha incorreta/)
  const plain = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  await assert.rejects(() => openPrivateKey(plain, 'x'), /não está cifrada/)
  assert.throws(() => pemToDer('lixo'), /não é uma chave/)
  assert.ok(publicKey)
})

test('manifesto é byte a byte igual ao do assinador Python', (t) => {
  const py = process.platform === 'win32' ? 'python' : 'python3'
  const code = `
import sys, json
from datetime import datetime, timezone
sys.path.insert(0, ${JSON.stringify(atualizacao)})
sys.path.insert(0, ${JSON.stringify(assinador)})
import importlib.util
spec = importlib.util.spec_from_file_location('ap', ${JSON.stringify(path.join(assinador, 'assinar-pedido-connect.py'))})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
req = json.loads(sys.stdin.read())
asset = {'windows': {'sha256': req['windows']['sha256'], 'tamanho': req['windows']['tamanho']},
         'linux': {a: {'sha256': i['sha256'], 'tamanho': i['tamanho']} for a, i in req['linux'].items()}}
sys.stdout.write(m._build_manifest(req, asset, datetime(2026, 10, 15, 20, 30, 45, tzinfo=timezone.utc)).decode())
`
  const run = spawnSync(py, ['-I', '-c', code], { input: JSON.stringify(request), encoding: 'utf8' })
  if (run.error || run.status !== 0) return t.skip('python indisponível para comparar: ' + (run.error?.message || run.stderr))
  assert.equal(new TextDecoder().decode(buildManifest(request, NOW)), run.stdout)
})

test('manifesto sem Windows ou sem Linux segue o mesmo formato', () => {
  const onlyWin = { ...request, linux: undefined }
  const text = new TextDecoder().decode(buildManifest(onlyWin, NOW))
  assert.match(text, /"linux":\{\}/)
  assert.match(text, /"valido_ate":"2026-11-14T20:30:45Z"/)
  const onlyLinux = { ...request, windows: undefined }
  assert.doesNotMatch(new TextDecoder().decode(buildManifest(onlyLinux, NOW)), /windows/)
})

test('confere hash e tamanho do pacote baixado', async () => {
  const data = new TextEncoder().encode('conteudo do pacote').buffer
  const sha = crypto.createHash('sha256').update(Buffer.from(data)).digest('hex')
  await checkAsset(data, { sha256: sha, tamanho: data.byteLength }, 'MSI')
  await assert.rejects(() => checkAsset(data, { sha256: 'c'.repeat(64), tamanho: data.byteLength }, 'MSI'), /hash SHA-256/)
  await assert.rejects(() => checkAsset(data, { sha256: sha, tamanho: 3 }, 'MSI'), /tamanho/)
})
