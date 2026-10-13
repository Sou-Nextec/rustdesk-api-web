// Nomes que o template usa sem terem sido declarados no <script setup>. Viram `_ctx.nome` na compilação e,
// em runtime, undefined: o render lança TypeError e a tela fica em branco (foi o `blockedDlg` da 2.11.0).
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

export function undeclaredTemplateNames (source, filename = 'x.vue') {
  const { descriptor } = parse(source, { filename })
  if (!descriptor.template || !descriptor.scriptSetup) return null // sem template ou sem <script setup>: não se aplica
  const script = compileScript(descriptor, { id: 'x' })
  const out = compileTemplate({
    source: descriptor.template.content, filename, id: 'x',
    compilerOptions: { bindingMetadata: script.bindings, prefixIdentifiers: true },
  })
  if (out.errors.length) throw new Error(filename + ': ' + out.errors.map(String).join('; '))
  const names = new Set()
  for (const m of out.code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  return [...names].filter(n => !n.startsWith('$')).sort()
}
