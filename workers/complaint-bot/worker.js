// RWA Pocket-A WhatsApp Complaint Bot
// Source-controlled Cloudflare Worker. Secrets are configured in Cloudflare, never in this file.
// Deployment is managed from GitHub through Cloudflare Builds.

const GRAPH_API_VERSION = 'v26.0'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/privacy') {
      return htmlResponse(privacyPolicyHtml())
    }
    if (request.method === 'GET' && url.pathname === '/data-deletion') {
      return htmlResponse(dataDeletionHtml())
    }

    if (request.method === 'GET' && url.pathname === '/api/web-complaints/config') {
      return handleWebComplaintConfig()
    }

    if (request.method === 'GET' && url.pathname === '/api/web-complaints/status') {
      return handleWebComplaintStatus(request, env, url)
    }

    if (request.method === 'GET' && url.pathname === '/api/residents/flat') {
      return handleSupervisorFlatLookup(request, env, url)
    }

    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')
      if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 })
      }
      return new Response('RWA Pocket-A Complaint Bot', { status: 200 })
    }

    if (
      request.method === 'OPTIONS' &&
      (
        url.pathname.startsWith('/api/web-complaints/') ||
        url.pathname.startsWith('/api/complaints/') ||
        url.pathname.startsWith('/api/residents/') ||
        url.pathname.startsWith('/api/street-lights/')
      )
    ) {
      return apiResponse({ ok: true }, 200)
    }

    if (request.method === 'POST' && url.pathname === '/api/web-complaints/register') {
      return handleWebComplaintRegistration(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/web-complaints/confirm') {
      return handleWebComplaintConfirmation(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/residents/flat') {
      return handleSupervisorFlatUpdate(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/acknowledge') {
      return handleSupervisorAction(request, env, 'ACKNOWLEDGED')
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/resolve') {
      return handleSupervisorAction(request, env, 'RESOLVED')
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/start') {
      return handleWorkerStart(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/done') {
      return handleWorkerDone(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/close') {
      return handleSupervisorClose(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/supervisor-done') {
      return handleSupervisorDone(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/street-lights/notify-whatsapp') {
      return handleStreetLightWhatsapp(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/api/street-lights/notify-sms') {
      return handleStreetLightSms(request, env)
    }

    if (request.method === 'POST') {
      // Preserve the sender across failures, including failures before a
      // conversation session can be loaded from Supabase.
      let fromForFallback = null
      let failedMessageId = null
      try {
        const body = await request.json()
        const value = body?.entry?.[0]?.changes?.[0]?.value
        const status = value?.statuses?.[0]

        if (status) {
          await handleWhatsAppStatusUpdate(env, status)
          return webhookResponse()
        }

        const message = value?.messages?.[0]
        if (!message) return webhookResponse()

        const from = normalizeMobile(message.from)
        if (!from) return webhookResponse()
        fromForFallback = from
        failedMessageId = String(message.id || '')

        // A configured persistent outage routes incoming messages directly
        // to the web app, without relying on Supabase (which could be down).
        if (await shouldUseWebComplaintFallback(env)) {
          await sendWebComplaintFallbackOnce(env, from, failedMessageId)
          return webhookResponse()
        }

        // WhatsApp can redeliver the same webhook. Claim the provider message ID
        // before any reply or database side effect to avoid duplicate responses.
        if (!await claimIncomingWhatsAppMessage(env, message.id)) {
          return webhookResponse()
        }

        if (message.type !== 'text') {
          const session = await getSession(env, from)
          await sendWhatsAppMessage(env, from,
            'Please send a text message. / कृपया टेक्स्ट संदेश भेजें।')
          return webhookResponse()
        }

        const originalText = message.text?.body?.trim() || ''
        const command = originalText.toLowerCase()

        if (isStartCommand(command)) {
          await startComplaint(env, from)
          return webhookResponse()
        }

        const reopenMatch = originalText.match(/^reopen\s+([a-z][0-9]+)$/i)
        if (reopenMatch) {
          await reopenComplaint(env, from, reopenMatch[1].toUpperCase())
          return webhookResponse()
        }

        if (['cancel', 'restart', 'रद्द'].includes(command)) {
          const session = await getSession(env, from)
          await deleteSession(env, from)
          await sendWhatsAppMessage(env, from, cancelMessage(session?.preferred_language))
          return webhookResponse()
        }

        const session = await getSession(env, from)

        // Numeric replies to "Is your problem resolved?" must be routed to
        // the completed complaint BEFORE a stale CATEGORY/CONFIRM session can
        // interpret "1" as "Plumber" and register an unrelated complaint.
        // If the resident explicitly sent Hi AFTER the work-done prompt,
        // the newer registration session takes precedence instead.
        if ((!session || ['1', '2'].includes(originalText)) &&
            await handleResidentWorkDoneReply(env, from, originalText, session)) {
          return webhookResponse()
        }

        if (!session) {
          await sendWhatsAppMessage(env, from, 'Please send *Hi* to register a complaint.\n\nशिकायत दर्ज करने के लिए *Hi* भेजें।\n\n— RWA Pocket-A')
          return webhookResponse()
        }

        await processConversation(env, from, originalText, session)
      } catch (error) {
        console.error('Webhook error:', String(error?.message || error))
        try {
          // Do not switch to fallback for a single intermittent failure.
          // A configured KV binding counts repeated processing failures.
          const degraded = await recordChatbotProcessingFailure(env)
          if (degraded && fromForFallback) {
            await sendWebComplaintFallbackOnce(env, fromForFallback, failedMessageId)
          }
        } catch (fallbackError) {
          // If Meta is blocking sends, no message can be delivered through
          // this WhatsApp account, including this backup link.
          console.error('WhatsApp fallback unavailable:', String(fallbackError?.message || fallbackError))
        }
      }
      return webhookResponse()
    }

    return new Response('RWA Pocket-A Complaint Bot', { status: 200 })
  }
}

function apiResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
  })
}


async function handleWhatsAppStatusUpdate(env, status) {
  const providerReference = String(status?.id || '').trim()
  if (!providerReference) return

  const providerStatus = String(status?.status || '').toLowerCase()

  // Diagnostic metadata only: never log recipient numbers, message contents, or full webhook payloads.
  console.log('WhatsApp delivery status:', JSON.stringify({
    status: providerStatus,
    errors: Array.isArray(status?.errors)
      ? status.errors.map((error) => ({ code: error?.code ?? null, title: String(error?.title || '').slice(0, 100) }))
      : []
  }))

  let deliveryStatus = 'PENDING'
  if (providerStatus === 'delivered' || providerStatus === 'read') {
    deliveryStatus = 'SENT'
  } else if (providerStatus === 'failed') {
    deliveryStatus = 'FAILED'
  }

  const payload = {
    delivery_status: deliveryStatus,
    provider_response: JSON.stringify(status || {})
  }

  if (deliveryStatus === 'SENT') {
    payload.sent_at = new Date().toISOString()
  }

  await supabaseRequest(
    env,
    `/rest/v1/street_light_notifications?channel=eq.WHATSAPP&provider_reference=eq.${encodeURIComponent(providerReference)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    }
  )
}

async function getAuthenticatedUser(request, env) {
  const authorization = request.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: authorization
    }
  })

  if (!response.ok) return null
  return response.json()
}



const WEB_COMPLAINT_CATEGORIES = [
  { option: '1', id: 1, en: 'Plumber', hi: 'प्लंबर', icon: '🔧' },
  { option: '2', id: 2, en: 'Electrician', hi: 'इलेक्ट्रीशियन', icon: '⚡' },
  { option: '3', id: 3, en: 'Sewerage', hi: 'सीवरेज', icon: '🚰' },
  { option: '4', id: 4, en: 'Camera Recording', hi: 'कैमरा रिकॉर्डिंग', icon: '📹' },
  { option: '5', id: 5, en: 'Horticulture', hi: 'हॉर्टिकल्चर', icon: '🌿' },
  { option: '6', id: 7, en: 'Housekeeping', hi: 'हाउसकीपिंग', icon: '🧹' },
  { option: '7', id: 8, en: 'Other', hi: 'अन्य', icon: '📋' }
]

// All public responses are informational only; no authentication or
// privileged Supabase credentials are made available to the browser.
function handleWebComplaintConfig() {
  return apiResponse({
    ok: true,
    categories: WEB_COMPLAINT_CATEGORIES,
    issue_types: {
      5: [
        { option: '1', code: 'TREE_BRANCH_CUTTING', en: 'Tree / branch cutting', hi: 'पेड़/शाखा कटाई' },
        { option: '2', code: 'GRASS_PLANT_MAINTENANCE', en: 'Grass / plants', hi: 'घास/पौधे' },
        { option: '3', code: 'WATERING_ISSUE', en: 'Watering', hi: 'पानी देना' },
        { option: '4', code: 'FALLEN_DAMAGED_TREE_BRANCH', en: 'Fallen / damaged tree', hi: 'गिरा/क्षतिग्रस्त पेड़' },
        { option: '5', code: 'OTHER', en: 'Other', hi: 'अन्य' }
      ],
      7: [
        { option: '1', code: 'GARBAGE_NOT_COLLECTED', en: 'Garbage not collected', hi: 'कचरा नहीं उठाया' },
        { option: '2', code: 'COMMON_AREA_CLEANING', en: 'Common area cleaning', hi: 'कॉमन एरिया सफाई' },
        { option: '3', code: 'SWEEPING_CLEANING_ISSUE', en: 'Sweeping issue', hi: 'झाड़ू-सफाई' },
        { option: '4', code: 'GARBAGE_DUMPING', en: 'Garbage dumping', hi: 'कचरा फेंकना' },
        { option: '5', code: 'OTHER', en: 'Other', hi: 'अन्य' }
      ]
    },
    notice: 'Developed and maintained by RWA Pocket-A. / RWA Pocket-A द्वारा विकसित एवं रखरखाव।'
  })
}

function parseWebTicket(value) {
  const raw = String(value || '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw.toLowerCase() : null
}

async function findWebComplaint(env, ticket) {
  const rows = await supabaseRequest(env,
    `/rest/v1/complaints?web_request_id=eq.${encodeURIComponent(ticket)}&source=eq.WEB&select=id,complaint_no,category_id,flat_no,status,work_start_otp,resident_confirmation,created_at&limit=1`,
    { method: 'GET' })
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

function webComplaintReceipt(complaint, ahead) {
  return {
    ok: true,
    ticket: complaint.web_request_id || null,
    complaint_no: complaint.complaint_no,
    category_id: complaint.category_id,
    flat_no: complaint.flat_no,
    status: complaint.status,
    work_start_otp: Number(complaint.category_id) === 1 ? complaint.work_start_otp : null,
    ...(Number.isInteger(ahead) ? { queue_position: ahead + 1 } : {})
  }
}

async function handleWebComplaintStatus(_request, env, url) {
  try {
    const ticket = parseWebTicket(url.searchParams.get('ticket'))
    if (!ticket) return apiResponse({ ok: false, error: 'Invalid complaint ticket.' }, 400)
    const complaint = await findWebComplaint(env, ticket)
    if (!complaint) return apiResponse({ ok: false, error: 'Complaint not found on this device.' }, 404)
    return apiResponse({
      ...webComplaintReceipt(complaint),
      ticket,
      resident_confirmation: complaint.resident_confirmation,
      created_at: complaint.created_at
    })
  } catch (error) {
    console.error('Web complaint status failed:', error)
    return apiResponse({ ok: false, error: 'Unable to load complaint status.' }, 500)
  }
}

async function validateWebTurnstile(env, token, request) {
  const secret = env.WEB_TURNSTILE_SECRET_KEY
  const allowedHostnames = String(env.WEB_TURNSTILE_HOSTNAMES || '')
    .toLowerCase().split(',').map(v => v.trim()).filter(Boolean)
  if (!secret || !allowedHostnames.length) return { ok: false, unavailable: true }
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false }
  const params = new URLSearchParams({ secret, response: token })
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) params.set('remoteip', ip)
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  if (!check.ok) return { ok: false, unavailable: true }
  const result = await check.json()
  return { ok: result.success === true &&
    allowedHostnames.includes(String(result.hostname || '').toLowerCase()) }
}

async function handleWebComplaintRegistration(request, env) {
  try {
    if (!env.WEB_TURNSTILE_SECRET_KEY || !env.WEB_TURNSTILE_HOSTNAMES) {
      return apiResponse({ ok: false, error: 'Web complaints are not yet configured.' }, 503)
    }
    const body = await request.json()
    const ticket = parseWebTicket(body?.ticket)
    const category = WEB_COMPLAINT_CATEGORIES.find(c => c.id === Number(body?.category_id))
    const flat = String(body?.flat_no || '').trim().toUpperCase()
    const mobile = normalizeResidentMobile(body?.mobile_no)
    const incidentDateTime = typeof body?.incident_datetime_text === 'string'
      ? body.incident_datetime_text.trim() : ''
    const issueType = String(body?.issue_type || '').trim().toUpperCase()
    if (!ticket || !category || !isUsableFlat(flat) || !mobile) {
      return apiResponse({ ok: false, error: 'Enter a valid category, flat and contact mobile number.' }, 400)
    }
    if (category.id === 4 && (incidentDateTime.length < 3 || incidentDateTime.length > 100)) {
      return apiResponse({ ok: false, error: 'Camera recording date and time are required.' }, 400)
    }
    if ([5, 7].includes(category.id) &&
        !getIssueType(category.id, String(body?.issue_option || ''))) {
      return apiResponse({ ok: false, error: 'Choose the issue type.' }, 400)
    }
    if (![5, 7].includes(category.id) && issueType) {
      return apiResponse({ ok: false, error: 'Unexpected issue type.' }, 400)
    }
    const selectedIssue = [5, 7].includes(category.id)
      ? getIssueType(category.id, String(body.issue_option)) : null
    if (selectedIssue && issueType && selectedIssue !== issueType) {
      return apiResponse({ ok: false, error: 'Invalid issue type.' }, 400)
    }

    // Safe retry after a network failure: a random UUID acts as an
    // unguessable receipt. A prior submission does not create a second row.
    const existing = await findWebComplaint(env, ticket)
    if (existing) return apiResponse({ ...webComplaintReceipt(existing), ticket })

    const captcha = await validateWebTurnstile(env, body?.turnstile_token, request)
    if (!captcha.ok) {
      return apiResponse({ ok: false, error: captcha.unavailable
        ? 'Verification unavailable. Please try again later.'
        : 'Browser verification failed. Please retry the challenge.' }, captcha.unavailable ? 503 : 403)
    }

    // Small additional limit by the provided contact number. Turnstile is
    // the primary protection; Cloudflare API rate-limit rules are advised.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const recent = await supabaseRequest(env,
      `/rest/v1/complaints?source=eq.WEB&mobile_no=eq.${encodeURIComponent(mobile)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=3`,
      { method: 'GET' })
    if (Array.isArray(recent) && recent.length >= 3) {
      return apiResponse({ ok: false, error: 'Too many recent complaints. Please contact the supervisor.' }, 429)
    }

    const session = {
      category_id: category.id, flat_no: flat, preferred_language: 'EN',
      description: null, is_urgent: false, urgency_code: null,
      urgency_reason: null, elderly_citizen_70_plus: false,
      issue_type: selectedIssue,
      incident_datetime_text: category.id === 4 ? incidentDateTime : null,
      location_text: null
    }
    let complaint
    try {
      complaint = await createComplaint(env, mobile, session, { source: 'WEB', webRequestId: ticket })
    } catch (error) {
      // Unique web_request_id ensures concurrent double-clicks cannot
      // register duplicate complaints.
      const concurrent = await findWebComplaint(env, ticket)
      if (!concurrent) throw error
      complaint = concurrent
    }
    const ahead = await getComplaintsAhead(env, complaint.id)
    // Do not send WhatsApp notifications: this is the independent fallback
    // for Meta outages, and the contact number is not verified.
    return apiResponse({ ...webComplaintReceipt(complaint, ahead), ticket }, 201)
  } catch (error) {
    console.error('Web complaint registration failed:', error)
    return apiResponse({ ok: false, error: 'Unable to register complaint. Please retry.' }, 500)
  }
}

async function handleWebComplaintConfirmation(request, env) {
  try {
    const body = await request.json()
    const ticket = parseWebTicket(body?.ticket)
    if (!ticket || typeof body?.resolved !== 'boolean') {
      return apiResponse({ ok: false, error: 'Valid complaint ticket and Yes/No response required.' }, 400)
    }
    const existing = await findWebComplaint(env, ticket)
    if (!existing) return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    if (existing.status !== 'WORK_DONE' && existing.status !== 'RESOLVED') {
      return apiResponse({ ok: false, error: 'This complaint is not waiting for resident confirmation.' }, 409)
    }
    const now = new Date().toISOString()
    const changes = body.resolved
      ? { status: 'CLOSED', resident_confirmation: true, resident_confirmed_at: now, closed_at: now, updated_at: now }
      : { status: 'REOPENED', resident_confirmation: false, resident_confirmed_at: now, reopened_at: now, updated_at: now }
    const updates = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${existing.id}&status=in.(WORK_DONE,RESOLVED)&source=eq.WEB`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(changes)
      })
    if (!Array.isArray(updates) || !updates.length) {
      return apiResponse({ ok: false, error: 'Complaint was already updated.' }, 409)
    }
    return apiResponse({ ok: true, status: changes.status })
  } catch (error) {
    console.error('Web complaint confirmation failed:', error)
    return apiResponse({ ok: false, error: 'Unable to save confirmation.' }, 500)
  }
}

async function requireSupervisor(request, env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user?.id) return { error: apiResponse({ ok: false, error: 'Authentication required.' }, 401) }
  const profiles = await supabaseRequest(env,
    `/rest/v1/app_users?auth_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role&limit=1`,
    { method: 'GET' })
  if (!Array.isArray(profiles) || String(profiles[0]?.role || '').toUpperCase() !== 'SUPERVISOR') {
    return { error: apiResponse({ ok: false, error: 'Supervisor access required.' }, 403) }
  }
  return { user }
}

function normalizeResidentMobile(value) {
  const digits = normalizeMobile(value)
  const full = digits.length === 10 ? `91${digits}` : digits
  return /^91[6-9][0-9]{9}$/.test(full) ? full : null
}

// A supervisor CLEAR is an existing row with null flat_no. It takes
// precedence over old complaints even if they have a valid flat.
async function resolveResidentFlat(env, mobile) {
  const mappings = await supabaseRequest(env,
    `/rest/v1/whatsapp_resident_flat_mappings?mobile_no=eq.${encodeURIComponent(mobile)}&select=flat_no,updated_at,updated_by&limit=1`,
    { method: 'GET' })
  if (Array.isArray(mappings) && mappings.length) {
    const mapped = mappings[0]
    return {
      flat_no: isUsableFlat(mapped.flat_no) ? mapped.flat_no.trim().toUpperCase() : null,
      source: isUsableFlat(mapped.flat_no)
        ? (mapped.updated_by ? 'SUPERVISOR' : 'REGISTERED')
        : 'CLEARED',
      updated_at: mapped.updated_at
    }
  }
  const history = await supabaseRequest(env,
    `/rest/v1/complaints?mobile_no=eq.${encodeURIComponent(mobile)}&source=eq.WHATSAPP&flat_no=not.is.null&select=flat_no&order=created_at.desc&limit=5`,
    { method: 'GET' })
  const latest = Array.isArray(history) ? history.find(row => isUsableFlat(row.flat_no)) : null
  return {
    flat_no: latest ? latest.flat_no.trim().toUpperCase() : null,
    source: latest ? 'HISTORY' : 'NONE',
    updated_at: null
  }
}

async function handleSupervisorFlatLookup(request, env, url) {
  try {
    const auth = await requireSupervisor(request, env)
    if (auth.error) return auth.error
    const mobile = normalizeResidentMobile(url.searchParams.get('mobile'))
    if (!mobile) return apiResponse({ ok: false, error: 'Enter a valid Indian WhatsApp mobile number.' }, 400)
    const mapping = await resolveResidentFlat(env, mobile)
    return apiResponse({ ok: true, mobile_no: mobile, ...mapping })
  } catch (error) {
    console.error('Supervisor flat lookup failed:', error)
    return apiResponse({ ok: false, error: 'Unable to load resident flat mapping.' }, 500)
  }
}

async function handleSupervisorFlatUpdate(request, env) {
  try {
    const auth = await requireSupervisor(request, env)
    if (auth.error) return auth.error
    const body = await request.json()
    const mobile = normalizeResidentMobile(body?.mobile_no)
    if (!mobile) return apiResponse({ ok: false, error: 'Enter a valid Indian WhatsApp mobile number.' }, 400)
    const action = String(body?.action || '').toUpperCase()
    if (!['UPDATE', 'CLEAR'].includes(action)) {
      return apiResponse({ ok: false, error: 'Action must be UPDATE or CLEAR.' }, 400)
    }
    const flatNo = action === 'CLEAR' ? null : String(body?.flat_no || '').trim().toUpperCase()
    if (action === 'UPDATE' && !isUsableFlat(flatNo)) {
      return apiResponse({ ok: false, error: 'Enter a valid flat number, e.g. 36-D.' }, 400)
    }

    const existing = await resolveResidentFlat(env, mobile)
    if (existing.source === 'NONE') {
      const sessions = await supabaseRequest(env,
        `/rest/v1/whatsapp_complaint_sessions?mobile_no=eq.${encodeURIComponent(mobile)}&select=mobile_no&limit=1`,
        { method: 'GET' })
      if (!Array.isArray(sessions) || !sessions.length) {
        return apiResponse({ ok: false, error: 'No prior chatbot record found for this mobile number.' }, 404)
      }
    }

    const updatedAt = new Date().toISOString()
    const updated = await supabaseRequest(env,
      '/rest/v1/whatsapp_resident_flat_mappings?on_conflict=mobile_no',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          mobile_no: mobile, flat_no: flatNo,
          updated_at: updatedAt, updated_by: auth.user.id
        })
      })
    if (!Array.isArray(updated) || !updated.length) {
      throw new Error('Flat mapping write did not return the updated record.')
    }

    // Invalidate any active chat carrying an old cached flat. No resident
    // message is sent: the next Hi starts with the new mapping.
    let session_reset = true
    try {
      await deleteSession(env, mobile)
    } catch (error) {
      console.warn('Flat mapping changed but chat session reset failed.')
      session_reset = false
    }
    return apiResponse({
      ok: true, mobile_no: mobile, flat_no: flatNo,
      source: action === 'CLEAR' ? 'CLEARED' : 'SUPERVISOR',
      updated_at: updatedAt, session_reset
    })
  } catch (error) {
    console.error('Supervisor flat update failed:', error)
    return apiResponse({ ok: false, error: 'Unable to change resident flat mapping.' }, 500)
  }
}

