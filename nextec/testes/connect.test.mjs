import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareConnection } from '../../src/nextec/connect-flow.mjs'

const okSettings = mode => ({ code: 0, data: { mode, scheme: 'nextec-connect' } })

test('uses the server-authorized link verbatim after settings and required ticket are prepared', async () => {
  const events = []
  const prepared = await prepareConnection('536 822 159', {
    loadSettings: async () => { events.push('settings'); return okSettings('required') },
    askTicket: async (id, mode) => { events.push(`ticket:${id}:${mode}`); return 'CBQ-REQ-6054' },
    saveNote: async (id, ticket) => { events.push(`note:${id}:${ticket}`); return { code: 0 } },
    requestLink: async id => {
      events.push(`authorized-link:${id}`)
      return { code: 0, data: { url: 'nextec-connect://536822159?password=opaque-secret' } }
    },
  })

  assert.deepEqual(events, [
    'settings', 'ticket:536822159:required', 'note:536822159:CBQ-REQ-6054', 'authorized-link:536822159',
  ])
  assert.deepEqual(prepared, { id: '536822159', url: 'nextec-connect://536822159?password=opaque-secret' })
})

test('settings outage blocks connection instead of downgrading to an unprepared protocol link', async () => {
  let requestedLink = false
  await assert.rejects(prepareConnection('123456', {
    loadSettings: async () => { throw new Error('network down') },
    askTicket: async () => '',
    saveNote: async () => ({ code: 0 }),
    requestLink: async () => { requestedLink = true; return { code: 0, data: { url: 'rustdesk://123456' } } },
  }), /network down/)
  assert.equal(requestedLink, false)
})

test('missing or invalid settings fail closed', async () => {
  for (const settings of [false, { code: 0 }, { code: 0, data: { mode: 'unknown' } }, { code: 1, data: { mode: 'off' } }]) {
    let requestedLink = false
    await assert.rejects(prepareConnection('123456', {
      loadSettings: async () => settings,
      askTicket: async () => '',
      saveNote: async () => ({ code: 0 }),
      requestLink: async () => { requestedLink = true; return { code: 0, data: { url: 'rustdesk://123456' } } },
    }))
    assert.equal(requestedLink, false)
  }
})

test('required ticket audit failure blocks the authorized-link request', async () => {
  let requestedLink = false
  await assert.rejects(prepareConnection('123456', {
    loadSettings: async () => okSettings('required'),
    askTicket: async () => 'CBQ-REQ-6054',
    saveNote: async () => { throw new Error('audit unavailable') },
    requestLink: async () => { requestedLink = true; return { code: 0, data: { url: 'rustdesk://123456' } } },
  }), /chamado obrigatório/)
  assert.equal(requestedLink, false)
})

test('required ticket cannot be empty or invalid even if the prompt double returns it', async () => {
  for (const ticket of ['', 'bad ticket', '!invalid']) {
    let savedNote = false
    let requestedLink = false
    await assert.rejects(prepareConnection('123456', {
      loadSettings: async () => okSettings('required'),
      askTicket: async () => ticket,
      saveNote: async () => { savedNote = true; return { code: 0 } },
      requestLink: async () => { requestedLink = true; return { code: 0, data: { url: 'rustdesk://123456' } } },
    }), /chamado/i)
    assert.equal(savedNote, false)
    assert.equal(requestedLink, false)
  }
})

test('optional ticket audit failure follows policy and still requests the authorized link', async () => {
  let requestedLink = false
  const prepared = await prepareConnection('123456', {
    loadSettings: async () => okSettings('optional'),
    askTicket: async () => 'CBQ-REQ-6054',
    saveNote: async () => { throw new Error('audit unavailable') },
    requestLink: async () => {
      requestedLink = true
      return { code: 0, data: { url: 'nextec-connect://123456' } }
    },
  })
  assert.equal(requestedLink, true)
  assert.equal(prepared.url, 'nextec-connect://123456')
})

test('canceling the ticket prompt stops before audit and authorization', async () => {
  let savedNote = false
  let requestedLink = false
  const prepared = await prepareConnection('123456', {
    loadSettings: async () => okSettings('optional'),
    askTicket: async () => false,
    saveNote: async () => { savedNote = true; return { code: 0 } },
    requestLink: async () => { requestedLink = true; return { code: 0, data: { url: 'rustdesk://123456' } } },
  })
  assert.equal(prepared, null)
  assert.equal(savedNote, false)
  assert.equal(requestedLink, false)
})

test('access denial from the server cannot fall back to an unauthenticated app link', async () => {
  await assert.rejects(prepareConnection('123456', {
    loadSettings: async () => okSettings('off'),
    askTicket: async () => '',
    saveNote: async () => ({ code: 0 }),
    requestLink: async () => ({ code: 403, msg: 'Sem acesso.' }),
  }), /Sem acesso/)
})
