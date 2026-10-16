import test from 'node:test'
import assert from 'node:assert/strict'
import { publicBase, installerLinkUrl, supportLinkUrl, checkPublicUrl } from '../../src/nextec/public-links.mjs'

test('base: o endereço configurado vence; sem ele vale o do painel; sem barra no fim', () => {
  assert.equal(publicBase('https://suporte.nex.tec.br/', 'https://painel.x.com'), 'https://suporte.nex.tec.br')
  assert.equal(publicBase('', 'https://painel.x.com/'), 'https://painel.x.com')
  assert.equal(publicBase('   ', 'https://painel.x.com'), 'https://painel.x.com')
})

test('links no domínio de suporte usam /instalador e /atendimento', () => {
  assert.equal(installerLinkUrl('https://suporte.nex.tec.br', 'K7M2QX9P4TA8B3C5D6E2'), 'https://suporte.nex.tec.br/instalador/K7M2QX9P4TA8B3C5D6E2')
  assert.equal(supportLinkUrl('https://suporte.nex.tec.br/', 'ab12cd34'), 'https://suporte.nex.tec.br/atendimento/ab12cd34')
})

test('validação do endereço público: só https://dominio', () => {
  assert.deepEqual(checkPublicUrl(''), { ok: true, value: '' })
  assert.deepEqual(checkPublicUrl('  https://Suporte.Nex.Tec.br/ '), { ok: true, value: 'https://suporte.nex.tec.br' })
  for (const bad of ['http://suporte.nex.tec.br', 'suporte.nex.tec.br', 'https://suporte.nex.tec.br/instalador', 'https://suporte.nex.tec.br:8443',
    'https://suporte.nex.tec.br?x=1', 'https://suporte.nex.tec.br#a', 'https://u:p@suporte.nex.tec.br', 'https://localhost', 'javascript:alert(1)']) {
    assert.equal(checkPublicUrl(bad).ok, false, bad)
  }
})
