import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Keep production credentials and Meta API out of the unit tests.
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
    status, headers: { 'Content-Type': 'application/json' }
  })
}

function mockServices({ priorFlats = [], workDoneComplaint = null } = {}) {
  const state = {
    claimedIds: new Set(), messagesSent: [], session: null,
    previousFlats: priorFlats, complaints: [],
    workDoneComplaint: workDoneComplaint ? { ...workDoneComplaint } : null
  }
  const priorFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const uri = new URL(String(url))
    const method = options.method || 'GET'
    const payload = options.body ? JSON.parse(options.body) : null

    if (uri.hostname === 'graph.facebook.com') {
      assert.equal(method, 'POST')
      state.messagesSent.push({ recipient: payload.to, text: payload.text.body })
      return json({ messages: [{ id: 'wamid.mock.out' }] })
    }
    assert.equal(uri.hostname, 'supabase.example.test')

    if (uri.pathname === '/rest/v1/whatsapp_inbound_message_dedupe') {
      assert.equal(method, 'POST')
      if (state.claimedIds.has(payload.message_id)) return json([])
      state.claimedIds.add(payload.message_id)
      return json([{ message_id: payload.message_id }], 201)
    }
    if (uri.pathname === '/rest/v1/whatsapp_complaint_sessions') {
      if (method === 'DELETE') {
        state.session = null
        return new Response(null, { status: 204 })
      }
      if (method === 'POST') {
        state.session = { ...payload }
        return new Response(null, { status: 201 })
      }
      if (method === 'PATCH') {
        state.session = { ...state.session, ...payload }
        return new Response(null, { status: 204 })
      }
      if (method === 'GET') return json(state.session ? [state.session] : [])
    }
    if (uri.pathname === '/rest/v1/complaints') {
      const select = uri.searchParams.get('select') || ''
      if (method === 'GET' && select === 'flat_no') {
        return json(state.previousFlats.map(flat_no => ({ flat_no })))
      }
      if (method === 'GET' && select.includes('status') && select.includes('complaint_no')) {
        return json(state.workDoneComplaint?.status === 'WORK_DONE' ? [state.workDoneComplaint] : [])
      }
      if (method === 'GET' && select.includes('category_id') && uri.searchParams.has('id')) {
        return json(state.complaints.filter(c => String(c.id) === uri.searchParams.get('id')?.slice(3)))
      }
      if (method === 'GET' && select.includes('category_id')) return json(state.complaints)
      if (method === 'POST') {
        const row = { id: 101 + state.complaints.length, complaint_no: 'P999', work_start_otp: '1234', ...payload }
        state.complaints.push(row)
        return json([row], 201)
      }
      if (method === 'PATCH') {
        const target = state.workDoneComplaint || state.complaints[0]
        if (target) Object.assign(target, payload)
        return new Response(null, { status: 204 })
      }
    }
    if (uri.pathname === '/rest/v1/workers' && method === 'GET') {
      return json([{ name: 'Plumber', mobile_no: '910000000002' }])
    }
    throw new Error(`Unexpected request: ${method} ${uri.pathname} ${uri.search}`)
  }
  return {
    state, restore: () => { globalThis.fetch = priorFetch },
    residentMessages: () => state.messagesSent.filter(x => x.recipient === '910000000001')
  }
}

let nextId = 0
function inbound(message) {
  const id = message.id || `wamid.mock.${++nextId}`
  return new Request('https://worker.example.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{
        id, from: '910000000001', type: 'text', text: { body: message.body }
      }] } }] }]
    })
  })
}
async function say(text, id) {
  const response = await worker.fetch(inbound({ body: text, id }), env)
  assert.equal(response.status, 200)
}
function bilingual(text) {
  assert.match(text, /[a-zA-Z]{3,}/)
  assert.match(text, /[\u0900-\u097f]/)
}

