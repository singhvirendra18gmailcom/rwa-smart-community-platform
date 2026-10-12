// Notice APIs use service credentials only after verifying the caller's app role.
export function noticeService({ db, auth, sendText }) {
  const requestDb = (env, path, method = 'GET', body) => db(env, path, { method, headers: { Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const fault = (message, status = 400) => Object.assign(new Error(message), { status })
  function normalizeTemplate(t) {
    const body = t.components?.find(c => c.type === 'BODY')?.text
    if (t.status !== 'APPROVED' || !body || t.parameter_format === 'NAMED' || t.components.some(c => !['BODY', 'FOOTER', 'HEADER'].includes(c.type) || (c.type === 'HEADER' && (c.format !== 'TEXT' || c.text?.includes('{{'))))) return null
    const numbers = [...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
    if (body.replace(/\{\{\d+\}\}/g, '').includes('{{')) return null
    const count = Math.max(0, ...numbers)
    if (count > 10 || Array.from({ length: count }, (_, i) => i + 1).some(n => !numbers.includes(n))) return null
    return { name: t.name, language: t.language, body, count, category: t.category, header: t.components.find(c => c.type === 'HEADER')?.text || '', footer: t.components.find(c => c.type === 'FOOTER')?.text || '' }
  }
  async function templates(env) {
    if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID || !env.NOTICE_TEMPLATE_NAMES || !env.WHATSAPP_ACCESS_TOKEN) throw fault('Notice templates are not configured yet. Please contact the app administrator.', 503)
    const allowed = new Set(env.NOTICE_TEMPLATE_NAMES.split(',').map(s => s.trim()).filter(Boolean))
    let after = ''; const found = []
    for (let page = 0; page < 10; page++) {
      const url = `https://graph.facebook.com/v26.0/${encodeURIComponent(env.WHATSAPP_BUSINESS_ACCOUNT_ID)}/message_templates?fields=name,status,language,components,category,parameter_format&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } })
      if (!response.ok) throw fault('Unable to load approved WhatsApp templates.', 502)
      const result = await response.json()
      for (const t of result.data || []) if (allowed.has(t.name)) { const parsed = normalizeTemplate(t); if (parsed) found.push(parsed) }
      if (!result.paging?.next) break
      after = result.paging.cursors?.after
      if (!after) break
    }
    return found
  }
  async function subscribers(env) {
    // Society size is 192 flats. Reject rather than silently truncating larger lists.
    const rows = await requestDb(env, '/rest/v1/notice_subscribers?subscribed=eq.true&select=mobile_no,flat_no,tower_no&limit=501&order=flat_no.asc')
    if (rows.length > 500) throw fault('Recipient limit exceeded. Contact the administrator.', 409)
    return rows
  }
  async function validated(env, body) {
    const template = (await templates(env)).find(t => t.name === body.template_name && t.language === body.language)
    if (!template) throw fault('Choose an approved, configured text notice template.')
    if (!Array.isArray(body.parameters) || body.parameters.length !== template.count || body.parameters.some(p => typeof p !== 'string' || !p.trim() || p.length > 500 || /[\r\n\t]/.test(p))) throw fault('Complete all template fields using single-line text (maximum 500 characters each).')
    const parameters = body.parameters.map(p => p.trim())
    const selection = body.selection || {}
    if (!['all', 'towers', 'flats'].includes(selection.mode)) throw fault('Choose notice recipients.')
    const values = Array.isArray(selection.values) ? selection.values.map(String) : []
    if (selection.mode !== 'all' && !values.length) throw fault('Select at least one tower or flat.')
    const recipients = (await subscribers(env)).filter(s => selection.mode === 'all' || values.includes(String(selection.mode === 'towers' ? s.tower_no : s.flat_no)))
    if (!recipients.length) throw fault('No subscribed residents match this selection.')
    const text = [template.header, template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => parameters[Number(n) - 1]), template.footer].filter(Boolean).join('\n\n')
    return { template, parameters, recipients, text }
  }
  async function api(request, env, ctx, action) {
    const user = await auth(request, env)
    if (!user) throw fault('Authentication required.', 401)
    const roles = await requestDb(env, `/rest/v1/app_users?auth_user_id=eq.${user.id}&active=eq.true&select=role`)
    if (roles[0]?.role !== 'RWA_EXECUTIVE') throw fault('Only RWA Executives can access notices.', 403)
    const body = await request.json()
    if (action === 'templates') return { templates: await templates(env) }
    if (action === 'recipients') return { recipients: await subscribers(env) }
    if (action === 'history') {
      const notices = await requestDb(env, '/rest/v1/rwa_notices?select=id,created_at,message_text,template_name,language,notice_deliveries(status)&order=created_at.desc&limit=30')
      return { notices: notices.map(n => { const counts = {}; for (const r of n.notice_deliveries || []) counts[r.status] = (counts[r.status] || 0) + 1; const { notice_deliveries, ...rest } = n; return { ...rest, counts } }) }
    }
    if ((action === 'send' || action === 'retry') && new URL(request.url).hostname !== (env.NOTICE_SEND_HOST || 'rwa-complaint-bot.singh-virendra18.workers.dev')) throw fault('Preview environments cannot send notices. Use the production executive dashboard.', 403)
    if ((action === 'send' || action === 'retry') && !env.WHATSAPP_PHONE_NUMBER_ID) throw fault('WhatsApp sender is not configured.', 503)
    if ((action === 'send' || action === 'retry') && env.ENABLE_NOTICE_DISPATCH !== 'true') throw fault('Notice sending is not enabled in this environment.', 503)
    if (action === 'preview' || action === 'send') {
      const notice = await validated(env, body)
      if (action === 'preview') return { message: notice.text, recipient_count: notice.recipients.length }
      if (!/^[0-9a-f-]{36}$/i.test(body.request_id || '')) throw fault('Invalid send request.')
      if (body.preview_text !== notice.text || body.recipient_count !== notice.recipients.length) throw fault('The notice or recipient list changed. Preview it again before sending.', 409)
      const result = await requestDb(env, '/rest/v1/rpc/enqueue_rwa_notice', 'POST', { payload: { request_id: body.request_id, created_by: user.id, template_name: notice.template.name, language: notice.template.language, parameters: notice.parameters, message_text: notice.text, recipients: notice.recipients } })
      ctx.waitUntil(process(env).catch(() => console.error('Notice queue processing failed')))
      return { notice_id: result, queued: true }
    }
    if (action === 'retry') {
      if (!/^[0-9a-f-]{36}$/i.test(body.notice_id || '')) throw fault('Invalid notice.')
      const original = (await requestDb(env, `/rest/v1/rwa_notices?id=eq.${body.notice_id}&select=*`))[0]
      if (!original) throw fault('Notice not found.', 404)
      const t = (await templates(env)).find(t => t.name === original.template_name && t.language === original.language)
      if (!t) throw fault('This template is no longer approved or configured.')
      await requestDb(env, `/rest/v1/notice_deliveries?notice_id=eq.${body.notice_id}&status=eq.FAILED&attempts=lt.3`, 'PATCH', { status: 'QUEUED', error: null })
      ctx.waitUntil(process(env).catch(() => console.error('Notice retry processing failed')))
      return { queued: true }
    }
    throw fault('Notice action not found.', 404)
  }
  async function process(env) {
    const jobs = await requestDb(env, '/rest/v1/rpc/claim_notice_deliveries', 'POST', {})
    for (const job of jobs) {
      try {
        const subscribed = await requestDb(env, `/rest/v1/notice_subscribers?mobile_no=eq.${job.mobile_no}&subscribed=eq.true&select=mobile_no`)
        if (!subscribed.length) { await requestDb(env, `/rest/v1/notice_deliveries?id=eq.${job.id}`, 'PATCH', { status: 'SKIPPED', error: 'Resident unsubscribed' }); continue }
        const notice = (await requestDb(env, `/rest/v1/rwa_notices?id=eq.${job.notice_id}&select=*`))[0]
        const template = { name: notice.template_name, language: { code: notice.language } }
        if (notice.parameters.length) template.components = [{ type: 'body', parameters: notice.parameters.map(text => ({ type: 'text', text })) }]
        const response = await fetch(`https://graph.facebook.com/v26.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: job.mobile_no, type: 'template', template }) })
        // Network ambiguity is not automatically retried: avoid duplicate broadcasts.
        const data = await response.json()
        if (!response.ok) { await requestDb(env, `/rest/v1/notice_deliveries?id=eq.${job.id}`, 'PATCH', { status: 'FAILED', error: `WhatsApp rejected message (${data.error?.code || response.status})` }); continue }
        const messageId = data.messages?.[0]?.id
        if (!messageId) throw new Error('Missing message ID')
        await requestDb(env, `/rest/v1/notice_deliveries?id=eq.${job.id}`, 'PATCH', { status: 'SENT', provider_reference: messageId, sent_at: new Date().toISOString() })
      } catch {
        await requestDb(env, `/rest/v1/notice_deliveries?id=eq.${job.id}`, 'PATCH', { status: 'UNKNOWN', error: 'Delivery result uncertain; review before resending' })
      }
    }
  }
  async function delivery(env, status) {
    if (!status?.id || !['delivered', 'read', 'failed'].includes(status.status)) return
    const paths = status.status === 'read' ? 'status=in.(SENDING,SENT,DELIVERED)' : status.status === 'delivered' ? 'status=in.(SENDING,SENT)' : 'status=in.(SENDING,SENT)'
    await requestDb(env, `/rest/v1/notice_deliveries?provider_reference=eq.${encodeURIComponent(status.id)}&${paths}`, 'PATCH', { status: status.status.toUpperCase(), ...(status.status === 'failed' ? { error: 'WhatsApp delivery failed' } : {}) })
  }
  async function subscription(env, mobile, text) {
    const command = text.trim()
    if (/^(stop notices|unsubscribe notices)$/i.test(command)) {
      await requestDb(env, `/rest/v1/notice_subscribers?mobile_no=eq.${mobile}`, 'PATCH', { subscribed: false, unsubscribed_at: new Date().toISOString() })
      await sendText(env, mobile, 'RWA notices stopped. Your complaint service remains available.\n\nRWA सूचनाएँ बंद कर दी गई हैं। शिकायत सेवा उपलब्ध रहेगी।'); return true
    }
    if (/^notices$/i.test(command)) {
      await sendText(env, mobile, 'To agree to receive RWA Pocket-A notices on WhatsApp, send SUBSCRIBE followed by your flat number. Example: SUBSCRIBE 36D. To stop, send STOP NOTICES.\n\nRWA Pocket-A की सूचनाएँ पाने की सहमति देने के लिए SUBSCRIBE और अपना फ्लैट नंबर भेजें। उदाहरण: SUBSCRIBE 36D। बंद करने के लिए STOP NOTICES भेजें।'); return true
    }
    const match = command.match(/^subscribe\s+(.+)$/i)
    if (!match) return false
    const flat = match[1].replace(/[\s-]/g, '').toUpperCase()
    if (!/^(?:[1-9]|[1-3][0-9]|4[0-8])[ABCD]$/.test(flat)) { await sendText(env, mobile, 'Please send a valid flat number. Example: SUBSCRIBE 36D'); return true }
    const flats = await requestDb(env, `/rest/v1/flats?flat_no=eq.${flat}&select=flat_no,tower_no&limit=1`)
    if (!flats[0]) { await sendText(env, mobile, 'Flat not found. Please check your flat number.'); return true }
    await db(env, '/rest/v1/notice_subscribers?on_conflict=mobile_no', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ mobile_no: mobile, flat_no: flats[0].flat_no, tower_no: flats[0].tower_no, subscribed: true, consent_at: new Date().toISOString(), consent_text: command.slice(0, 100), unsubscribed_at: null }) })
    await sendText(env, mobile, 'You are subscribed to RWA Pocket-A notices. Send STOP NOTICES any time to unsubscribe.\n\nRWA Pocket-A की सूचनाएँ शुरू कर दी गई हैं। बंद करने के लिए STOP NOTICES भेजें।'); return true
  }
  async function verifyWebhook(request, env, rawBody) {
    if (!env.WHATSAPP_APP_SECRET) return false
    const signature = request.headers.get('x-hub-signature-256') || ''
    if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return false
    const bytes = new Uint8Array(signature.slice(7).match(/../g).map(h => parseInt(h, 16)))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WHATSAPP_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(rawBody))
  }
  return { api, process, delivery, subscription, normalizeTemplate, verifyWebhook }
}