function calculateStreetLightIssueDays(firstReportedDate, today) {
  const start = new Date(`${firstReportedDate}T00:00:00Z`)
  const end = new Date(`${today}T00:00:00Z`)
  const diff = Math.floor((end - start) / 86400000)
  return Math.max(1, diff + 1)
}

function formatStreetLightMessageDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}-${month}-${year}` : value
}

function streetLightComplaintMessage(agency, inspection, locations, issues, settings) {
  const issueById = new Map(
    (issues || []).map((issue) => [Number(issue.id), issue])
  )

  const issueDays = locations.map((item) => {
    const issue = issueById.get(Number(item.issue_id))
    return issue
      ? calculateStreetLightIssueDays(
          issue.first_reported_date,
          inspection.inspection_date
        )
      : 1
  })

  const oldestDays = Math.max(1, ...issueDays)

  const supervisor = [
    settings?.supervisor_contact_name,
    settings?.supervisor_contact_mobile
  ].filter(Boolean).join(' - ') || '—'

  const rwa = [
    settings?.rwa_contact_name,
    settings?.rwa_contact_mobile
  ].filter(Boolean).join(' - ') || '—'

  const lightText = inspection.faulty_count === 1
    ? '1 स्ट्रीट लाइट खराब है'
    : `${inspection.faulty_count} स्ट्रीट लाइट खराब हैं`

  const pendingText = oldestDays > 1
    ? ` और यह समस्या ${oldestDays} दिन से लंबित है`
    : ''

  return `दिनांक: ${formatStreetLightMessageDate(inspection.inspection_date)}
