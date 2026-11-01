import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Load the source-controlled Worker as an ES module without changing its deploy settings.
const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)

const env = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key',
  WHATSAPP_ACCESS_TOKEN: 'not-a-real-token',
  WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id'
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function mockServices({ priorLanguage = null, complaintForRating = null } = {}) {
  const state = {
    claimedIds: new Set(),
    messagesSent: [],
    session: null,
    complaintForRating: complaintForRating ? { ...complaintForRating } : null
  }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url))
    const method = options.method || 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    if (parsed.hostname === 'graph.facebook.com') {
      assert.equal(method, 'POST')
      state.messagesSent.push(body.text.body)
      return json({ messages: [{ id: 'wamid.mock.outgoing' }] })
    }
    assert.equal(parsed.hostname, 'supabase.example.test')

    if (parsed.pathname === '/rest/v1/whatsapp_inbound_message_dedupe') {
      assert.equal(method, 'POST')
      assert.match(options.headers.Prefer, /resolution=ignore-duplicates/)
      if (state.claimedIds.has(body.message_id)) return json([])
      state.claimedIds.add(body.message_id)
      return json([{ message_id: body.message_id }], 201)
    }
    if (parsed.pathname === '/rest/v1/whatsapp_complaint_sessions') {
      if (method === 'DELETE') {
        state.session = null
        return new Response(null, { status: 204 })
      }
      if (method === 'POST') {
        state.session = { ...body }
        return new Response(null, { status: 201 })
      }
      if (method === 'PATCH') {
        state.session = { ...state.session, ...body }
        return new Response(null, { status: 204 })
      }
      if (method === 'GET') {
        return json(state.session ? [state.session] : [])
      }
    }
    if (parsed.pathname === '/rest/v1/complaints') {
      const select = parsed.searchParams.get('select')
      if (method === 'GET' && select === 'preferred_language') {
        return json(priorLanguage ? [{ preferred_language: priorLanguage }] : [])
      }
      if (method === 'GET' && select?.includes('resident_rating')) {
        return json(state.complaintForRating ? [state.complaintForRating] : [])
      }
      if (method === 'PATCH' && state.complaintForRating) {
        Object.assign(state.complaintForRating, body)
        return new Response(null, { status: 204 })
      }
    }
    throw new Error(`Unexpected request: ${method} ${parsed.pathname} ${parsed.search}`)
  }
  return { state, restore: () => { globalThis.fetch = previousFetch } }
}

function inbound(id, body) {
  return new Request('https://worker.example.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: { messages: [{
            id,
            from: '910000000001',
            type: 'text',
            text: { body }
          }] }
        }]
      }]
    })
  })
}

test('new resident gets a language prompt, not multiple messages', async () => {
  const { state, restore } = mockServices()
  try {
    const result = await worker.fetch(inbound('wamid.new.1', 'Hi'), env)
    assert.equal(result.status, 200)
    assert.equal(state.session.step, 'LANGUAGE')
    assert.equal(state.messagesSent.length, 1)
    assert.match(state.messagesSent[0], /English/)
    assert.match(state.messagesSent[0], /हिंदी/)
  } finally { restore() }
})

test('replayed webhook ID cannot reset the session or send a duplicate reply', async () => {
  const { state, restore } = mockServices()
  try {
    await worker.fetch(inbound('wamid.duplicate.1', 'Hi'), env)
    const firstSession = state.session
    await worker.fetch(inbound('wamid.duplicate.1', 'Hi'), env)
    assert.equal(state.messagesSent.length, 1)
    assert.equal(state.session, firstSession)
    assert.equal(state.claimedIds.size, 1)
  } finally { restore() }
})

test('returning Hindi resident skips language menu but can switch to English', async () => {
  const { state, restore } = mockServices({ priorLanguage: 'HI' })
  try {
    await worker.fetch(inbound('wamid.return.1', 'Hi'), env)
    assert.equal(state.session.step, 'CATEGORY')
    assert.equal(state.session.preferred_language, 'HI')
    assert.equal(state.messagesSent.length, 1)
    assert.match(state.messagesSent[0], /प्लंबर/)
    assert.match(state.messagesSent[0], /\*E\*/)

    await worker.fetch(inbound('wamid.return.2', 'E'), env)
    assert.equal(state.session.preferred_language, 'EN')
    assert.equal(state.messagesSent.length, 2)
    assert.match(state.messagesSent[1], /Please select the complaint category/)
  } finally { restore() }
})

test('rating saves to complaint without a redundant outgoing thank-you', async () => {
  const { state, restore } = mockServices({
    complaintForRating: {
      id: 1,
      complaint_no: 'P999',
      status: 'CLOSED',
      preferred_language: 'EN',
      resident_rating: null
    }
  })
  try {
    await worker.fetch(inbound('wamid.rating.1', '5'), env)
    assert.equal(state.complaintForRating.resident_rating, 5)
    assert.equal(state.messagesSent.length, 0)
  } finally { restore() }
})
