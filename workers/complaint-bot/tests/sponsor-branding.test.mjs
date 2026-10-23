// Run: node --test workers/complaint-bot/tests/sponsor-branding.test.mjs
// No real network, Supabase, Cloudflare or Meta credentials are used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workerSource = await readFile(new URL('../worker.js', import.meta.url), 'utf8')
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'))

const ENV = {
  SUPABASE_URL: 'https://mock-supabase.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-test-key',
  WHATSAPP_ACCESS_TOKEN: 'fake-test-token',
  WHATSAPP_PHONE_NUMBER_ID: 'fake-test-phone'
}

function mockScenario({ language = 'EN', sponsor = {}, sponsorFailure = false } = {}) {
  const sent = []
  const calls = []
  const originalFetch = globalThis.fetch
  const session = {
    step: 'CONFIRM', preferred_language: language, category_id: 2,
    flat_no: '1-A', description: 'Test electrical issue', is_urgent: false
  }
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    calls.push(path)
    if (path.startsWith('https://graph.facebook.com/')) {
      sent.push(JSON.parse(options.body).text.body)
      return new Response(JSON.stringify({ messages: [{ id: 'mock-message' }] }), { status: 200 })
    }
    if (!path.startsWith(ENV.SUPABASE_URL)) throw new Error('Unexpected network request: ' + path)
    if (path.includes('/whatsapp_complaint_sessions?') && options.method === 'GET') {
      return Response.json([session])
    }
    if (path.includes('/complaints') && options.method === 'POST') {
      return Response.json([{ id: 123, complaint_no: 'E123', flat_no: '1-A' }])
    }
    if (path.includes('/complaints?') && options.method === 'GET') {
      return Response.json([])
    }
    if (path.includes('/chatbot_sponsors?')) {
      if (sponsorFailure) return new Response('Mock database unavailable', { status: 503 })
      return Response.json([{
        company_name: 'ABC Pvt Ltd.', contact_number: '9818195880',
        start_date: '2020-01-01', end_date: '2099-12-31', enabled: true,
        ...sponsor
      }])
    }
    return new Response('', { status: 204 })
  }
  return { sent, calls, restore: () => { globalThis.fetch = originalFetch } }
}

async function confirm() {
  const request = new Request('https://staging-worker.invalid/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{
      from: '919999999999', type: 'text', text: { body: '1' }
    }] } }] }] })
  })
  const response = await worker.fetch(request, ENV)
  assert.equal(response.status, 200)
}

test('English registration includes one sponsor footer in existing confirmation', async () => {
  const mock = mockScenario()
  try {
    await confirm()
    assert.equal(mock.sent.length, 1)
    assert.match(mock.sent[0], /Your complaint has been registered successfully/)
    assert.match(mock.sent[0], /Supported by \*ABC Pvt Ltd\.\*/)
    assert.match(mock.sent[0], /Contact: 9818195880/)
    assert.equal((mock.sent[0].match(/Supported by/g) || []).length, 1)
  } finally { mock.restore() }
})

test('Hindi registration includes Hindi sponsor footer', async () => {
  const mock = mockScenario({ language: 'HI' })
  try {
    await confirm()
    assert.equal(mock.sent.length, 1)
    assert.match(mock.sent[0], /शिकायत सफलतापूर्वक दर्ज/)
    assert.match(mock.sent[0], /सौजन्य से: \*ABC Pvt Ltd\.\*/)
    assert.match(mock.sent[0], /संपर्क: 9818195880/)
  } finally { mock.restore() }
})

test('Expired sponsor is omitted', async () => {
  const mock = mockScenario({ sponsor: { end_date: '2020-01-02' } })
  try {
    await confirm()
    assert.equal(mock.sent.length, 1)
    assert.doesNotMatch(mock.sent[0], /Supported by|सौजन्य से/)
  } finally { mock.restore() }
})

test('Disabled sponsor is omitted', async () => {
  const mock = mockScenario({ sponsor: { enabled: false } })
  try {
    await confirm()
    assert.equal(mock.sent.length, 1)
    assert.doesNotMatch(mock.sent[0], /Supported by|सौजन्य से/)
  } finally { mock.restore() }
})

test('Sponsor database failure does not block complaint confirmation', async () => {
  const mock = mockScenario({ sponsorFailure: true })
  try {
    await confirm()
    assert.equal(mock.sent.length, 1)
    assert.match(mock.sent[0], /Your complaint has been registered successfully/)
    assert.doesNotMatch(mock.sent[0], /Supported by/)
  } finally { mock.restore() }
})