सेवा में ${agency.agency_name},

पॉकेट-A, सेक्टर-105 में ${lightText}${pendingText}। कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
}

async function getStreetLightNotificationContext(request, env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user?.id) {
    return {
      response: apiResponse({ ok: false, error: 'Authentication required.' }, 401)
    }
  }

  const body = await request.json()
  const inspectionId = Number(body?.inspection_id)

  if (!Number.isInteger(inspectionId) || inspectionId <= 0) {
    return {
      response: apiResponse(
        { ok: false, error: 'Invalid street-light inspection id.' },
        400
      )
    }
  }

  const inspections = await supabaseRequest(
    env,
    `/rest/v1/street_light_agency_daily_inspections?id=eq.${inspectionId}&select=id,inspection_date,agency_id,faulty_count,remarks`,
    { method: 'GET' }
  )

  if (!Array.isArray(inspections) || !inspections.length) {
    return {
      response: apiResponse(
        { ok: false, error: 'Street-light inspection not found.' },
        404
      )
    }
  }

  const inspection = inspections[0]

  if (!inspection.faulty_count || inspection.faulty_count <= 0) {
    return {
      response: apiResponse(
        { ok: false, error: 'There are no faulty street lights to report.' },
        409
      )
    }
  }

  const agencies = await supabaseRequest(
    env,
    `/rest/v1/society_service_agencies?id=eq.${inspection.agency_id}&select=id,agency_name,contact_name,mobile_no,whatsapp_no,sms_no,service_type,service_label`,
    { method: 'GET' }
  )

  if (!Array.isArray(agencies) || !agencies.length) {
    return {
      response: apiResponse(
        { ok: false, error: 'Street-light agency not found.' },
        404
      )
    }
  }

  const agency = agencies[0]
  let recipient = normalizeMobile(
    agency.mobile_no || agency.whatsapp_no || agency.sms_no
  )
  if (recipient.length === 10) recipient = `91${recipient}`

  if (!recipient) {
    return {
      response: apiResponse(
        { ok: false, error: 'Please configure the agency mobile number first.' },
        400
      )
    }
  }

  const locations = await supabaseRequest(
    env,
    `/rest/v1/street_light_fault_locations?inspection_id=eq.${inspection.id}&select=id,sequence_no,location_text,status,issue_id&order=sequence_no.asc`,
    { method: 'GET' }
  )

  if (!Array.isArray(locations) || locations.length !== inspection.faulty_count) {
    return {
      response: apiResponse(
        { ok: false, error: 'Please save all fault locations before sending the complaint.' },
        409
      )
    }
  }

  const issueIds = locations
    .map((item) => Number(item.issue_id))
    .filter((id) => Number.isInteger(id) && id > 0)

  let issues = []

  if (issueIds.length > 0) {
    issues = await supabaseRequest(
      env,
      `/rest/v1/street_light_issues?id=in.(${issueIds.join(',')})&select=id,first_reported_date,last_seen_date,status`,
      { method: 'GET' }
    )
  }

  const categoryRows = await supabaseRequest(
    env,
    '/rest/v1/society_service_categories?service_type=eq.STREET_LIGHT&select=rwa_name,rwa_mobile',
    { method: 'GET' }
  )

  const globalContactRows = await supabaseRequest(
    env,
    '/rest/v1/society_inspection_settings?id=eq.1&select=supervisor_contact_name,supervisor_contact_mobile',
    { method: 'GET' }
  )

  const categoryContact =
    Array.isArray(categoryRows) && categoryRows.length
      ? categoryRows[0]
      : {}

  const globalContact =
    Array.isArray(globalContactRows) && globalContactRows.length
      ? globalContactRows[0]
      : {}

  const settings = {
    supervisor_contact_name: globalContact.supervisor_contact_name,
    supervisor_contact_mobile: globalContact.supervisor_contact_mobile,
    rwa_contact_name: categoryContact.rwa_name,
    rwa_contact_mobile: categoryContact.rwa_mobile
  }

  const message = streetLightComplaintMessage(
    agency,
    inspection,
    locations,
    issues,
    settings
  )

  return {
    user,
    inspection,
    agency,
    recipient,
    locations,
    issues,
    settings,
    message
  }
}

async function logStreetLightNotification(
  env,
  {
    inspection,
    agency,
    channel,
    recipient,
    message,
    status,
    providerReference = null,
    providerResponse = null,
    userId,
    sentAt = null
  }
) {
  await supabaseRequest(env, '/rest/v1/street_light_notifications', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      inspection_id: inspection.id,
      agency_id: inspection.agency_id,
      channel,
      recipient_name: agency.contact_name || null,
      recipient_mobile: recipient,
      message_text: message,
      delivery_status: status,
      provider_reference: providerReference,
      provider_response: providerResponse,
      sent_by: userId,
      sent_at: sentAt
    })
  })
}

async function handleStreetLightWhatsapp(request, env) {
  try {
    const context = await getStreetLightNotificationContext(request, env)
    if (context.response) return context.response

    const {
      user,
      inspection,
      agency,
      recipient,
      locations,
      issues,
      settings,
      message
    } = context

    const now = new Date().toISOString()

    try {
      const oldestDays = Math.max(
        1,
        ...locations.map((item) => {
          const issue = (issues || []).find(
            (candidate) => Number(candidate.id) === Number(item.issue_id)
          )
          return issue
            ? calculateStreetLightIssueDays(
                issue.first_reported_date,
                inspection.inspection_date
              )
            : 1
        })
      )

      const providerResult = await sendWhatsAppMessage(
        env,
        recipient,
        message
      )

      const providerReference = providerResult?.messages?.[0]?.id || null

      await logStreetLightNotification(env, {
        inspection,
        agency,
        channel: 'WHATSAPP',
        recipient,
        message,
        status: 'PENDING',
        providerReference,
        providerResponse: JSON.stringify(providerResult || {}),
        userId: user.id,
        sentAt: now
      })

      return apiResponse({
        ok: true,
        whatsapp_sent: true,
        message,
        recipient_mobile: recipient
      }, 200)
    } catch (sendError) {
      console.error('Street-light WhatsApp notification failed:', sendError)

      await logStreetLightNotification(env, {
        inspection,
        agency,
        channel: 'WHATSAPP',
        recipient,
        message,
        status: 'FAILED',
        providerResponse: String(sendError?.message || sendError),
        userId: user.id
      })

      return apiResponse({
        ok: false,
        whatsapp_sent: false,
        error: String(
          sendError?.message ||
            'Unable to send WhatsApp complaint in background.'
        )
      }, 502)
    }
  } catch (error) {
    console.error('Street-light WhatsApp action error:', error)
    return apiResponse(
      { ok: false, error: 'Unable to process street-light complaint.' },
      500
    )
  }
}

