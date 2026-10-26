// Regressão (rustdesk-api-web#131, revisão): test_convite_resultado.ps1 ganhou casos novos que o CI nunca executava,
// porque o script não estava na lista do job identity. Outros três (test_convite_origem, test_idioma, test_log_codigos)
// estavam na mesma situação. Todo nextec/atualizacao/test_*.ps1 precisa rodar no CI com o código de saída conferido.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..', '..')
const workflow = readFileSync(join(raiz, '.github', 'workflows', 'client-regressions.yml'), 'utf8')
const pasta = join(raiz, 'nextec', 'atualizacao')

test('todo nextec/atualizacao/test_*.ps1 roda no CI', () => {
  const fora = readdirSync(pasta).filter((f) => /^test_.+\.ps1$/i.test(f)).filter((f) => !workflow.includes(f))
  assert.deepEqual(fora, [], 'inclua estes scripts no job identity de .github/workflows/client-regressions.yml')
})

test('o laço do job identity confere o código de saída de cada script', () => {
  assert.match(workflow, /foreach \(\$test in @\([^)]*'test_convite_resultado\.ps1'[^)]*\)\) \{\s*powershell\.exe [^\n]*"nextec\/atualizacao\/\$test"\s*if \(\$LASTEXITCODE -ne 0\) \{ throw/,
    'test_convite_resultado.ps1 deve estar no laço que confere $LASTEXITCODE')
})
