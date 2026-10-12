import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noticeService } from './notices.js'
const env = { WHATSAPP_BUSINESS_ACCOUNT_ID: 'test', NOTICE_TEMPLATE_NAMES: 'rwa_notice', WHATSAPP_ACCESS_TOKEN: 'test', WHATSAPP_PHONE_NUMBER_ID: 'phone', ENABLE_NOTICE_DISPATCH: 'true' }
const template = { name: 'rwa_notice', language: 'en_US', status: 'APPROVED', components: [{ type: 'BODY', text: 'RWA notice: {{1}} on {{2}}.' }] }
const request = (data = {}) => new Request('https://rwa-complaint-bot.singh-virendra18.workers.dev/api/notices', { method: 'POST', body: JSON.stringify(data) })
const body = { template_name: 'rwa_notice', language: 'en_US', parameters: ['Water supply', 'Monday'], selection: { mode: 'all', values: [] } }
function mock(role = 'RWA_EXECUTIVE', authenticated = true) {
  const calls = []; const service = noticeService({ auth: async () => authenticated ? { id: 'exec' } : null, sendText: async () => {}, db: async (e, path, options) => {
    calls.push({ path, options })
    if (path.includes('app_users')) return [{ role }]
    if (path.includes('notice_subscribers')) return [{ mobile_no: '919999999999', flat_no: '36D', tower_no: 9 }]
    if (path.includes('enqueue')) return 'queued-notice'
    return []
  } })
  return { service, calls }
}
test('all notice actions require an active executive', async () => {
  for (const role of ['SUPERVISOR', 'PLUMBER', 'GUARD', 'RESIDENT']) {
    const { service, calls } = mock(role)
    for (const action of ['templates','recipients','preview','send','history','retry']) await assert.rejects(service.api(request(body), env, {}, action), e => e.status === 403)
    assert(calls.every(c => c.path.includes('app_users')))
  }
  await assert.rejects(mock('', false).service.api(request(), env, {}, 'history'), e => e.status === 401)
})
test('only supported approved text templates are exposed', () => {
  const { service } = mock()
  assert.equal(service.normalizeTemplate(template).count, 2)
  for (const t of [{ ...template, status: 'PAUSED' }, { ...template, parameter_format: 'NAMED' }, { ...template, components: [{ type: 'BODY', text: '{{2}}' }] }, { ...template, components: [...template.components, { type: 'HEADER', format: 'IMAGE' }] }]) assert.equal(service.normalizeTemplate(t), null)
})
test('preview, changed-preview rejection and durable enqueue', async () => {
  const old = globalThis.fetch
  globalThis.fetch = async () => Response.json({ data: [template] })
  try {
    const { service, calls } = mock()
    const preview = await service.api(request(body), env, {}, 'preview')
    assert.equal(preview.message, 'RWA notice: Water supply on Monday.')
    assert.equal(preview.recipient_count, 1)
    const send = { ...body, request_id: '00000000-0000-4000-8000-000000000001', preview_text: preview.message, recipient_count: 2 }
    await assert.rejects(service.api(request(send), env, {}, 'send'), e => e.status === 409)
    assert(!calls.some(c => c.path.includes('enqueue')))
    const promises = []
    const result = await service.api(request({ ...send, recipient_count: 1 }), env, { waitUntil: p => promises.push(p) }, 'send')
    await Promise.all(promises)
    assert.equal(result.notice_id, 'queued-notice')
    assert.equal(calls.filter(c => c.path.includes('enqueue')).length, 1)
    await assert.rejects(service.api(request({ ...send, recipient_count: 1 }), { ...env, ENABLE_NOTICE_DISPATCH: 'false' }, {}, 'send'), e => e.status === 503)
  } finally { globalThis.fetch = old }
})
test('only selected subscribed residents can be previewed', async () => {
  const old = globalThis.fetch; globalThis.fetch = async () => Response.json({ data: [template] })
  try {
    const { service } = mock()
    await assert.rejects(service.api(request({ ...body, selection: { mode: 'towers', values: ['1'] } }), env, {}, 'preview'), /No subscribed/)
    await assert.rejects(service.api(request({ ...body, parameters: ['bad\nvalue','Monday'] }), env, {}, 'preview'), /single-line/)
  } finally { globalThis.fetch = old }
})
test('opt-out updates consent without touching complaint sessions', async () => {
  const { service, calls } = mock()
  assert.equal(await service.subscription(env, '919999999999', 'STOP NOTICES'), true)
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(calls[0].options.body).subscribed, false)
  assert.equal(await service.subscription(env, '919999999999', 'Hi'), false)
})
test('subscription updates require the exact signed Meta request bytes', async () => {
  const { service } = mock()
  const raw = '{"test":true}'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const signature = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  const req = new Request('https://test', { headers: { 'x-hub-signature-256': `sha256=${signature}` } })
  assert.equal(await service.verifyWebhook(req, { WHATSAPP_APP_SECRET: 'secret' }, raw), true)
  assert.equal(await service.verifyWebhook(req, { WHATSAPP_APP_SECRET: 'secret' }, raw + ' '), false)
  assert.equal(await service.verifyWebhook(req, {}, raw), false)
})
test('dispatch skips withdrawn consent and distinguishes rejection from unknown outcome', async () => {
  const old = globalThis.fetch
  try {
    for (const outcome of ['unsubscribed','rejected','accepted','network']) {
      const patches = []
      const service = noticeService({ auth: async () => null, sendText: async () => {}, db: async (e, path, opts) => {
        if (path.includes('claim_notice')) return [{ id:'job', notice_id:'notice', mobile_no:'919999999999' }]
        if (path.includes('notice_subscribers')) return outcome === 'unsubscribed' ? [] : [{ mobile_no:'919999999999' }]
        if (path.includes('rwa_notices')) return [{ template_name:'rwa_notice', language:'en_US', parameters:['test'] }]
        patches.push(JSON.parse(opts.body)); return []
      } })
      globalThis.fetch = async () => {
        if (outcome === 'network') throw new Error('Network lost')
        if (outcome === 'rejected') return Response.json({ error:{code:131000} },{status:400})
        return Response.json({ messages:[{id:'wamid.test'}] })
      }
      await service.process(env)
      assert.equal(patches[0].status, {unsubscribed:'SKIPPED',rejected:'FAILED',accepted:'SENT',network:'UNKNOWN'}[outcome])
    }
  } finally { globalThis.fetch = old }
})
test('delivery status cannot regress from read back to delivered', async () => {
  const { service,calls } = mock()
  await service.delivery(env, {id:'wamid.test',status:'delivered'})
  assert(calls[0].path.includes('status=in.(SENDING,SENT)'))
  await service.delivery(env, {id:'wamid.test',status:'read'})
  assert(calls[1].path.includes('status=in.(SENDING,SENT,DELIVERED)'))
})