test('new resident: bilingual menu, asks flat once, skips language and urgent, retains OTP + queue', async () => {
  const mock = mockServices()
  try {
    await say('Hi')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.equal(mock.residentMessages().length, 1)
    bilingual(mock.residentMessages()[0].text)
    assert.doesNotMatch(mock.residentMessages()[0].text, /select your preferred language/i)
    assert.match(mock.residentMessages()[0].text, /Plumber \/ प्लंबर/)

    await say('1') // plumbing
    assert.equal(mock.state.session.step, 'FLAT_NO')
    assert.equal(mock.residentMessages().length, 2)
    bilingual(mock.residentMessages()[1].text)

    await say('36-D')
    assert.equal(mock.state.session.step, 'CONFIRM')
    assert.equal(mock.residentMessages().length, 3)
    assert.match(mock.residentMessages()[2].text, /36-D/)
    assert.doesNotMatch(mock.residentMessages()[2].text, /Urgent:|अत्यावश्यक:/)

    await say('1') // register
    assert.equal(mock.state.complaints.length, 1)
    assert.equal(mock.state.complaints[0].flat_no, '36-D')
    assert.equal(mock.state.complaints[0].is_urgent, false)
    assert.equal(mock.state.session, null)
    assert.equal(mock.residentMessages().length, 4)
    assert.match(mock.residentMessages()[3].text, /OTP/)
    assert.match(mock.residentMessages()[3].text, /Queue position/)
    bilingual(mock.residentMessages()[3].text)
    assert.equal(mock.state.messagesSent.filter(x => x.recipient === '910000000002').length, 1)
  } finally { mock.restore() }
})

test('returning resident: remembered flat, no flat question, optional correction', async () => {
  const mock = mockServices({ priorFlats: ['45-A'] })
  try {
    await say('Hi')
    assert.equal(mock.state.session.flat_no, '45-A')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.match(mock.residentMessages()[0].text, /45-A/)

    await say('2') // electrician
    assert.equal(mock.state.session.step, 'CONFIRM')
    assert.equal(mock.residentMessages().length, 2)
    assert.match(mock.residentMessages()[1].text, /45-A/)
    assert.doesNotMatch(mock.residentMessages()[1].text, /enter your flat number/i)

    await say('3') // change saved flat
    assert.equal(mock.state.session.step, 'FLAT_CORRECTION')
    assert.equal(mock.residentMessages().length, 3)

    await say('46-D')
    assert.equal(mock.state.session.step, 'CONFIRM')
    assert.equal(mock.state.session.flat_no, '46-D')
    assert.match(mock.residentMessages()[3].text, /46-D/)

    await say('1')
    assert.equal(mock.state.complaints[0].flat_no, '46-D')
    assert.equal(mock.residentMessages().length, 5)
  } finally { mock.restore() }
})

test('redelivered WhatsApp webhook ID produces only one outgoing reply', async () => {
  const mock = mockServices()
  try {
    await say('Hi', 'wamid.duplicate')
    const firstSession = mock.state.session
    await say('Hi', 'wamid.duplicate')
    assert.equal(mock.state.session, firstSession)
    assert.equal(mock.state.claimedIds.size, 1)
    assert.equal(mock.residentMessages().length, 1)
  } finally { mock.restore() }
})

test('housekeeping category asks issue type but never asks urgent priority', async () => {
  const mock = mockServices({ priorFlats: ['12-B'] })
  try {
    await say('Hi')
    await say('6') // housekeeping: street-light is disabled
    assert.equal(mock.state.session.category_id, 7)
    assert.equal(mock.state.session.step, 'ISSUE_TYPE')
    bilingual(mock.residentMessages()[1].text)
    await say('1')
    assert.equal(mock.state.session.step, 'CONFIRM')
    assert.equal(mock.state.session.issue_type, 'GARBAGE_NOT_COLLECTED')
    assert.equal(mock.residentMessages().length, 3)
  } finally { mock.restore() }
})

test('work done Yes closes without rating or thank-you; No reopens', async () => {
  const mock = mockServices({ workDoneComplaint: {
    id: 22, complaint_no: 'P222', status: 'WORK_DONE', resident_rating: null
  } })
  try {
    await say('other') // invalid response repeats only the bilingual work-done question
    assert.equal(mock.residentMessages().length, 1)
    bilingual(mock.residentMessages()[0].text)
    assert.match(mock.residentMessages()[0].text, /Yes \/ हाँ/)
    await say('1')
    assert.equal(mock.state.workDoneComplaint.status, 'CLOSED')
    assert.equal(mock.state.workDoneComplaint.resident_confirmation, true)
    assert.equal(mock.state.workDoneComplaint.resident_rating, null)
    assert.equal(mock.residentMessages().length, 1)
  } finally { mock.restore() }

  const second = mockServices({ workDoneComplaint: {
    id: 23, complaint_no: 'P223', status: 'WORK_DONE'
  } })
  try {
    await say('2')
    assert.equal(second.state.workDoneComplaint.status, 'REOPENED')
    assert.equal(second.residentMessages().length, 1)
    bilingual(second.residentMessages()[0].text)
  } finally { second.restore() }
})
