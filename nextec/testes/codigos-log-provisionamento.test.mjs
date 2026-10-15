// Guardas do log do provisionador (regressão dos 2 bugs do teste no Windows Sandbox, 14/10/2026):
//  - uma lista só de códigos do provisionamento-agente.log (Get-NextecProvisionLogCodes): tudo que os scripts gravam e tudo
//    que o Ativar-Nextec-<ID>.cmd lê tem que estar nela (o .cmd abortava e desfazia a instalação com protocol_error);
//  - a identidade das contas do Windows é por SID: nenhum script compara nome localizado (SYSTEM vira SISTEMA no pt-BR).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const raiz = fileURLToPath(new URL('../../', import.meta.url))
const atual = join(raiz, 'nextec', 'atualizacao')
const ler = (...p) => readFileSync(join(...p), 'utf8').replace(/^﻿/, '')
const prov = ler(atual, 'Provisionar-Agente-Nextec.ps1')

function listaUnica() {
  const m = prov.match(/function Get-NextecProvisionLogCodes \{\s*@\(([\s\S]*?)\n  \)\s*\}/)
  assert.ok(m, 'Get-NextecProvisionLogCodes não encontrada')
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

test('a lista única existe, sem repetição, com os códigos novos e unknown_code', () => {
  const lista = listaUnica()
  assert.equal(new Set(lista).size, lista.length)
  for (const c of ['old_agent_replace_formato_antigo', 'old_agent_replace_outro_id', 'old_agent_replace_token_recusado',
    'old_agent_replace_agente_parado', 'agent_repaired', 'unknown_code', 'protocol_error', 'complete']) {
    assert.ok(lista.includes(c), c)
  }
})

test('o gravador não tem lista própria: usa Get-NextecProvisionLogCodes', () => {
  const grav = prov.match(/function Write-NextecProvisionLog \{[\s\S]*?\n\}/)[0]
  assert.match(grav, /ConvertTo-NextecProvisionLogLine/)
  assert.doesNotMatch(grav, /protocol_error\|/, 'lista duplicada no gravador')
  const norm = prov.match(/function ConvertTo-NextecProvisionLogLine \{[\s\S]*?\n\}/)[0]
  assert.match(norm, /Get-NextecProvisionLogCodes/)
  assert.doesNotMatch(norm, /\|complete\||pending\|/)
  // nenhum outro .ps1 de produção repete a lista (alternância com vários códigos conhecidos)
  for (const f of readdirSync(atual).filter((n) => n.endsWith('.ps1') && !n.startsWith('test_'))) {
    const t = ler(atual, f)
    const copias = (t.match(/already_configured\|identity_conflict\|already_enrolled/g) || []).length
    assert.equal(copias, 0, `${f} repete a lista de códigos`)
  }
})

test('todo código que o Provisionar grava ou lança está na lista (e o motivo do agente antigo vira old_agent_replace_*)', () => {
  const lista = new Set(listaUnica())
  const usados = new Set()
  for (const m of prov.matchAll(/Write-NextecProvisionLog\s+'([a-z_]+)'/g)) usados.add(m[1])
  for (const m of prov.matchAll(/\$(?:manualCode|retryCode|code)\s*=\s*(?:if \([^)]*\)\s*\{\s*)?'([a-z_]+)'/g)) usados.add(m[1])
  for (const m of prov.matchAll(/else \{ '([a-z_]+)' \}/g)) usados.add(m[1])
  for (const m of prov.matchAll(/throw '([a-z_]+)'/g)) usados.add(m[1])
  for (const m of prov.matchAll(/\$reason = '([a-z_]+)'/g)) usados.add('old_agent_replace_' + m[1])
  assert.ok(usados.size > 20, 'extração falhou')
  const fora = [...usados].filter((c) => !lista.has(c))
  assert.deepEqual(fora, [], 'códigos fora da lista: ' + fora.join(', '))
})

test('os códigos que o Ativar-Nextec-<ID>.cmd lê no log estão na lista', () => {
  const lista = new Set(listaUnica())
  const cmd = ler(raiz, 'src', 'nextec', 'activation-cmd.mjs')
  const falha = cmd.match(/\$failCodes = '([^']+)'/)
  assert.ok(falha)
  const sucesso = cmd.match(/\\s\((complete\|[a-z_|]+)\)\$'/)
  assert.ok(sucesso)
  const lidos = [...falha[1].split('|'), ...sucesso[1].split('|')]
  const fora = lidos.filter((c) => !lista.has(c))
  assert.deepEqual(fora, [], 'o .cmd lê códigos que o provisionador não grava: ' + fora.join(', '))
})

test('nenhum script compara nome localizado de conta ou grupo (SYSTEM, Administrators, Users...): só SID', () => {
  const alvo = []
  for (const f of readdirSync(atual).filter((n) => n.endsWith('.ps1') && !n.startsWith('test_'))) alvo.push(join(atual, f))
  alvo.push(join(raiz, 'src', 'nextec', 'activation-cmd.mjs'))
  const nomes = String.raw`(SYSTEM|SISTEMA|NT AUTHORITY[^'"]*|AUTORIDADE NT[^'"]*|BUILTIN[^'"]*|Administrators|Administradores|Everyone|Todos|Users|Usu[aá]rios)`
  const comparacao = new RegExp(String.raw`-(?:c|i)?(?:eq|ne|in|notin|like|notlike|match|notmatch|contains|notcontains)\s+@?\(?\s*['"]` + nomes + `['"]`, 'i')
  const lista = new RegExp(String.raw`@\(\s*['"]` + nomes + String.raw`['"]\s*,`, 'i')
  const achados = []
  for (const f of alvo) {
    ler(f).split('\n').forEach((l, i) => {
      if (/^\s*#/.test(l)) return
      if (comparacao.test(l) || lista.test(l)) achados.push(`${f.replace(raiz, '')}:${i + 1}: ${l.trim()}`)
    })
  }
  assert.deepEqual(achados, [])
})

test('Test-NextecAgentTaskShape identifica a conta por SID', () => {
  const corpo = prov.match(/function Test-NextecAgentTaskShape \{[\s\S]*?\n\}/)[0]
  assert.match(corpo, /ConvertTo-NextecAccountSid[\s\S]*S-1-5-18/)
  assert.doesNotMatch(corpo, /'SYSTEM'|NT AUTHORITY/)
})
