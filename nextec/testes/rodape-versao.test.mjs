// Rodapé com a versão do painel: precisa ser um elemento fixo no fundo do menu, fora da área rolável
// (na 2.11.1 era um ::after absoluto sobre o scroll e os itens do menu passavam por cima dele).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const aside = fs.readFileSync(path.join(src, 'layout/components/aside.vue'), 'utf8')
const theme = fs.readFileSync(path.join(src, 'nextec/theme.scss'), 'utf8')

function findAll (node, pred, out = []) {
  if (pred(node)) out.push(node)
  for (const c of node.children || []) if (typeof c === 'object') findAll(c, pred, out)
  return out
}
const tpl = parse(aside, { filename: 'aside.vue' }).descriptor.template.ast
const classOf = n => (n.props || []).find(p => p.name === 'class')?.value?.content || ''
const box = findAll(tpl, n => n.type === 1 && classOf(n).includes('aside-box'))[0]

test('o rodapé da versão é filho do contêiner do menu, irmão (e não descendente) da área rolável', () => {
  assert.ok(box, 'contêiner .aside-box ausente')
  const filhos = box.children.filter(c => c.type === 1)
  const rolavel = filhos.find(c => c.tag === 'el-scrollbar')
  const rodape = filhos.find(c => c.props.some(p => p.name === 'class' && String(p.value?.content).includes('nx-aside-version')))
  assert.ok(rolavel, 'el-scrollbar deve ser filho direto do contêiner')
  assert.ok(rodape, 'rodapé deve ser filho direto do contêiner')
  assert.equal(findAll(rolavel, n => n.type === 1 && classOf(n).includes('nx-aside-version')).length, 0, 'rodapé dentro da área rolável')
})

test('a área rolável encolhe e o rodapé não, com contêiner em coluna', () => {
  assert.match(aside, /\.aside-box\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/)
  assert.match(aside, /\.scroll-sidebar\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0/)
  assert.match(aside, /\.nx-aside-version\s*\{[^}]*flex:\s*0 0 auto/)
  assert.doesNotMatch(aside, /<el-scrollbar[^>]*height="100vh"/)
})

test('a versão antiga em ::after sobre o menu foi removida', () => {
  assert.doesNotMatch(theme, /\.app-left[^{]*::after/)
  assert.doesNotMatch(theme, /--nx-version/)
})

test('o rodapé mostra a versão e o master-<sha> quando o build o informa', () => {
  assert.match(aside, /'Painel ' \+ shortLabel/)
  assert.match(aside, /master-\{\{ build \}\}/)
})