async function handleStreetLightSms(request, env) {
  try {
    const context = await getStreetLightNotificationContext(request, env)
    if (context.response) return context.response

    const {
      user,
      inspection,
      agency,
      recipient,
      message
    } = context

    const now = new Date().toISOString()

    try {
      const providerResult = await sendSmsMessage(env, recipient, message)
      const providerReference =
        providerResult?.id ||
        providerResult?.message_id ||
        providerResult?.reference ||
        null

      await logStreetLightNotification(env, {
        inspection,
        agency,
        channel: 'SMS',
        recipient,
        message,
        status: 'SENT',
        providerReference,
        providerResponse: JSON.stringify(providerResult || {}),
        userId: user.id,
        sentAt: now
      })

      return apiResponse({
        ok: true,
        sms_sent: true,
        message,
        recipient_mobile: recipient
      }, 200)
    } catch (sendError) {
      console.error('Street-light SMS notification failed:', sendError)

      await logStreetLightNotification(env, {
        inspection,
        agency,
        channel: 'SMS',
        recipient,
        message,
        status: 'FAILED',
        providerResponse: String(sendError?.message || sendError),
        userId: user.id
      })

      return apiResponse({
        ok: false,
        sms_sent: false,
        error: String(
          sendError?.message ||
            'Unable to send SMS complaint in background.'
        )
      }, 503)
    }
  } catch (error) {
    console.error('Street-light SMS action error:', error)
    return apiResponse(
      { ok: false, error: 'Unable to process street-light SMS complaint.' },
      500
    )
  }
}

async function handleWorkerStart(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env)
    if (!user?.id) return apiResponse({ ok: false, error: 'Authentication required.' }, 401)

    const body = await request.json()
    const complaintId = Number(body?.complaint_id)
    const otp = String(body?.otp || '').trim()
    if (!Number.isInteger(complaintId) || complaintId <= 0 || !/^\d{4}$/.test(otp)) {
      return apiResponse({ ok: false, error: 'Enter the 4-digit OTP provided by the resident.' }, 400)
    }

    const rows = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,status,category_id,work_start_otp,otp_attempts`,
      { method: 'GET' })
    if (!Array.isArray(rows) || !rows.length) return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    const complaint = rows[0]
    if (!['OPEN', 'REOPENED', 'ACKNOWLEDGED', 'ASSIGNED'].includes(String(complaint.status || '').toUpperCase())) {
      return apiResponse({ ok: false, error: 'This complaint cannot be started in its current status.' }, 409)
    }
    if (Number(complaint.category_id) !== 1) {
      return apiResponse({ ok: false, error: 'This worker screen can start Plumbing complaints only.' }, 403)
    }
    const attempts = Number(complaint.otp_attempts || 0)
    if (attempts >= 5) return apiResponse({ ok: false, error: 'OTP locked after too many incorrect attempts. Contact the supervisor.' }, 423)
    if (otp !== String(complaint.work_start_otp || '')) {
      await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaint.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ otp_attempts: attempts + 1, updated_at: new Date().toISOString() })
      })
      return apiResponse({ ok: false, error: 'Incorrect OTP.' }, 400)
    }

    const now = new Date().toISOString()
    await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaint.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'IN_PROGRESS', otp_verified_at: now, work_started_at: now, work_started_by: user.id, updated_at: now })
    })
    return apiResponse({ ok: true, status: 'IN_PROGRESS', work_started_at: now }, 200)
  } catch (error) {
    console.error('Worker start error:', error)
    return apiResponse({ ok: false, error: 'Unable to start complaint.' }, 500)
  }
}

async function handleSupervisorClose(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env)
    if (!user?.id) return apiResponse({ ok: false, error: 'Authentication required.' }, 401)

    const profiles = await supabaseRequest(env,
      `/rest/v1/app_users?auth_user_id=eq.${user.id}&active=eq.true&select=role`,
      { method: 'GET' })
    if (!Array.isArray(profiles) || String(profiles[0]?.role || '').toUpperCase() !== 'SUPERVISOR') {
      return apiResponse({ ok: false, error: 'Supervisor access required.' }, 403)
    }

    const body = await request.json()
    const complaintId = Number(body?.complaint_id)
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      return apiResponse({ ok: false, error: 'Invalid complaint id.' }, 400)
    }
    const rows = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,status`, { method: 'GET' })
    if (!Array.isArray(rows) || !rows.length) return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    if (rows[0].status === 'CLOSED') return apiResponse({ ok: true, status: 'CLOSED' }, 200)

    const now = new Date().toISOString()
    // Supervisor closure does not imply resident confirmation or completed work.
    await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaintId}&status=neq.CLOSED`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'CLOSED', closed_at: now, updated_at: now })
    })
    return apiResponse({ ok: true, status: 'CLOSED' }, 200)
  } catch (error) {
    console.error('Supervisor close error:', error)
    return apiResponse({ ok: false, error: 'Unable to close complaint.' }, 500)
  }
}

async function handleSupervisorDone(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env)
    if (!user?.id) return apiResponse({ ok: false, error: 'Authentication required.' }, 401)

    const profiles = await supabaseRequest(env,
      `/rest/v1/app_users?auth_user_id=eq.${user.id}&active=eq.true&select=role`,
      { method: 'GET' })
    if (!Array.isArray(profiles) || String(profiles[0]?.role || '').toUpperCase() !== 'SUPERVISOR') {
      return apiResponse({ ok: false, error: 'Supervisor access required.' }, 403)
    }

    const body = await request.json()
    const complaintId = Number(body?.complaint_id)
    const rows = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,complaint_no,mobile_no,status,category_id,preferred_language,source`,
      { method: 'GET' })
    if (!Array.isArray(rows) || !rows.length) return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    const complaint = rows[0]
    if (Number(complaint.category_id) === 1) return apiResponse({ ok: false, error: 'Plumber complaints are completed by the plumber workflow.' }, 409)
    if (!['OPEN', 'REOPENED', 'ACKNOWLEDGED', 'ASSIGNED'].includes(String(complaint.status || '').toUpperCase())) {
      return apiResponse({ ok: false, error: 'Complaint cannot be marked done in its current status.' }, 409)
    }

    const now = new Date().toISOString()
    await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaint.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'WORK_DONE', work_done_at: now, updated_at: now })
    })

    // A web-only complaint must not require Meta WhatsApp availability.
    // Its resident uses the same public web chat ticket to confirm work.
    if (complaint.source === 'WEB') {
      return apiResponse({ ok: true, status: 'WORK_DONE', confirmation_channel: 'WEB', whatsapp_sent: false }, 200)
    }
    const message = workDoneConfirmationMessage(complaint)
    await sendWhatsAppMessage(env, normalizeMobile(complaint.mobile_no), message)
    return apiResponse({ ok: true, status: 'WORK_DONE', whatsapp_sent: true }, 200)
  } catch (error) {
    console.error('Supervisor done error:', error)
    return apiResponse({ ok: false, error: 'Unable to mark complaint work done.' }, 500)
  }
}

