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
  WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
  WEB_COMPLAINT_PUBLIC_URL: 'https://rwa-ai.pages.dev/?view=complaint-chat'
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' }
  })
}

function mockServices({
  priorFlats = [], workDoneComplaint = null, supervisorRole = 'SUPERVISOR',
  todaysWhatsappFlats = [], forceDailyDbConflict = false
} = {}) {
  const state = {
    claimedIds: new Set(), messagesSent: [], session: null,
    previousFlats: priorFlats, complaints: [], mapping: null, supervisorRole,
    todaysWhatsappFlats, forceDailyDbConflict, dailyQueries: [],
    workDoneComplaint: workDoneComplaint ? { ...workDoneComplaint } : null
  }
  const priorFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const uri = new URL(String(url))
    const method = options.method || 'GET'
    const payload = options.body ? JSON.parse(options.body) : null

    if (uri.hostname === 'graph.facebook.com') {
      assert.equal(method, 'POST')
      state.messagesSent.push({
        recipient: payload.to,
        type: payload.type,
        text: payload.type === 'interactive'
          ? payload.interactive?.body?.text : payload.text?.body,
        interactive: payload.interactive || null
      })
      return json({ messages: [{ id: 'wamid.mock.out' }] })
    }
    if (uri.pathname === '/auth/v1/user') {
      return json({ id: '6f218a36-f458-4549-957e-cbd5b29e8eb1' })
    }
    assert.equal(uri.hostname, 'supabase.example.test')

    if (uri.pathname === '/rest/v1/app_users') {
      return json([{ role: state.supervisorRole }])
    }
    if (uri.pathname === '/rest/v1/whatsapp_resident_flat_mappings') {
      if (method === 'GET') return json(state.mapping ? [state.mapping] : [])
      if (method === 'POST') {
        state.mapping = { ...state.mapping, ...payload }
        return options.headers?.Prefer?.includes('return=representation')
          ? json([state.mapping], 201)
          : new Response(null, { status: 204 })
      }
    }
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
        if (uri.searchParams.get('source') === 'eq.WHATSAPP' &&
            uri.searchParams.getAll('created_at').length === 2) {
          state.dailyQueries.push({
            from: uri.searchParams.get('created_at')?.slice(4),
            to: uri.searchParams.getAll('created_at')[1]?.slice(3)
          })
          return json([
            ...state.todaysWhatsappFlats.map(flat_no => ({ flat_no })),
            ...state.complaints.filter(x => x.source === 'WHATSAPP')
              .map(x => ({ flat_no: x.flat_no }))
          ])
        }
        return json(state.previousFlats.map(flat_no => ({ flat_no })))
      }
      if (method === 'GET' && select.includes('status') && select.includes('complaint_no')) {
        const pending = state.workDoneComplaint
        return json(pending?.status === 'WORK_DONE' &&
          (pending.source || 'WHATSAPP') === 'WHATSAPP' ? [pending] : [])
      }
      if (method === 'GET' && select.includes('category_id') && uri.searchParams.has('id')) {
        return json(state.complaints.filter(c => String(c.id) === uri.searchParams.get('id')?.slice(3)))
      }
      if (method === 'GET' && select.includes('category_id')) return json(state.complaints)
      if (method === 'POST') {
        if (payload.source === 'WHATSAPP' && state.forceDailyDbConflict) {
          return json({ code:'23505', message:'RWA_WHATSAPP_DAILY_FLAT_LIMIT' }, 409)
        }
        const row = { id: 101 + state.complaints.length, complaint_no: 'P999', work_start_otp: '1234', ...payload }
        state.complaints.push(row)
        return json([row], 201)
      }
      if (method === 'PATCH') {
        const target = state.workDoneComplaint || state.complaints[0]
        const expectedStatus = uri.searchParams.get('status')?.slice(3)
        const expectedSource = uri.searchParams.get('source')?.slice(3)
        const canUpdate = target &&
          (!expectedStatus || target.status === expectedStatus) &&
          (!expectedSource || (target.source || 'WHATSAPP') === expectedSource)
        if (canUpdate) Object.assign(target, payload)
        return options.headers?.Prefer?.includes('return=representation')
          ? json(canUpdate ? [target] : [])
          : new Response(null, { status: 204 })
      }
    }
    if (uri.pathname === '/rest/v1/workers' && method === 'GET') {
      return json([{ name: 'Plumber', mobile_no: '919000000002' }])
    }
    throw new Error(`Unexpected request: ${method} ${uri.pathname} ${uri.search}`)
  }
  return {
    state, restore: () => { globalThis.fetch = priorFetch },
    residentMessages: () => state.messagesSent.filter(x => x.recipient === '919000000001')
  }
}

