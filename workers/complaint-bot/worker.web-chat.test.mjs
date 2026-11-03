import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const code = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const ticket = 'd43d8487-314f-4e0a-a3bd-e1fd9fa2e786'
const env = {
  SUPABASE_URL:'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY:'test-service-secret',
  WEB_TURNSTILE_SECRET_KEY:'test-turnstile-secret',
  WEB_TURNSTILE_HOSTNAMES:'chat.example.test',
  WHATSAPP_ACCESS_TOKEN:'test-whatsapp-secret',
  WHATSAPP_PHONE_NUMBER_ID:'phone-id'
}
const json = (o, status=200) => new Response(JSON.stringify(o), {
  status, headers:{ 'Content-Type':'application/json' }
})
function mock({ captchaHost = 'chat.example.test' } = {}) {
  const data = { complaints:[], turnstile:0, messages:0 }
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts={}) => {
    const parsed = new URL(String(url))
    const method = opts.method || 'GET'
    const body = opts.body && typeof opts.body === 'string' && opts.headers?.['Content-Type'] === 'application/json'
      ? JSON.parse(opts.body) : null
    if (parsed.hostname === 'challenges.cloudflare.com') {
      data.turnstile++
      assert.equal(method, 'POST')
      assert.match(String(opts.body), /test-turnstile-secret/)
      return json({ success:true, hostname:captchaHost })
    }
    if (parsed.hostname === 'graph.facebook.com') {
      data.messages++
      throw new Error('Web complaints must not require WhatsApp API.')
    }
    if (parsed.pathname === '/auth/v1/user') return json({ id:'6f218a36-f458-4549-957e-cbd5b29e8eb1' })
    if (parsed.pathname === '/rest/v1/app_users') return json([{ role:'SUPERVISOR' }])
    if (parsed.pathname === '/rest/v1/complaints') {
      const select = parsed.searchParams.get('select') || ''
      if (method === 'POST') {
        const row = {
          ...body, id:100 + data.complaints.length, complaint_no:'P777',
          work_start_otp:body.category_id === 1 ? '9876' : null
        }
        data.complaints.push(row)
        return json([row], 201)
      }
      if (method === 'PATCH') {
        const id = Number(parsed.searchParams.get('id')?.slice(3))
        const row = data.complaints.find(x => x.id === id)
        if (row) Object.assign(row, body)
        return opts.headers?.Prefer?.includes('representation') ? json(row ? [row] : []) : new Response(null, {status:204})
      }
      if (parsed.searchParams.has('web_request_id')) {
        const requested = parsed.searchParams.get('web_request_id').slice(3)
        const found = data.complaints.find(x => x.web_request_id === requested)
        return json(found ? [found] : [])
      }
      if (method === 'GET' && select === 'id') return json(data.complaints)
      if (method === 'GET' && parsed.searchParams.has('id')) {
        const id = Number(parsed.searchParams.get('id').slice(3))
        return json(data.complaints.filter(x => x.id === id))
      }
      if (method === 'GET' && select.includes('complaint_no')) return json(data.complaints)
      return json(data.complaints)
    }
    if (parsed.pathname === '/rest/v1/workers') return json([])
    throw Error(`Unexpected fetch ${method} ${parsed}`)
  }
  return { data, restore:() => { globalThis.fetch = original } }
}
const endpoint = path => `https://worker.example.test${path}`
async function post(path, payload, overrideEnv=env) {
  const response = await worker.fetch(new Request(endpoint(path), {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer test-user-token' },
    body:JSON.stringify(payload)
  }), overrideEnv)
  return { status:response.status, data:await response.json() }
}
async function get(path) {
  const response = await worker.fetch(new Request(endpoint(path)),env)
  return { status:response.status, data:await response.json() }
}
const complaint = (override={}) => ({
  ticket,
  category_id:1,
  flat_no:'36-D',
  mobile_no:'919876543210',
  turnstile_token:'test-captcha',
  ...override
})

test('web chatbot config is public and matches existing enabled WhatsApp categories', async () => {
  const result = await get('/api/web-complaints/config')
  assert.equal(result.status,200)
  assert.deepEqual(result.data.categories.map(x=>x.id),[1,2,3,4,5,7,8])
  assert.equal(result.data.issue_types['7'].length,5)
  assert.equal(result.data.issue_types['5'].length,5)
})