async function handleWorkerDone(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env)
    if (!user?.id) return apiResponse({ ok: false, error: 'Authentication required.' }, 401)
    const body = await request.json()
    const complaintId = Number(body?.complaint_id)
    const rows = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,complaint_no,mobile_no,status,category_id,preferred_language,source`,
      { method: 'GET' })
    if (!Array.isArray(rows) || !rows.length) return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    const complaint = rows[0]
    if (Number(complaint.category_id) !== 1) return apiResponse({ ok: false, error: 'Plumbing complaints only.' }, 403)
    if (String(complaint.status || '').toUpperCase() !== 'IN_PROGRESS') return apiResponse({ ok: false, error: 'Complaint is not in progress.' }, 409)

    const now = new Date().toISOString()
    await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaint.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'WORK_DONE', work_done_at: now, updated_at: now })
    })
    // A web-only complaint must not require Meta WhatsApp availability.
    // Its resident uses the same public web chat ticket to confirm work.
    if (complaint.source === 'WEB') {
      return apiResponse({ ok: true, status: 'WORK_DONE', confirmation_channel: 'WEB', whatsapp_sent: false }, 200)
    }
    const message = workDoneConfirmationMessage(complaint)
    await sendWhatsAppMessage(env, normalizeMobile(complaint.mobile_no), message)
    return apiResponse({ ok: true, status: 'WORK_DONE', whatsapp_sent: true }, 200)
  } catch (error) {
    console.error('Worker done error:', error)
    return apiResponse({ ok: false, error: 'Unable to complete complaint.' }, 500)
  }
}

async function handleSupervisorAction(request, env, targetStatus) {
  try {
    const body = await request.json()
    const complaintId = Number(body?.complaint_id)
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      return apiResponse({ ok: false, error: 'Invalid complaint id.' }, 400)
    }

    const rows = await supabaseRequest(
      env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,complaint_no,mobile_no,status,preferred_language,category_id,flat_no,created_at`,
      { method: 'GET' }
    )
    if (!Array.isArray(rows) || !rows.length) {
      return apiResponse({ ok: false, error: 'Complaint not found.' }, 404)
    }

    const complaint = rows[0]
    const current = String(complaint.status || '').toUpperCase()
    const allowed = targetStatus === 'ACKNOWLEDGED'
      ? ['OPEN', 'REOPENED'].includes(current)
      : current === 'ACKNOWLEDGED'

    if (!allowed) {
      return apiResponse({ ok: false, error: `Complaint is currently ${current || 'UNKNOWN'}.` }, 409)
    }

    const now = new Date().toISOString()
    const update = targetStatus === 'RESOLVED'
      ? { status: 'RESOLVED', work_done_at: now, updated_at: now }
      : { status: 'ACKNOWLEDGED', updated_at: now }

    await supabaseRequest(env, `/rest/v1/complaints?id=eq.${complaint.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(update)
    })

    complaint.resident_name = await getResidentNameByFlat(env, complaint.flat_no)

    const message = targetStatus === 'RESOLVED'
      ? supervisorResolvedMessage(complaint, now)
      : supervisorAcknowledgementMessage(complaint)

    try {
      await sendWhatsAppMessage(env, normalizeMobile(complaint.mobile_no), message)
    } catch (sendError) {
      console.error('Supervisor WhatsApp notification failed:', sendError)
      return apiResponse({ ok: true, status: targetStatus, whatsapp_sent: false, warning: 'Status updated but WhatsApp notification failed.' }, 200)
    }

    return apiResponse({ ok: true, status: targetStatus, whatsapp_sent: true }, 200)
  } catch (error) {
    console.error('Supervisor action error:', error)
    return apiResponse({ ok: false, error: 'Unable to process complaint action.' }, 500)
  }
}

async function getResidentNameByFlat(env, flatNo) {
  const flat = String(flatNo || '').trim()
  if (!flat) return ''

  try {
    const rows = await supabaseRequest(
      env,
      `/rest/v1/residents?flat_no=eq.${encodeURIComponent(flat)}&active=eq.true&order=id.asc&limit=1&select=name`,
      { method: 'GET' }
    )
    return Array.isArray(rows) && rows.length ? String(rows[0].name || '').trim() : ''
  } catch (error) {
    console.error('Resident master lookup failed:', error)
    return ''
  }
}

function hindiWorkerName(categoryId) {
  if (categoryId === 1) return 'प्लंबर'
  if (categoryId === 2 || categoryId === 6) return 'इलेक्ट्रीशियन'
  if (categoryId === 3) return 'सीवरेज कर्मचारी'
  if (categoryId === 4) return 'सुरक्षा टीम'
  if (categoryId === 5) return 'माली'
  if (categoryId === 7) return 'हाउसकीपिंग कर्मचारी'
  return 'संबंधित कर्मचारी'
}

function residentGreeting(complaint, lang) {
  const name = String(complaint.resident_name || '').trim()
  if (name) return lang === 'HI' ? `*आदरणीय ${name},*` : `*Dear ${name},*`
  return lang === 'HI' ? '*आदरणीय महोदय/महोदया,*' : '*Dear Sir/Madam,*'
}

function supervisorAcknowledgementMessage(complaint) {
  return `*Complaint acknowledged / शिकायत प्राप्त हुई* ✅\n\n*Complaint No / शिकायत संख्या:* ${complaint.complaint_no}\nOur team will attend shortly. / हमारी टीम जल्द कार्यवाही करेगी।\n\n— RWA Pocket-A`
}

function supervisorResolvedMessage(complaint) {
  return `*Complaint resolved / शिकायत का समाधान हुआ* ✅\n\n*Complaint No / शिकायत संख्या:* ${complaint.complaint_no}\nIf the issue remains, reply / समस्या बनी रहे तो भेजें:\n*REOPEN ${complaint.complaint_no}*\n\n— RWA Pocket-A`
}

async function reopenComplaint(env, mobile, complaintNo) {
  const rows = await supabaseRequest(env,
    `/rest/v1/complaints?complaint_no=eq.${encodeURIComponent(complaintNo)}&mobile_no=eq.${encodeURIComponent(mobile)}&status=in.(RESOLVED,CLOSED)&order=created_at.desc&limit=1&select=id,complaint_no`,
    { method: 'GET' })

  if (!Array.isArray(rows) || !rows.length) {
    await sendWhatsAppMessage(env, mobile,
      `Complaint *${complaintNo}* was not found for this number. / इस नंबर पर शिकायत *${complaintNo}* नहीं मिली।\nPlease check the number or send *Hi*. / नंबर जाँचें या *Hi* भेजें।\n\n— RWA Pocket-A`)
    return
  }

  const now = new Date().toISOString()
  await supabaseRequest(env, `/rest/v1/complaints?id=eq.${rows[0].id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'REOPENED', reopened_at: now, updated_at: now })
  })
  await sendWhatsAppMessage(env, mobile,
    `Complaint *${complaintNo}* reopened. / शिकायत *${complaintNo}* दोबारा खोली गई है। 🔄\n\n— RWA Pocket-A`)
}

// Replies "1" (Yes) and "2" (No) share their numbers with complaint
// categories. A work-done prompt beats an *older* registration session,
// but a newer explicit Hi creates a fresh session and remains selectable.
function isNewerRegistrationSession(session, complaint) {
  if (!session) return false
  const sessionAt = Date.parse(session.updated_at || '')
  const promptedAt = Date.parse(complaint.confirmation_sent_at || complaint.work_done_at || '')
  return Number.isFinite(sessionAt) && Number.isFinite(promptedAt) && sessionAt > promptedAt
}

async function handleResidentWorkDoneReply(env, mobile, originalText, session = null) {
  const reply = String(originalText || '').trim()
  if (session && !['1', '2'].includes(reply)) return false

  // WEB complaints have an unverified contact number and must ONLY be
  // confirmed by their browser-held ticket, never via WhatsApp.
  const rows = await supabaseRequest(env,
    `/rest/v1/complaints?mobile_no=eq.${encodeURIComponent(mobile)}&source=eq.WHATSAPP&status=eq.WORK_DONE&order=updated_at.desc&limit=1&select=id,complaint_no,status,work_done_at,confirmation_sent_at`,
    { method: 'GET' })
  if (!Array.isArray(rows) || !rows.length) return false

  const complaint = rows[0]
  if (isNewerRegistrationSession(session, complaint)) {
    return false
  }

  if (!['1', '2'].includes(reply)) {
    await sendWhatsAppMessage(env, mobile, workDoneConfirmationMessage(complaint))
    return true
  }

  const now = new Date().toISOString()
  const updates = reply === '1'
    ? { status: 'CLOSED', resident_confirmation: true,
        resident_confirmed_at: now, closed_at: now, updated_at: now }
    : { status: 'REOPENED', resident_confirmation: false,
        resident_confirmed_at: now, reopened_at: now, updated_at: now }

  // Conditional update prevents two numeric replies from changing the
  // outcome once the complaint leaves WORK_DONE. Always consume the reply
  // even when another request processed it concurrently.
  const changed = await supabaseRequest(env,
    `/rest/v1/complaints?id=eq.${complaint.id}&source=eq.WHATSAPP&status=eq.WORK_DONE`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates)
    })

  if (session) {
    // A stale in-flight category session must never catch a second "1"
    // after the completed complaint has been acknowledged.
    await deleteSession(env, mobile)
  }

  if (Array.isArray(changed) && !changed.length) return true

  if (reply === '2') {
    await sendWhatsAppMessage(env, mobile,
      `Complaint *${complaint.complaint_no}* reopened. / शिकायत *${complaint.complaint_no}* दोबारा खोली गई है। 🔄\n\n— RWA Pocket-A`)
  }
  // Yes closes silently: no rating, thank-you or extra WhatsApp send.
  return true
}

function workDoneConfirmationMessage(complaint) {
  return `*Work completed / कार्य पूरा हुआ* ✅\n*Complaint / शिकायत:* ${complaint.complaint_no}\n\nIs your problem resolved? / क्या समस्या हल हो गई है?\n*1.* Yes / हाँ\n*2.* No / नहीं\n\n— RWA Pocket-A`
}

async function startComplaint(env, mobile) {
  const mapping = await resolveResidentFlat(env, mobile)
  await deleteSession(env, mobile)
  await createSession(env, mobile, mapping.flat_no)
  await sendWhatsAppMessage(env, mobile, categoryMenu(mapping.flat_no, env))
}

async function rememberRegisteredFlat(env, mobile, flatNo) {
  // After a cleared mapping, the next successfully registered complaint
  // records the new flat so subsequent requests can reuse it.
  await supabaseRequest(env,
    '/rest/v1/whatsapp_resident_flat_mappings?on_conflict=mobile_no', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        mobile_no: mobile, flat_no: flatNo, updated_at: new Date().toISOString(),
        updated_by: null // A resident-entered flat supersedes a manual override.
      })
    })
}

function isUsableFlat(flatNo) {
  const flat = String(flatNo || '').trim().toUpperCase()
  return flat.length >= 2 && flat.length <= 25
    && /^[A-Z0-9][A-Z0-9 \/-]*$/.test(flat)
    && !['COMMON AREA', 'UNKNOWN', 'N/A', 'NA', 'NONE', 'NOT GIVEN'].includes(flat)
}

function nextStepForCategory(categoryId) {
  if (categoryId === 4) return 'INCIDENT_DATETIME'
  if ([5, 6, 7].includes(categoryId)) return 'ISSUE_TYPE'
  return 'REGISTER'
}

async function registerComplaintImmediately(env, mobile) {
  const current = await getSession(env, mobile)
  if (!current || !getCategoryById(Number(current.category_id)) || !isUsableFlat(current.flat_no)) {
    throw new Error('Complaint registration is missing a valid category or flat.')
  }
  const complaint = await createComplaint(env, mobile, current)
  try {
    await rememberRegisteredFlat(env, mobile, current.flat_no)
  } catch (error) {
    // The complaint was successfully created; do not hold up registration
    // merely because caching the flat failed.
    console.error('Unable to remember registered flat:', error)
  }
  const complaintsAhead = await getComplaintsAhead(env, complaint.id)
  await deleteSession(env, mobile)
  await sendWhatsAppMessage(env, mobile, complaintCreatedMessage(complaint, current, complaintsAhead) + webComplaintFallbackFooter(env))

  if (Number(current.category_id) === 1) {
    try {
      await notifyPlumberOfNewComplaint(env, complaint, current)
    } catch (error) {
      // Plumber notification failure must never undo an already-created complaint.
      console.error('Plumber WhatsApp notification failed:', error)
    }
  }
}

async function askComplaintStep(env, mobile, step, categoryId) {
  if (step === 'FLAT_NO') {
    await sendWhatsAppMessage(env, mobile, flatNumberQuestion(getCategoryById(categoryId)))
  } else if (step === 'INCIDENT_DATETIME') {
    await sendWhatsAppMessage(env, mobile, incidentDateTimeQuestion())
  } else if (step === 'ISSUE_TYPE') {
    await sendWhatsAppMessage(env, mobile, issueTypeMenu(categoryId))
  } else if (step === 'REGISTER') {
    await registerComplaintImmediately(env, mobile)
  } else if (step === 'CONFIRM') {
    // Only for older sessions that already received a review prompt.
    await sendConfirmation(env, mobile, await getSession(env, mobile))
  }
}