let nextId = 0
function inbound(message) {
  const id = message.id || `wamid.mock.${++nextId}`
  return new Request('https://worker.example.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{
        id, from: '919000000001', type: 'text', text: { body: message.body }
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


test('returning resident gets CTA first, then bilingual explanation without a raw link', async () => {
  const mock = mockServices({
    priorFlats: ['36-D'], todaysWhatsappFlats: ['36D']
  })
  try {
    await say('Hi')
    assert.equal(mock.state.complaints.length, 0)
    assert.equal(mock.state.session, null)
    const messages = mock.residentMessages()
    assert.equal(messages.length, 2)
    const [cta, explanation] = messages
    assert.equal(cta.type, 'interactive')
    assert.equal(cta.interactive.type, 'cta_url')
    assert.equal(cta.interactive.action.name, 'cta_url')
    assert.equal(cta.interactive.action.parameters.display_text, 'Register Complaint')
    assert.ok(cta.interactive.action.parameters.display_text.length <= 20)
    assert.equal(cta.interactive.action.parameters.url, 'https://rwa-ai.pages.dev/?view=complaint-chat')
    assert.equal(cta.interactive.header, undefined, 'Do not add a header above CTA')
    assert.match(cta.text, /Register complaint here/)
    assert.doesNotMatch(cta.text, /https?:\/\//)

    assert.equal(explanation.type, 'text')
    assert.match(explanation.text, /WhatsApp daily limit reached/)
    assert.match(explanation.text, /additional complaints/)
    assert.match(explanation.text, /Register Complaint/)
    assert.match(explanation.text, /एक फ्लैट की प्रतिदिन केवल एक शिकायत/)
    assert.match(explanation.text, /one complaint per flat per day/)
    assert.doesNotMatch(explanation.text, /https?:\/\//)
    bilingual(explanation.text)
    assert.equal(mock.state.dailyQueries.length, 1)
    assert.match(mock.state.dailyQueries[0].from, /T18:30:00.000Z$/)
    assert.match(mock.state.dailyQueries[0].to, /T18:30:00.000Z$/)
  } finally { mock.restore() }
})

test('new mobile cannot submit another WhatsApp complaint against same flat today', async () => {
  const mock = mockServices({ todaysWhatsappFlats: ['36 D'] })
  try {
    await say('Hi')
    await say('1')
    await say('36-D')
    assert.equal(mock.state.complaints.length, 0)
    assert.equal(mock.state.session, null)
    const [cta, explanation] = mock.residentMessages().slice(-2)
    assert.equal(cta.type, 'interactive')
    assert.equal(cta.interactive.action.parameters.display_text, 'Register Complaint')
    assert.match(cta.interactive.action.parameters.url, /rwa-ai\.pages\.dev/)
    assert.equal(explanation.type, 'text')
    assert.match(explanation.text, /one complaint per flat per day/)
    assert.doesNotMatch(explanation.text, /https?:\/\//)
    assert.equal(mock.state.messagesSent.filter(x=>x.recipient==='919000000002').length,0)
  } finally { mock.restore() }
})

test('database race conflict is translated to bilingual web link, never a webhook failure', async () => {
  const mock = mockServices({ forceDailyDbConflict:true })
  try {
    await say('Hi')
    await say('1')
    await say('36-D')
    assert.equal(mock.state.complaints.length,0)
    assert.equal(mock.state.session,null)
    const [cta, explanation] = mock.residentMessages().slice(-2)
    assert.equal(cta.type, 'interactive')
    assert.match(cta.interactive.action.parameters.url, /rwa-ai\.pages\.dev/)
    assert.equal(cta.interactive.action.parameters.display_text, 'Register Complaint')
    assert.equal(explanation.type, 'text')
    assert.match(explanation.text, /Your flat has reached this limit today/)
    assert.doesNotMatch(explanation.text, /https?:\/\//)
  } finally { mock.restore() }
})

test('a WhatsApp daily complaint from a previous India day does not block new entry', async () => {
  const mock = mockServices({ priorFlats: ['36-D'] })
  try {
    await say('Hi')
    assert.equal(mock.state.session.step,'CATEGORY')
    await say('2')
    assert.equal(mock.state.complaints.length,1)
    assert.equal(mock.state.complaints[0].source,'WHATSAPP')
  } finally { mock.restore() }
})

test('new resident: registers immediately after flat, without a confirmation prompt', async () => {
  const mock = mockServices()
  try {
    await say('Hi')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.equal(mock.residentMessages().length, 1)
    bilingual(mock.residentMessages()[0].text)
    assert.match(mock.residentMessages()[0].text, /Plumber \/ प्लंबर/)

    await say('1') // Plumbing
    assert.equal(mock.state.session.step, 'FLAT_NO')
    assert.equal(mock.residentMessages().length, 2)

    await say('36-D') // Last required input; immediately register
    assert.equal(mock.state.complaints.length, 1)
    assert.equal(mock.state.complaints[0].flat_no, '36-D')
    assert.equal(mock.state.complaints[0].is_urgent, false)
    assert.equal(mock.state.session, null)
    assert.equal(mock.residentMessages().length, 3)
    assert.doesNotMatch(mock.residentMessages()[2].text, /Register \/|Cancel \/|Review complaint/)
    assert.match(mock.residentMessages()[2].text, /Complaint registered/)
    assert.match(mock.residentMessages()[2].text, /OTP/)
    assert.match(mock.residentMessages()[2].text, /Queue position/)
    bilingual(mock.residentMessages()[2].text)
    assert.equal(mock.state.messagesSent.filter(x => x.recipient === '919000000002').length, 1)
  } finally { mock.restore() }
})

test('returning resident registers immediately after category; no flat or confirmation question', async () => {
  const mock = mockServices({ priorFlats: ['45-A'] })
  try {
    await say('Hi')
    assert.equal(mock.state.session.flat_no, '45-A')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.match(mock.residentMessages()[0].text, /45-A/)
    assert.doesNotMatch(mock.residentMessages()[0].text, /FLAT 36-D/)

    await say('2') // Electrician, final required input with known flat
    assert.equal(mock.state.session, null)
    assert.equal(mock.state.complaints.length, 1)
    assert.equal(mock.state.complaints[0].flat_no, '45-A')
    assert.equal(mock.state.complaints[0].category_id, 2)
    assert.equal(mock.residentMessages().length, 2)
    assert.match(mock.residentMessages()[1].text, /Complaint registered/)
    assert.doesNotMatch(mock.residentMessages()[1].text, /Register \/|Cancel \/|Review complaint/)
  } finally { mock.restore() }
})

test('resident cannot change a previously registered flat through chatbot', async () => {
  const mock = mockServices({ priorFlats: ['45-A'] })
  try {
    await say('Hi')
    await say('FLAT 46-D')
    assert.equal(mock.state.session.flat_no, '45-A')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.equal(mock.residentMessages().length, 2)
    assert.match(mock.residentMessages()[1].text, /Please select a valid option/)
    await say('2')
    assert.equal(mock.state.complaints.length, 1)
    assert.equal(mock.state.complaints[0].flat_no, '45-A')
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

test('housekeeping category registers directly after selecting required issue type', async () => {
  const mock = mockServices({ priorFlats: ['12-B'] })
  try {
    await say('Hi')
    await say('6') // Housekeeping: street-light is disabled
    assert.equal(mock.state.session.category_id, 7)
    assert.equal(mock.state.session.step, 'ISSUE_TYPE')
    bilingual(mock.residentMessages()[1].text)
    await say('1') // Garbage not collected
    assert.equal(mock.state.session, null)
    assert.equal(mock.state.complaints[0].issue_type, 'GARBAGE_NOT_COLLECTED')
    assert.equal(mock.residentMessages().length, 3)
    assert.match(mock.residentMessages()[2].text, /Complaint registered/)
  } finally { mock.restore() }
})

test('camera recording registers directly after date/time input', async () => {
  const mock = mockServices({ priorFlats: ['7-C'] })
  try {
    await say('Hi')
    await say('4')
    assert.equal(mock.state.session.step, 'INCIDENT_DATETIME')
    assert.equal(mock.residentMessages().length, 2)
    await say('2 Nov, 8 PM')
    assert.equal(mock.state.session, null)
    assert.equal(mock.state.complaints[0].incident_datetime_text, '2 Nov, 8 PM')
    assert.equal(mock.residentMessages().length, 3)
    assert.match(mock.residentMessages()[2].text, /Complaint registered/)
  } finally { mock.restore() }
})


test('work completion Yes wins over a stale category session and never creates a new plumber complaint', async () => {
  const mock = mockServices({ priorFlats: ['36-D'], workDoneComplaint: {
    id: 301, complaint_no: 'P301', source: 'WHATSAPP',
    status: 'WORK_DONE', work_done_at: new Date().toISOString()
  } })
  try {
    await say('Hi')
    assert.equal(mock.state.session.step, 'CATEGORY')
    assert.equal(mock.state.session.flat_no, '36-D')

    // Reproduce the real-world bug: the resident already had a Hi/menu
    // session open when the work-completion question arrived later.
    mock.state.session.updated_at = new Date(Date.now() - 60000).toISOString()
    const sentBefore = mock.residentMessages().length
    await say('1')

    assert.equal(mock.state.workDoneComplaint.status, 'CLOSED')
    assert.equal(mock.state.workDoneComplaint.resident_confirmation, true)
    assert.equal(mock.state.complaints.length, 0, 'No second plumber complaint is created')
    assert.equal(mock.state.session, null, 'Old menu is invalidated')
    assert.equal(mock.residentMessages().length, sentBefore, 'Yes closes silently')

    await say('1') // A separate/duplicated Yes must also not register.
    assert.equal(mock.state.complaints.length, 0)
  } finally { mock.restore() }
})

test('work completion No wins over an older active category session and reopens only the original complaint', async () => {
  const mock = mockServices({ priorFlats: ['36-D'], workDoneComplaint: {
    id: 302, complaint_no: 'P302', source: 'WHATSAPP',
    status: 'WORK_DONE', work_done_at: new Date().toISOString()
  } })
  try {
    await say('Hi')
    mock.state.session.updated_at = new Date(Date.now() - 60000).toISOString()
    await say('2')
    assert.equal(mock.state.workDoneComplaint.status, 'REOPENED')
    assert.equal(mock.state.workDoneComplaint.resident_confirmation, false)
    assert.equal(mock.state.complaints.length, 0)
    assert.equal(mock.state.session, null)
    assert.match(mock.residentMessages().at(-1).text, /reopened/)
  } finally { mock.restore() }
})

test('explicit Hi after an old completion prompt starts a new complaint normally', async () => {
  const mock = mockServices({ priorFlats: ['36-D'], workDoneComplaint: {
    id: 303, complaint_no: 'P303', source: 'WHATSAPP',
    status: 'WORK_DONE', work_done_at: new Date(Date.now() - 3600000).toISOString()
  } })
  try {
    await say('Hi') // Deliberate new registration after old work-done prompt.
    assert.equal(mock.state.session.step, 'CATEGORY')
    await say('1')
    assert.equal(mock.state.complaints.length, 1)
    assert.equal(mock.state.complaints[0].category_id, 1)
    assert.equal(mock.state.workDoneComplaint.status, 'WORK_DONE')
  } finally { mock.restore() }
})

test('WhatsApp acknowledgement cannot close an unverified WEB-only complaint for the same mobile number', async () => {
  const mock = mockServices({ workDoneComplaint: {
    id: 304, complaint_no: 'P304', source: 'WEB', status: 'WORK_DONE'
  } })
  try {
    await say('1')
    assert.equal(mock.state.workDoneComplaint.status, 'WORK_DONE')
    assert.equal(mock.state.complaints.length, 0)
    assert.match(mock.residentMessages().at(-1).text, /Hi/)
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


function supervisorRequest(method, phone, body = undefined, token = 'test-token') {
  const url = `https://worker.example.test/api/residents/flat` +
    (method === 'GET' ? `?mobile=${encodeURIComponent(phone)}` : '')
  return new Request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
}

test('supervisor updates saved flat; clear suppresses history and next valid complaint stores new flat', async () => {
  const mock = mockServices({ priorFlats: ['45-A'] })
  try {
    let response = await worker.fetch(supervisorRequest('GET', '9000000001'), env)
    assert.equal(response.status, 200)
    let result = await response.json()
    assert.equal(result.flat_no, '45-A')
    assert.equal(result.source, 'HISTORY')

    response = await worker.fetch(supervisorRequest('POST', '9000000001', {
      mobile_no: '9000000001', action: 'UPDATE', flat_no: '46-D'
    }), env)
    assert.equal(response.status, 200)
    result = await response.json()
    assert.equal(result.flat_no, '46-D')
    assert.equal(mock.state.mapping.flat_no, '46-D')

    await say('Hi')
    assert.equal(mock.state.session.flat_no, '46-D')
    assert.match(mock.residentMessages().at(-1).text, /46-D/)

    response = await worker.fetch(supervisorRequest('POST', '9000000001', {
      mobile_no: '9000000001', action: 'CLEAR'
    }), env)
    assert.equal(response.status, 200)
    assert.equal(mock.state.mapping.flat_no, null)
    assert.equal(mock.state.session, null)

    response = await worker.fetch(supervisorRequest('GET', '9000000001'), env)
    result = await response.json()
    assert.equal(result.source, 'CLEARED')
    assert.equal(result.flat_no, null)

    await say('Hi')
    assert.equal(mock.state.session.flat_no, null)
    await say('2')
    assert.equal(mock.state.session.step, 'FLAT_NO')
    await say('48-B')
    assert.equal(mock.state.complaints[0].flat_no, '48-B')
    assert.equal(mock.state.mapping.flat_no, '48-B')
    assert.equal(mock.state.complaints.length, 1)
  } finally { mock.restore() }
})

test('non-supervisor and unauthenticated users cannot view or change mobile-flat mappings', async () => {
  const mock = mockServices({ priorFlats: ['45-A'], supervisorRole: 'PLUMBER' })
  try {
    let response = await worker.fetch(supervisorRequest('GET', '9000000001'), env)
    assert.equal(response.status, 403)
    response = await worker.fetch(supervisorRequest('POST', '9000000001', {
      mobile_no: '9000000001', action: 'UPDATE', flat_no: '12-A'
    }), env)
    assert.equal(response.status, 403)
    response = await worker.fetch(new Request('https://worker.example.test/api/residents/flat?mobile=9000000001'), env)
    assert.equal(response.status, 401)
    assert.equal(mock.state.mapping, null)
  } finally { mock.restore() }
})

test('supervisor rejects invalid mobile and invalid flat values', async () => {
  const mock = mockServices({ priorFlats: ['45-A'] })
  try {
    let response = await worker.fetch(supervisorRequest('GET', '123'), env)
    assert.equal(response.status, 400)
    response = await worker.fetch(supervisorRequest('POST', '9000000001', {
      mobile_no: '9000000001', action: 'UPDATE', flat_no: 'COMMON AREA'
    }), env)
    assert.equal(response.status, 400)
    assert.equal(mock.state.mapping, null)
  } finally { mock.restore() }
})
