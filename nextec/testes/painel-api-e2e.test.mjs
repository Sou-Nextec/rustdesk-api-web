import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { activationBundle } from '../../src/nextec/local-requests.mjs'
import { buildActivationCmd } from '../../src/nextec/activation-cmd.mjs'
import { pacoteReal } from './pacote-agente.mjs'

// A resposta abaixo foi emitida pela API (teste Go TestBootstrapEmiteDominioConfigurado) com
// NEXTEC_PANEL_URL=https://painel.outro.exemplo: nada fixo, trocar de dominio nao quebra a ativacao.
const resposta = JSON.parse(readFileSync(new URL('./fixtures/bootstrap-outro-dominio.json', import.meta.url), 'utf8'))
const origem = 'https://painel.outro.exemplo'

test('a interface aceita a autorizacao emitida pela API no outro dominio e gera o .cmd', async () => {
  const bundle = activationBundle(resposta.data, resposta.data.id, origem)
  assert.equal(bundle.painel, origem)
  const cmd = buildActivationCmd(bundle, Date.UTC(2026, 9, 13, 12), await pacoteReal())
  const data = JSON.parse(Buffer.from(cmd.match(/rem NXDATA (\S+)/)[1], 'base64').toString('utf8'))
  assert.equal(data.painel, origem)
  assert.equal(data.id, resposta.data.id)
  assert.ok(!cmd.includes('painel-remoto.nex.tec.br'), 'o .cmd nao carrega o dominio antigo')
})

test('a interface recusa a resposta quando a pagina esta em outro dominio', () => {
  assert.throws(() => activationBundle(resposta.data, resposta.data.id, 'https://painel-remoto.nex.tec.br'))
})
