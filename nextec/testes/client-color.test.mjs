import test from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_PALETTE, clientColorIndex, clientChipStyle, rootClientName } from '../../src/nextec/client-color.mjs'

test('cada cliente ganha um tom e subclientes herdam o do cliente', () => {
  const idx = clientColorIndex([
    { id: 3, name: 'Cartório Mariinha Noronha' }, { id: 1, name: 'Cartório Adriana Celiac' },
    { id: 2, name: 'Cartório Adriana Celiac / Filial' }, { id: 4, name: 'Outro' },
  ])
  assert.equal(idx.get(1), 0)
  assert.equal(idx.get(2), 0)
  assert.equal(idx.get(3), 1)
  assert.equal(idx.get(4), 2)
  assert.equal(rootClientName('A / B / C'), 'A')
})

test('os dez primeiros clientes nunca repetem cor e a paleta dá a volta depois', () => {
  const groups = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'Cliente ' + i }))
  const idx = clientColorIndex(groups)
  assert.equal(new Set(groups.slice(0, 10).map(g => idx.get(g.id))).size, 10)
  assert.equal(idx.get(11), 0)
})

test('contraste mínimo de leitura nos dois temas', () => {
  const lum = (hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  for (const p of CLIENT_PALETTE) {
    assert.ok(ratio(p.light[0], p.light[1]) >= 4.5, 'claro ' + p.light)
    assert.ok(ratio(p.dark[0], p.dark[1]) >= 4.5, 'escuro ' + p.dark)
  }
  assert.deepEqual(clientChipStyle(99), {})
  assert.equal(clientChipStyle(0)['--nx-ct-bg'], '#E9DDFF')
})