async function processConversation(env, mobile, originalText, session) {
  const text = originalText.trim()
  const step = session.step
  const categoryId = Number(session.category_id)

  if (categoryId === 6 && !STREET_LIGHT_COMPLAINTS_ENABLED && !['LANGUAGE', 'CATEGORY'].includes(step)) {
    await updateSession(env, mobile, { category_id: null, step: 'CATEGORY' })
    await sendWhatsAppMessage(env, mobile,
      'Street Light complaints are currently unavailable. / स्ट्रीट लाइट शिकायत सेवा अभी उपलब्ध नहीं है।\n\n' +
      categoryMenu(session.flat_no, env))
    return
  }

  // Let an in-flight old session move safely to the new bilingual workflow.
  if (step === 'LANGUAGE') {
    await updateSession(env, mobile, { preferred_language: 'EN', step: 'CATEGORY' })
    await sendWhatsAppMessage(env, mobile, categoryMenu(session.flat_no, env))
    return
  }

  if (step === 'CATEGORY') {
    const category = getCategory(text)
    if (!category) {
      await sendWhatsAppMessage(env, mobile, invalidChoice() + '\n\n' + categoryMenu(session.flat_no, env))
      return
    }

    const rememberedFlat = isUsableFlat(session.flat_no) ? String(session.flat_no).trim().toUpperCase() : null
    const next = rememberedFlat ? nextStepForCategory(category.id) : 'FLAT_NO'
    await updateSession(env, mobile, {
      category_id: category.id,
      flat_no: rememberedFlat,
      location_text: null,
      issue_type: null,
      incident_datetime_text: null,
      description: null,
      wants_description: null,
      is_urgent: false,
      urgency_code: null,
      urgency_reason: null,
      elderly_citizen_70_plus: false,
      step: next
    })
    await askComplaintStep(env, mobile, next, category.id)
    return
  }

  if (step === 'LOCATION') {
    await updateSession(env, mobile, { location_text: null, step: 'FLAT_NO' })
    await askComplaintStep(env, mobile, 'FLAT_NO', categoryId)
    return
  }

  if (step === 'FLAT_NO') {
    const flatNo = text.toUpperCase().slice(0, 25)
    if (!isUsableFlat(flatNo)) {
      await sendWhatsAppMessage(env, mobile,
        'Please enter a valid flat number, e.g. *36-D*. / कृपया सही फ्लैट नंबर भेजें, जैसे *36-D*।')
      return
    }
    const next = nextStepForCategory(categoryId)
    await updateSession(env, mobile, { flat_no: flatNo, location_text: null, step: next })
    await askComplaintStep(env, mobile, next, categoryId)
    return
  }

  if (step === 'INCIDENT_DATETIME') {
    if (text.length < 3) {
      await sendWhatsAppMessage(env, mobile, incidentDateTimeQuestion())
      return
    }
    await updateSession(env, mobile, { incident_datetime_text: text.slice(0, 100), step: 'REGISTER' })
    await askComplaintStep(env, mobile, 'REGISTER', categoryId)
    return
  }

  if (step === 'ISSUE_TYPE') {
    const issue = getIssueType(categoryId, text)
    if (!issue) {
      await sendWhatsAppMessage(env, mobile, issueTypeMenu(categoryId))
      return
    }
    await updateSession(env, mobile, { issue_type: issue, step: 'REGISTER' })
    await askComplaintStep(env, mobile, 'REGISTER', categoryId)
    return
  }

  // Legacy sessions created before removal of the urgency prompt proceed
  // without a further review/confirmation.
  if (step === 'URGENT') {
    await updateSession(env, mobile, {
      is_urgent: false, urgency_code: null, urgency_reason: null, step: 'REGISTER'
    })
    await askComplaintStep(env, mobile, 'REGISTER', categoryId)
    return
  }

  // A partially completed session can resume safely after a transient failure.
  if (step === 'REGISTER') {
    await registerComplaintImmediately(env, mobile)
    return
  }

  if (step === 'FLAT_CORRECTION') {
    // An in-progress session from a previous Worker version must not
    // retain resident-controlled flat correction.
    await deleteSession(env, mobile)
    await sendWhatsAppMessage(env, mobile,
      'Please contact the RWA supervisor to correct your flat, then send *Hi*. / फ्लैट बदलने के लिए सुपरवाइज़र से संपर्क करें, फिर *Hi* भेजें।')
    return
  }

  if (step === 'CONFIRM') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, confirmChoiceMessage())
      return
    }
    if (text === '2') {
      await deleteSession(env, mobile)
      await sendWhatsAppMessage(env, mobile, cancelMessage())
      return
    }

    // Compatibility only: confirm actions from sessions started on an older
    // Worker. New sessions do not enter the CONFIRM step.
    await registerComplaintImmediately(env, mobile)
    return
  }

  await deleteSession(env, mobile)
  await sendWhatsAppMessage(env, mobile,
    'Please send *Hi* to restart. / दोबारा शुरू करने के लिए *Hi* भेजें।\n\n— RWA Pocket-A')
}

// The category numbers remain stable when Street Light is disabled.
 // Set to true only to restore Street Light complaint registration.
const STREET_LIGHT_COMPLAINTS_ENABLED = false

function categoryMenu(flatNo = null, env = {}) {
  const menu = fullCategoryMenu()
  const visibleMenu = STREET_LIGHT_COMPLAINTS_ENABLED ? menu
    : menu.split('\n').filter(line => !line.startsWith('*6.*'))
      .map(line => line.replace(/^\*7\.\*/, '*6.*').replace(/^\*8\.\*/, '*7.*')).join('\n')
  const saved = isUsableFlat(flatNo)
    ? `\n\nRegistered Flat / दर्ज फ्लैट: *${flatNo}*`
    : ''
  return visibleMenu + saved +
    '\n\nDeveloped and maintained by RWA Pocket-A. / RWA Pocket-A द्वारा विकसित एवं रखरखाव।' +
    webComplaintFallbackFooter(env)
}

function fullCategoryMenu() {
  return '*RWA Pocket-A | Complaint / शिकायत*\n' +
    '*Select category / शिकायत का प्रकार चुनें:*\n\n' +
    '*1.* 🔧 Plumber / प्लंबर\n' +
    '*2.* ⚡ Electrician / इलेक्ट्रीशियन\n' +
    '*3.* 🚰 Sewerage / सीवरेज\n' +
    '*4.* 📹 Camera Recording / कैमरा रिकॉर्डिंग\n' +
    '*5.* 🌿 Horticulture / हॉर्टिकल्चर\n' +
    '*6.* 💡 Street Light / स्ट्रीट लाइट\n' +
    '*7.* 🧹 Housekeeping / हाउसकीपिंग-कचरा\n' +
    '*8.* 📋 Other / अन्य\n\n' +
    'Reply with option number / विकल्प संख्या भेजें।'
}

const CATEGORIES = {
  1: { id: 1, label: 'Plumber', hi: 'प्लंबर' },
  2: { id: 2, label: 'Electrician', hi: 'इलेक्ट्रीशियन' },
  3: { id: 3, label: 'Sewerage Issue', hi: 'सीवरेज समस्या' },
  4: { id: 4, label: 'Camera Recording', hi: 'कैमरा रिकॉर्डिंग' },
  5: { id: 5, label: 'Horticulture', hi: 'हॉर्टिकल्चर' },
  6: { id: 6, label: 'Street Light', hi: 'स्ट्रीट लाइट' },
  7: { id: 7, label: 'Housekeeping/Garbage', hi: 'हाउसकीपिंग/कचरा' },
  8: { id: 8, label: 'Other', hi: 'अन्य' }
}
function getCategory(text) {
  const option = Number(text)
  const availableIds = STREET_LIGHT_COMPLAINTS_ENABLED
    ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 7, 8]
  const categoryId = Number.isInteger(option) ? availableIds[option - 1] : null
  return CATEGORIES[categoryId] || null
}
function getCategoryById(id) { return CATEGORIES[id] || null }

function flatNumberQuestion(category) {
  return `Selected / चुनी गई श्रेणी: *${category?.label || 'Complaint'} / ${category?.hi || 'शिकायत'}*\n\nPlease enter your flat number / अपना फ्लैट नंबर भेजें।\nExample / उदाहरण: *36-D*`
}

function incidentDateTimeQuestion() {
  return 'Please provide the approximate date and time for camera recording.\nकैमरा रिकॉर्डिंग के लिए अनुमानित दिनांक और समय भेजें।\nExample / उदाहरण: *20 Sep, 8:30 PM*'
}

function issueTypeMenu(categoryId) {
  if (categoryId === 7) {
    return '*Housekeeping / हाउसकीपिंग:*\n\n*1.* Garbage not collected / कचरा नहीं उठाया\n*2.* Common area cleaning / कॉमन एरिया सफाई\n*3.* Sweeping issue / झाड़ू-सफाई\n*4.* Garbage dumping / कचरा फेंकना\n*5.* Other / अन्य'
  }
  if (categoryId === 5) {
    return '*Horticulture / हॉर्टिकल्चर:*\n\n*1.* Tree/branch cutting / पेड़-शाखा कटाई\n*2.* Grass/plants / घास-पौधे\n*3.* Watering / पानी देना\n*4.* Fallen/damaged tree / गिरा-क्षतिग्रस्त पेड़\n*5.* Other / अन्य'
  }
  return '*Street Light / स्ट्रीट लाइट:*\n\n*1.* Not working / बंद\n*2.* Flickering / झपकना\n*3.* On in daytime / दिन में चालू\n*4.* Pole or wiring / पोल-वायरिंग\n*5.* Other / अन्य'
}

function getIssueType(categoryId, text) {
  const values = categoryId === 5
    ? { '1': 'TREE_BRANCH_CUTTING', '2': 'GRASS_PLANT_MAINTENANCE', '3': 'WATERING_ISSUE', '4': 'FALLEN_DAMAGED_TREE_BRANCH', '5': 'OTHER' }
    : categoryId === 7
      ? { '1': 'GARBAGE_NOT_COLLECTED', '2': 'COMMON_AREA_CLEANING', '3': 'SWEEPING_CLEANING_ISSUE', '4': 'GARBAGE_DUMPING', '5': 'OTHER' }
      : { '1': 'LIGHT_NOT_WORKING', '2': 'LIGHT_FLICKERING', '3': 'LIGHT_ON_DAYTIME', '4': 'POLE_WIRING_ISSUE', '5': 'OTHER' }
  return values[text] || null
}

