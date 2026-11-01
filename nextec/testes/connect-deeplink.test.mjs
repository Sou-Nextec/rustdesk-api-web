// Link "Abrir no Connect" (#/my/peer?conectar=<ID>): validação do ID, pedido guardado durante o login, decisão de tratar
// e limpeza da URL (módulo puro, sem navegador).
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ID_RE, PARAM, PENDING_KEY, PENDING_TTL_MS, INVALID_TEXT, confirmText, decide, hasParam, isPublicPath, nextQuery,
  paramFromHash, parseConnectId, queryWithout, savePending, takePending,
} from '../../src/nextec/connect-deeplink.mjs'
import { fmtId } from '../../src/nextec/id.js'

const mem = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: k => { m.delete(k) },
    raw: m,
  }
}
const blocked = {
  getItem () { throw new Error('bloqueado') }, setItem () { throw new Error('bloqueado') }, removeItem () { throw new Error('bloqueado') },
}

test('o parâmetro se chama conectar e o ID segue o formato do servidor (6 a 64 dígitos)', () => {
  assert.equal(PARAM, 'conectar')
  assert.ok(ID_RE.test('123456'))
  assert.ok(ID_RE.test('1'.repeat(64)))
  assert.ok(!ID_RE.test('12345'))
  assert.ok(!ID_RE.test('1'.repeat(65)))
})

test('parseConnectId: tira espaços como o connectDevice e aceita só dígitos', () => {
  assert.deepEqual(parseConnectId('123456789'), { ok: true, id: '123456789' })
  assert.deepEqual(parseConnectId(' 123 456 789 '), { ok: true, id: '123456789' })
  assert.deepEqual(parseConnectId('123 456 789'), { ok: true, id: '123456789' })
  assert.deepEqual(parseConnectId(536822159), { ok: true, id: '536822159' })
  const ruins = [
    '', '   ', null, undefined, 'abc', '12345', '1'.repeat(65), '123456789?password=x', '123456789&x=1', '../123456',
    'javascript:alert(1)', '-123456', '123.456.789', '１２３４５６７８９', ['123456789', '987654321'], [], {}, '1'.repeat(200),
  ]
  for (const v of ruins) assert.deepEqual(parseConnectId(v), { ok: false, id: '' }, `deveria recusar ${JSON.stringify(v)}`)
})

test('paramFromHash lê o parâmetro do hash da URL (hash history)', () => {
  assert.equal(paramFromHash('#/my/peer?conectar=123456789'), '123456789')
  assert.equal(paramFromHash('#/my/peer?x=1&conectar=123%20456%20789'), '123 456 789')
  assert.equal(paramFromHash('#/my/peer?conectar='), '')
  assert.deepEqual(paramFromHash('#/my/peer?conectar=1&conectar=2'), ['1', '2'])
  assert.equal(paramFromHash('#/my/peer'), undefined)
  assert.equal(paramFromHash('#/my/peer?q=123'), undefined)
  assert.equal(paramFromHash(''), undefined)
  assert.equal(paramFromHash(undefined), undefined)
})

test('telas sem sessão (login, cadastro, 404, oauth) seguram o pedido', () => {
  for (const p of ['/login', '/register', '/404', '/oauth/abc', '/oauth/bind/abc']) assert.ok(isPublicPath(p), p)
  for (const p of ['/my/peer', '/home', '/', '/my/shared']) assert.ok(!isPublicPath(p), p)
})

test('pedido guardado sobrevive ao login, é lido uma vez só e vence', () => {
  const s = mem()
  assert.ok(savePending(s, '123456789', 1000))
  assert.ok(s.raw.has(PENDING_KEY))
  assert.equal(takePending(s, 1000 + 60_000), '123456789')
  assert.equal(takePending(s, 1000 + 60_000), undefined, 'segunda leitura não pode devolver de novo')
  assert.ok(!s.raw.has(PENDING_KEY))

  savePending(s, '123456789', 1000)
  assert.equal(takePending(s, 1000 + PENDING_TTL_MS + 1), undefined, 'vencido')
  assert.ok(!s.raw.has(PENDING_KEY), 'vencido também é apagado')

  savePending(s, '123456789', 5000)
  assert.equal(takePending(s, 1000), undefined, 'relógio voltou: descarta')

  s.setItem(PENDING_KEY, '{quebrado')
  assert.equal(takePending(s, 1000), undefined)
  assert.equal(takePending(null), undefined)
})

test('armazenamento bloqueado não derruba nada', () => {
  assert.equal(savePending(blocked, '123456789'), false)
  assert.equal(takePending(blocked), undefined)
  assert.equal(savePending(null, '123456789'), false)
  assert.equal(savePending(mem(), undefined), false)
})

