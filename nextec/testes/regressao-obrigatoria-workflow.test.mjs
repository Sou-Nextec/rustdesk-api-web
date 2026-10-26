// Regressão (rustdesk-api-web#131, revisão de 87d48f8): o workflow "Teste de regressão obrigatório" lia
// nextec/backend/*.patch do disco sem ter feito checkout. O [ -f "$p" ] sempre dava falso e um PR de correção com o teste
// Go dentro do patch da API era recusado como "sem teste".
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const yml = readFileSync(join(import.meta.dirname, '..', '..', '.github', 'workflows', 'regressao-obrigatoria.yml'), 'utf8')

test('checkout do PR acontece antes de ler os patches da API', () => {
  const checkout = yml.search(/uses:\s*actions\/checkout@/)
  assert.match(yml, /\^nextec\/backend\/\.\*\\\.patch\$/, 'o workflow deve considerar testes Go dentro de nextec/backend/*.patch')
  const leitura = yml.indexOf('[ -f "$p" ]')
  assert.ok(leitura > 0, 'leitura do patch no disco não encontrada')
  assert.ok(checkout >= 0, 'sem actions/checkout os patches não existem no disco do runner')
  assert.ok(checkout < leitura, 'o checkout precisa vir antes do passo que lê os patches')
})

test('o checkout é da versão do PR e não guarda credencial', () => {
  const bloco = yml.slice(yml.search(/uses:\s*actions\/checkout@/)).split(/\n\s*- name:/)[0]
  assert.match(bloco, /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/, 'ler os patches da cabeça do PR')
  assert.match(bloco, /persist-credentials:\s*false/, 'o job só lê arquivos: sem token gravado no git')
})