test('no login: create real plumbing complaint in shared queue, obtain OTP and avoid Meta', async () => {
  const m = mock()
  try {
    const result = await post('/api/web-complaints/register', complaint())
    assert.equal(result.status,201)
    assert.equal(result.data.ok,true)
    assert.equal(result.data.complaint_no,'P777')
    assert.equal(result.data.work_start_otp,'9876')
    assert.equal(result.data.queue_position,1)
    assert.equal(m.data.complaints.length,1)
    assert.equal(m.data.complaints[0].source,'WEB')
    assert.equal(m.data.complaints[0].flat_no,'36-D')
    assert.equal(m.data.messages,0)

    const status = await get(`/api/web-complaints/status?ticket=${ticket}`)
    assert.equal(status.status,200)
    assert.equal(status.data.status,'OPEN')
    assert.equal(status.data.work_start_otp,'9876')

    const retry = await post('/api/web-complaints/register', complaint({turnstile_token:'already-used'}))
    assert.equal(retry.status,200)
    assert.equal(m.data.complaints.length,1)
    assert.equal(m.data.turnstile,1)
  } finally { m.restore() }
})

test('web app accepts a second complaint for the same flat on the same day', async () => {
  const m = mock()
  try {
    const first = await post('/api/web-complaints/register', complaint())
    assert.equal(first.status, 201)
    const second = await post('/api/web-complaints/register', complaint({
      ticket:'d43d8487-314f-4e0a-a3bd-e1fd9fa2e787',
      category_id:2
    }))
    assert.equal(second.status, 201)
    assert.equal(m.data.complaints.length,2)
    assert.deepEqual(m.data.complaints.map(x=>x.source),['WEB','WEB'])
    assert.deepEqual(m.data.complaints.map(x=>x.flat_no),['36-D','36-D'])
    assert.equal(m.data.messages,0)
    assert.equal(m.data.turnstile,2)
  } finally { m.restore() }
})

test('worker rejects invalid data, unconfigured verification, and unexpected Turnstile host', async () => {
  const m = mock({ captchaHost:'malicious.example' })
  try {
    const bad = await post('/api/web-complaints/register', complaint({ flat_no:'UNKNOWN' }))
    assert.equal(bad.status,400)
    const missingDate = await post('/api/web-complaints/register', complaint({category_id:4}))
    assert.equal(missingDate.status,400)
    const rejected = await post('/api/web-complaints/register', complaint())
    assert.equal(rejected.status,403)
    const missingSecret = await post('/api/web-complaints/register', complaint(), {...env,WEB_TURNSTILE_SECRET_KEY:''})
    assert.equal(missingSecret.status,503)
    assert.equal(m.data.complaints.length,0)
    assert.equal(m.data.messages,0)
  } finally { m.restore() }
})

test('housekeeping requires correct issue option; otherwise no complaint is inserted', async () => {
  const m=mock()
  try {
    const bad = await post('/api/web-complaints/register', complaint({category_id:7}))
    assert.equal(bad.status,400)
    const good = await post('/api/web-complaints/register', complaint({
      category_id:7, issue_option:'1', issue_type:'GARBAGE_NOT_COLLECTED'
    }))
    assert.equal(good.status,201)
    assert.equal(m.data.complaints[0].issue_type,'GARBAGE_NOT_COLLECTED')
    assert.equal(m.data.complaints[0].work_start_otp,null)
  } finally { m.restore() }
})

test('supervisor work done uses web ticket; resident Yes closes without WhatsApp', async () => {
  const m=mock()
  try {
    const created = await post('/api/web-complaints/register', complaint({category_id:2}))
    assert.equal(created.status,201)
    const done = await post('/api/complaints/supervisor-done', {complaint_id:100})
    assert.equal(done.status,200)
    assert.equal(done.data.confirmation_channel,'WEB')
    assert.equal(done.data.status,'WORK_DONE')
    assert.equal(m.data.messages,0)
    const status = await get(`/api/web-complaints/status?ticket=${ticket}`)
    assert.equal(status.data.status,'WORK_DONE')
    const confirmed = await post('/api/web-complaints/confirm', {ticket,resolved:true})
    assert.equal(confirmed.status,200)
    assert.equal(confirmed.data.status,'CLOSED')
    assert.equal(m.data.complaints[0].resident_confirmation,true)
    const repeat = await post('/api/web-complaints/confirm', {ticket,resolved:true})
    assert.equal(repeat.status,409)
  } finally { m.restore() }
})