function getIssueTypeLabel(categoryId, issueType, lang) {
  if (lang !== 'HI') return String(issueType || '').replaceAll('_', ' ')
  const labels = {
    TREE_BRANCH_CUTTING: 'पेड़/शाखा की कटाई',
    GRASS_PLANT_MAINTENANCE: 'घास/पौधों का रखरखाव',
    WATERING_ISSUE: 'पानी देने की समस्या',
    FALLEN_DAMAGED_TREE_BRANCH: 'गिरा/क्षतिग्रस्त पेड़ या शाखा',
    GARBAGE_NOT_COLLECTED: 'कचरा नहीं उठाया गया',
    COMMON_AREA_CLEANING: 'कॉमन एरिया की सफाई',
    SWEEPING_CLEANING_ISSUE: 'झाड़ू/सफाई की समस्या',
    GARBAGE_DUMPING: 'कचरा फेंकने की समस्या',
    LIGHT_NOT_WORKING: 'लाइट काम नहीं कर रही',
    LIGHT_FLICKERING: 'लाइट झपक रही है',
    LIGHT_ON_DAYTIME: 'दिन में लाइट चालू है',
    POLE_WIRING_ISSUE: 'पोल/वायरिंग की समस्या',
    OTHER: 'अन्य'
  }
  return labels[issueType] || String(issueType || '').replaceAll('_', ' ')
}

async function sendConfirmation(env, mobile, session) {
  const c = getCategoryById(Number(session.category_id))
  const rows = ['*Review complaint / शिकायत की पुष्टि करें:*', '']
  rows.push(`*Category / श्रेणी:* ${c?.label || 'Other'} / ${c?.hi || 'अन्य'}`)
  if (session.flat_no) rows.push(`*Flat / फ्लैट:* ${session.flat_no}`)
  if (session.issue_type) {
    rows.push(`*Issue / समस्या:* ${getIssueTypeLabel(Number(session.category_id), session.issue_type, 'EN')} / ${getIssueTypeLabel(Number(session.category_id), session.issue_type, 'HI')}`)
  }
  if (session.incident_datetime_text) rows.push(`*Date & Time / दिनांक-समय:* ${session.incident_datetime_text}`)
  if (session.description) rows.push(`*Details / विवरण:* ${session.description}`)
  rows.push('', confirmChoiceMessage())
  await sendWhatsAppMessage(env, mobile, rows.join('\n'))
}

function confirmChoiceMessage() {
  return '*1.* Register / शिकायत दर्ज करें\n*2.* Cancel / रद्द करें'
}

async function createComplaint(env, mobile, session, options = {}) {
  const now = new Date().toISOString()
  const description = session.description || buildDefaultDescription(session)
  const payload = {
    category_id: Number(session.category_id),
    flat_no: session.flat_no || session.location_text || 'COMMON AREA',
    mobile_no: mobile,
    description,
    status: 'OPEN',
    source: options.source || 'WHATSAPP',
    ...(options.webRequestId ? { web_request_id: options.webRequestId } : {}),
    opened_at: now,
    created_at: now,
    updated_at: now,
    preferred_language: session.preferred_language || 'EN',
    is_urgent: Boolean(session.is_urgent),
    urgency_code: session.urgency_code || null,
    urgency_reason: session.urgency_reason || null,
    elderly_citizen_70_plus: false,
    work_start_otp: Number(session.category_id) === 1 ? generateWorkStartOtp() : null,
    otp_generated_at: Number(session.category_id) === 1 ? now : null,
    location_text: session.location_text || null,
    issue_type: session.issue_type || null,
    incident_datetime_text: session.incident_datetime_text || null
  }
  const result = await supabaseRequest(env, '/rest/v1/complaints', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  if (!Array.isArray(result) || !result.length) throw new Error('Complaint could not be created.')
  return result[0]
}

async function notifyPlumberOfNewComplaint(env, complaint, session) {
  const workers = await supabaseRequest(
    env,
    '/rest/v1/workers?service_category_id=eq.1&active=eq.true&select=name,mobile_no&limit=1',
    { method: 'GET' }
  )

  const plumber = Array.isArray(workers) && workers.length ? workers[0] : null
  const mobile = normalizeMobile(plumber?.mobile_no)

  if (!mobile) {
    console.warn('No active plumber mobile number found in workers master data.')
    return
  }

  const registeredAt = complaint.opened_at || complaint.created_at || new Date().toISOString()
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(registeredAt))

  const flat = complaint.flat_no || session.flat_no || session.location_text || '—'
  const priority = session.is_urgent ? 'URGENT' : 'NORMAL'

  const message =
    '*RWA POCKET-A*\n\n' +
    '🔧 *New Plumber Complaint / नई प्लंबर शिकायत*\n\n' +
    `*Complaint No / शिकायत संख्या:* ${complaint.complaint_no}\n` +
    `*Flat / फ्लैट:* ${flat}\n` +
    `*Time / समय:* ${time}\n` +
    `*Priority / प्राथमिकता:* ${priority === 'URGENT' ? 'URGENT / अत्यावश्यक' : 'NORMAL / सामान्य'}\n\n` +
    'Please check the RWA Pocket-A App. / कृपया RWA Pocket-A ऐप देखें।'

  await sendWhatsAppMessage(env, mobile, message)
}

function generateWorkStartOtp() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function buildDefaultDescription(session) {
  const c = getCategoryById(Number(session.category_id))
  const parts = [c?.label || 'Complaint']
  if (session.issue_type) parts.push(session.issue_type.replaceAll('_', ' '))
  if (session.location_text) parts.push(session.location_text)
  if (session.incident_datetime_text) parts.push(session.incident_datetime_text)
  return parts.join(' - ')
}

async function getComplaintsAhead(env, complaintId) {
  try {
    const rows = await supabaseRequest(env,
      `/rest/v1/complaints?id=eq.${complaintId}&select=id,category_id,created_at,is_urgent,elderly_citizen_70_plus`,
      { method: 'GET' })
    const target = rows?.[0]
    if (!target) return 0
    // Waiting and work in progress consume the worker queue, not completed work.
    const candidates = await supabaseRequest(env,
      `/rest/v1/complaints?category_id=eq.${target.category_id}&status=in.(OPEN,REOPENED,ACKNOWLEDGED,ASSIGNED,IN_PROGRESS)&select=id,created_at,is_urgent,elderly_citizen_70_plus`,
      { method: 'GET' })
    const priority = c => c.is_urgent ? 0 : c.elderly_citizen_70_plus ? 1 : 2
    return (candidates || []).filter(c => c.id !== target.id && (
      priority(c) < priority(target) ||
      (priority(c) === priority(target) && (
        new Date(c.created_at) < new Date(target.created_at) ||
        (new Date(c.created_at).getTime() === new Date(target.created_at).getTime() && c.id < target.id)
      ))
    )).length
  } catch (error) {
    console.error('Queue-ahead calculation error:', error)
    return 0
  }
}

function complaintCreatedMessage(complaint, session, complaintsAhead = 0) {
  const c = getCategoryById(Number(session.category_id))
  const otp = Number(session.category_id) === 1
    ? `\n*Work Start OTP / कार्य प्रारंभ OTP:* *${complaint.work_start_otp}*\nShare only when the plumber arrives. / प्लंबर पहुँचने पर ही OTP दें।`
    : ''
  return `*Complaint registered / शिकायत दर्ज हुई* ✅\n\n*No / संख्या:* ${complaint.complaint_no}\n*Category / श्रेणी:* ${c?.label} / ${c?.hi}\n*Flat / फ्लैट:* ${session.flat_no}\n*Queue position / कतार क्रम:* ${complaintsAhead + 1}${otp}\n\n— RWA Pocket-A`
}

async function createSession(env, mobile, flatNo = null) {
  await supabaseRequest(env, '/rest/v1/whatsapp_complaint_sessions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      mobile_no: mobile,
      step: 'CATEGORY',
      preferred_language: 'EN', // Legacy database value; WhatsApp messages are bilingual.
      category_id: null,
      flat_no: flatNo,
      location_text: null,
      issue_type: null,
      incident_datetime_text: null,
      description: null,
      wants_description: null,
      elderly_citizen_70_plus: false,
      super_senior_citizen_alone: false,
      is_urgent: false,
      urgency_code: null,
      urgency_reason: null,
      updated_at: new Date().toISOString()
    })
  })
}

async function getSession(env, mobile) {
  const result = await supabaseRequest(env,
    `/rest/v1/whatsapp_complaint_sessions?mobile_no=eq.${encodeURIComponent(mobile)}&select=*`,
    { method: 'GET' })
  return Array.isArray(result) && result.length ? result[0] : null
}

