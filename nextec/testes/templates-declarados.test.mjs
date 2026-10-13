// Verificação estática: nenhum .vue com <script setup> em src/nextec e src/layout usa no template um nome que o script não declara.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { undeclaredTemplateNames } from './template-names.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

function vueFiles (dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? vueFiles(p) : (p.endsWith('.vue') ? [p] : [])
  })
}

const arquivos = [...vueFiles(path.join(raiz, 'nextec')), ...vueFiles(path.join(raiz, 'layout'))]

test('há telas para verificar', () => assert.ok(arquivos.length > 10))

for (const f of arquivos) {
  test('template só usa nomes declarados: ' + path.relative(raiz, f).split(path.sep).join('/'), () => {
    const faltando = undeclaredTemplateNames(fs.readFileSync(f, 'utf8'), path.basename(f))
    if (faltando === null) return
    assert.deepEqual(faltando, [], 'usados no template e não declarados no <script setup>: ' + faltando.join(', '))
  })
}

test('o detector acusa um nome do template que não existe no script', () => {
  const src = '<template><el-dialog v-model="faltando.visible"/></template><script setup>import { ref } from "vue"\nconst ok = ref(1)</script>'
  assert.deepEqual(undeclaredTemplateNames(src), ['faltando'])
})
