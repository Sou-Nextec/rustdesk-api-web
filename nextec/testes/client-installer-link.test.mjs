// "Baixar instalador deste cliente": Clientes abre o gerador com o cliente escolhido, e o gerador só aceita id numérico.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const clients = readFileSync(new URL('../../src/nextec/views/Clients.vue', import.meta.url), 'utf8')
const generator = readFileSync(new URL('../../src/nextec/views/Generator.vue', import.meta.url), 'utf8')

test('menu do cliente leva ao gerador com o cliente escolhido', () => {
  assert.match(clients, /command="installer"[^>]*>Baixar instalador deste cliente</)
  assert.match(clients, /cmd === 'installer'\) router\.push\(\{ path: '\/user\/generator', query: \{ cliente: String\(row\.id\) \} \}\)/)
})

test('o gerador só repassa um id numérico ao iframe e à aba nova', () => {
  assert.ok(generator.includes('route.query.cliente'))
  assert.ok(generator.includes('.test(String(route.query.cliente'))
  assert.ok(generator.includes(String.raw`/^\d{1,10}$/`), 'só dígitos, no máximo 10')
  assert.ok(generator.includes("const frameSrc = '/gerador/' + (clienteId ? '?cliente=' + clienteId : '')"))
  assert.ok(generator.includes(':src="frameSrc"'))
  assert.ok(generator.includes("window.open(frameSrc, '_blank', 'noopener')"))
  assert.ok(!generator.includes('src="/gerador/"'), 'o iframe não pode voltar a ter o endereço fixo')
})