test('decide: sem pedido, nada', () => {
  assert.deepEqual(decide({ path: '/my/peer', query: {}, pending: undefined, loggedIn: true }), { action: 'none', id: '', cleanUrl: false })
})

test('decide: sem login (ou na tela de login) o pedido espera', () => {
  assert.equal(decide({ path: '/login', query: { conectar: '123456789' }, loggedIn: false }).action, 'wait')
  assert.equal(decide({ path: '/my/peer', query: { conectar: '123456789' }, loggedIn: false }).action, 'wait')
  assert.equal(decide({ path: '/login', query: {}, pending: '123456789', loggedIn: true }).action, 'wait')
  assert.equal(decide({ path: '/login', query: { conectar: '1' }, loggedIn: false }).value, '1')
})

test('decide: logado, ID válido pede confirmação e manda limpar a URL', () => {
  assert.deepEqual(decide({ path: '/my/peer', query: { conectar: '123 456 789' }, loggedIn: true }),
    { action: 'confirm', id: '123456789', cleanUrl: true })
  // veio do armazenamento (depois do login): a URL já está limpa
  assert.deepEqual(decide({ path: '/my/peer', query: {}, pending: '123456789', loggedIn: true }),
    { action: 'confirm', id: '123456789', cleanUrl: false })
  // a URL ganha do armazenamento quando os dois existem
  assert.equal(decide({ path: '/my/peer', query: { conectar: '111111111' }, pending: '222222222', loggedIn: true }).id, '111111111')
})

test('decide: ID inválido avisa, não abre e limpa a URL', () => {
  for (const v of ['abc', '', '12', ['123456789', '123456789'], '123456789;rm']) {
    const d = decide({ path: '/my/peer', query: { conectar: v }, loggedIn: true })
    assert.equal(d.action, 'invalid', JSON.stringify(v))
    assert.equal(d.id, '')
    assert.equal(d.cleanUrl, true)
  }
  assert.equal(decide({ path: '/home', query: {}, pending: 'xyz', loggedIn: true }).action, 'invalid')
})

test('decide: com uma confirmação aberta, outro pedido não abre segunda pergunta (só limpa a URL)', () => {
  assert.deepEqual(decide({ path: '/my/peer', query: { conectar: '123456789' }, loggedIn: true, busy: true }),
    { action: 'none', id: '', cleanUrl: true })
  assert.deepEqual(decide({ path: '/my/peer', query: {}, loggedIn: true, busy: true }), { action: 'none', id: '', cleanUrl: false })
})

test('limpeza da URL: tira o parâmetro e mantém o resto', () => {
  assert.deepEqual(queryWithout({ conectar: '1', x: 'y' }), { x: 'y' })
  assert.deepEqual(queryWithout({}), {})
  assert.deepEqual(queryWithout(undefined), {})
  assert.ok(hasParam({ conectar: '' }))
  assert.ok(!hasParam({ q: '1' }))
  assert.ok(!hasParam(null))
})

test('nextQuery: em Meus dispositivos filtra pelo ID; em outra tela só limpa; sem mudança devolve null', () => {
  assert.deepEqual(nextQuery({ path: '/my/peer', query: { conectar: '123456789' }, id: '123456789' }), { q: '123456789' })
  assert.deepEqual(nextQuery({ path: '/my/peer', query: {}, id: '123456789' }), { q: '123456789' })
  assert.equal(nextQuery({ path: '/my/peer', query: { q: '123456789' }, id: '123456789' }), null)
  assert.deepEqual(nextQuery({ path: '/home', query: { conectar: '123456789', a: '1' }, id: '123456789' }), { a: '1' })
  assert.equal(nextQuery({ path: '/home', query: {}, id: '123456789' }), null)
  // ID inválido não vira filtro
  assert.deepEqual(nextQuery({ path: '/my/peer', query: { conectar: 'abc' }, id: '' }), {})
})

test('confirmação mostra o ID formatado como o painel e o aviso de inválido diz que nada foi aberto', () => {
  assert.equal(confirmText('123456789', fmtId), 'Conectar ao dispositivo 123 456 789?')
  assert.equal(confirmText('1234567890', fmtId), 'Conectar ao dispositivo 1 234 567 890?')
  assert.match(INVALID_TEXT, /Nada foi aberto/)
})

test('textos sem travessão nem meia-risca', () => {
  for (const t of [INVALID_TEXT, confirmText('123456789', fmtId)]) assert.ok(!/[–—]/.test(t))
})