async function updateSession(env, mobile, changes) {
  await supabaseRequest(env,
    `/rest/v1/whatsapp_complaint_sessions?mobile_no=eq.${encodeURIComponent(mobile)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() })
    })
}

async function deleteSession(env, mobile) {
  await supabaseRequest(env,
    `/rest/v1/whatsapp_complaint_sessions?mobile_no=eq.${encodeURIComponent(mobile)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

async function claimIncomingWhatsAppMessage(env, messageId) {
  if (!messageId || typeof messageId !== 'string') {
    // Do not silently discard unusual webhook deliveries without an ID.
    console.warn('Incoming WhatsApp message has no provider ID; dedupe skipped.')
    return true
  }
  // Ignore conflicts atomically on the message_id primary key. A second
  // delivery returns [] and does not initiate any additional WhatsApp sends.
  const rows = await supabaseRequest(env,
    '/rest/v1/whatsapp_inbound_message_dedupe?on_conflict=message_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ message_id: messageId })
    })
  return Array.isArray(rows) && rows.length === 1
}

async function supabaseRequest(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase Worker secrets are not configured.')
  }
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const raw = await response.text()
  if (!response.ok) {
    console.error('Supabase API error:', raw)
    throw new Error(`Supabase API error ${response.status}`)
  }
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

function getServiceItemLabel(agency) {
  switch (String(agency?.service_type || '').toUpperCase()) {
    case 'STREET_LIGHT':
      return 'स्ट्रीट लाइट'
    case 'CAMERA_AMC':
      return 'कैमरा'
    case 'LED_AMC':
      return 'LED स्क्रीन'
    default:
      return agency?.service_label || agency?.service_type || 'सेवा / उपकरण'
  }
}

async function sendStreetLightWhatsApp(
  env,
  to,
  agency,
  inspection,
  oldestDays,
  settings
) {
  const firstDayTemplate =
    env.SERVICE_WHATSAPP_TEMPLATE_FIRST_DAY ||
    'service_fault_first_day_hi'

  const pendingTemplate =
    env.SERVICE_WHATSAPP_TEMPLATE_PENDING ||
    'service_fault_pending_hi'

  const languageCode =
    env.SERVICE_WHATSAPP_TEMPLATE_LANGUAGE || 'hi'

  const templateName =
    oldestDays > 1 ? pendingTemplate : firstDayTemplate

  const supervisor = [
    settings?.supervisor_contact_name,
    settings?.supervisor_contact_mobile
  ].filter(Boolean).join(' - ') || '—'

  const rwa = [
    settings?.rwa_contact_name,
    settings?.rwa_contact_mobile
  ].filter(Boolean).join(' - ') || '—'

  const serviceItem = getServiceItemLabel(agency)

  const parameters = oldestDays > 1
    ? [
        formatStreetLightMessageDate(inspection.inspection_date),
        agency.agency_name,
        serviceItem,
        String(inspection.faulty_count),
        String(oldestDays),
        supervisor,
        rwa
      ]
    : [
        formatStreetLightMessageDate(inspection.inspection_date),
        agency.agency_name,
        serviceItem,
        String(inspection.faulty_count),
        supervisor,
        rwa
      ]

  return sendWhatsAppTemplateMessage(
    env,
    to,
    templateName,
    languageCode,
    parameters
  )
}

async function sendWhatsAppTemplateMessage(
  env,
  to,
  templateName,
  languageCode,
  parameters
) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp Worker secrets are not configured.')
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: 'body',
              parameters: parameters.map((value) => ({
                type: 'text',
                text: String(value)
              }))
            }
          ]
        }
      })
    }
  )

  const resultText = await response.text()
  console.log('WhatsApp template send result:', resultText)

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${resultText}`)
  }

  try {
    return JSON.parse(resultText)
  } catch {
    return { raw: resultText }
  }
}

async function sendSmsMessage(env, to, message) {
  if (!env.SMS_GATEWAY_URL || !env.SMS_GATEWAY_TOKEN) {
    throw new Error(
      'Background SMS service is not configured yet. Configure an India DLT-compliant SMS gateway first.'
    )
  }

  const response = await fetch(env.SMS_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SMS_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to,
      message,
      sender_id: env.SMS_SENDER_ID || null,
      template_id: env.SMS_TEMPLATE_ID || null
    })
  })

  const resultText = await response.text()

  if (!response.ok) {
    throw new Error(`SMS gateway error: ${resultText}`)
  }

  try {
    return JSON.parse(resultText)
  } catch {
    return { raw: resultText }
  }
}


const CHATBOT_FAILURE_KEY = 'whatsapp-chatbot:processing-failures'
const CHATBOT_DEGRADED_KEY = 'whatsapp-chatbot:degraded'
const FAILURE_WINDOW_MS = 10 * 60 * 1000
const DEGRADED_TTL_SECONDS = 15 * 60
const FALLBACK_COOLDOWN_SECONDS = 30 * 60

function getWebComplaintPublicUrl(env = {}) {
  const raw = String(env.WEB_COMPLAINT_PUBLIC_URL || '').trim()
  if (!raw || raw.length > 400) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        url.searchParams.get('view') !== 'complaint-chat' || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

// Inline footer adds no outgoing WhatsApp message to the normal flow.
// A resident can still open their previous menu if the bot goes offline.
function webComplaintFallbackFooter(env) {
  const link = getWebComplaintPublicUrl(env)
  if (!link) return ''
  return `\n\n*Backup web complaint app / वैकल्पिक वेब शिकायत ऐप:*\n${link}`
}

function webComplaintFallbackMessage(env) {
  const link = getWebComplaintPublicUrl(env)
  if (!link) return null
  return '*RWA Pocket-A | Web Complaint Alternative*\n\n' +
    'The WhatsApp complaint chatbot is currently unavailable. Please register your complaint on our web app (no login):\n' +
    'WhatsApp शिकायत चैटबॉट अभी उपलब्ध नहीं है। बिना लॉगिन के वेब ऐप पर शिकायत दर्ज करें:\n\n' +
    link + '\n\n— RWA Pocket-A'
}

function chatbotFallbackKV(env) {
  const kv = env.CHATBOT_FAILURE_KV
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function'
    ? kv : null
}

// Manual emergency switch: WHATSAPP_FALLBACK_ONLY=true. The Worker still
// receives a message and replies through WhatsApp while Meta works.
// KV mode is triggered after repeated processing failures and auto-expires.
async function shouldUseWebComplaintFallback(env) {
  if (!getWebComplaintPublicUrl(env)) return false
  if (String(env.WHATSAPP_FALLBACK_ONLY || '').toLowerCase() === 'true') return true
  const kv = chatbotFallbackKV(env)
  if (!kv) return false
  try {
    return Boolean(await kv.get(CHATBOT_DEGRADED_KEY))
  } catch (error) {
    console.error('Fallback circuit lookup failed:', String(error?.message || error))
    return false
  }
}

async function recordChatbotProcessingFailure(env) {
  const kv = chatbotFallbackKV(env)
  if (!kv || !getWebComplaintPublicUrl(env)) return false
  try {
    const now = Date.now()
    const prior = JSON.parse((await kv.get(CHATBOT_FAILURE_KEY)) || 'null')
    const stillInWindow = prior && Number.isFinite(prior.since) &&
      now - prior.since >= 0 && now - prior.since < FAILURE_WINDOW_MS
    const failures = stillInWindow ? (Number(prior.failures) || 0) + 1 : 1
    const since = stillInWindow ? prior.since : now
    if (failures >= 3) {
      await kv.put(CHATBOT_DEGRADED_KEY, '1', { expirationTtl: DEGRADED_TTL_SECONDS })
      console.error('Chatbot fallback circuit activated after repeated processing failures.')
      return true
    }
    await kv.put(CHATBOT_FAILURE_KEY, JSON.stringify({ failures, since }), {
      expirationTtl: Math.ceil(FAILURE_WINDOW_MS / 1000)
    })
  } catch (error) {
    console.error('Fallback circuit update failed:', String(error?.message || error))
  }
  return false
}

async function clearChatbotProcessingFailureStreak(env) {
  const kv = chatbotFallbackKV(env)
  if (!kv || typeof kv.delete !== 'function') return
  try { await kv.delete(CHATBOT_FAILURE_KEY) }
  catch (error) { console.error('Fallback circuit reset failed:', String(error?.message || error)) }
}

async function fallbackRecipientKey(mobile) {
  const bytes = new TextEncoder().encode(mobile)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return 'whatsapp-chatbot:fallback-recipient:' +
    Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sendWebComplaintFallbackOnce(env, recipient, messageId) {
  const message = webComplaintFallbackMessage(env)
  if (!message) {
    console.error('WEB_COMPLAINT_PUBLIC_URL must be configured with the public HTTPS web-chat link.')
    return false
  }
  const kv = chatbotFallbackKV(env)
  let key = null
  if (kv) {
    try {
      key = await fallbackRecipientKey(recipient)
      if (await kv.get(key)) return false // One link every 30 minutes per number.
    } catch (error) {
      key = null
      console.error('Fallback cooldown lookup failed:', String(error?.message || error))
    }
  }
  await sendWhatsAppMessage(env, recipient, message)
  if (kv && key) {
    try {
      await kv.put(key, String(messageId || 'sent'), { expirationTtl: FALLBACK_COOLDOWN_SECONDS })
    } catch (error) {
      console.error('Fallback cooldown write failed:', String(error?.message || error))
    }
  }
  return true
}

async function sendWhatsAppMessage(env, to, message) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp Worker secrets are not configured.')
  }
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message }
      })
    })
  const resultText = await response.text()
  if (!response.ok) {
    // Never log body/recipient. The provider error code is sufficient for
    // operators to distinguish billing/eligibility from Worker failures.
    let code = null
    try { code = JSON.parse(resultText)?.error?.code ?? null } catch {}
    console.error('WhatsApp API send failed:', JSON.stringify({ status: response.status, code }))
    throw new Error(`WhatsApp API error ${response.status} (code ${code ?? 'unknown'})`)
  }
  // A successful user-facing WhatsApp message demonstrates that the
  // transport works. Reset the streak; existing degraded mode expires by TTL.
  await clearChatbotProcessingFailureStreak(env)
  try {
    return JSON.parse(resultText)
  } catch {
    return { raw: resultText }
  }
}

function invalidChoice() {
  return 'Please select a valid option. / कृपया सही विकल्प चुनें।'
}

function cancelMessage() {
  return 'Complaint not registered. Send *Hi* to start again. / शिकायत दर्ज नहीं हुई। नई शिकायत के लिए *Hi* भेजें।\n\n— RWA Pocket-A'
}

function normalizeMobile(mobile) { return mobile ? String(mobile).replace(/\D/g, '') : '' }
function isStartCommand(text) {
  return ['hi', 'hello', 'hello rwa', 'complaint', 'शिकायत'].includes(text)
}
function webhookResponse() { return new Response('EVENT_RECEIVED', { status: 200 }) }
function htmlResponse(body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}

function privacyPolicyHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RWA Pocket-A Privacy Policy</title></head><body style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6"><h1>RWA Pocket-A Privacy Policy</h1><p>RWA Pocket-A uses its WhatsApp Complaint Service to receive and manage resident maintenance and community-service complaints.</p><h2>Information We Collect</h2><p>We may collect mobile number, flat/location, complaint category, description, priority information, status and related timestamps.</p><h2>Use and Sharing</h2><p>Information is used for RWA complaint management and is not sold or used for advertising. It may be accessed by authorised RWA representatives and service personnel as required.</p><h2>Data Deletion</h2><p>Residents may request deletion through official RWA communication channels.</p><p>RWA Pocket-A<br>Sector-105, Noida</p></body></html>`
}
function dataDeletionHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RWA Pocket-A Data Deletion</title></head><body style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6"><h1>Data Deletion Instructions</h1><p>Residents may request deletion of personal information associated with the RWA Pocket-A Complaint Service through the official RWA communication channel. Please provide the registered mobile number and complaint number, if available. After verification, the RWA will review the request and delete or anonymise personal information where appropriate, subject to legitimate record-keeping requirements.</p><p>RWA Pocket-A<br>Sector-105, Noida</p></body></html>`
}
