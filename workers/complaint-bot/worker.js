// RWA Pocket-A WhatsApp Complaint Bot
// Source-controlled Cloudflare Worker. Secrets are configured in Cloudflare, never in this file.
// Deployment is managed from GitHub through Cloudflare Builds.

const GRAPH_API_VERSION = 'v26.0'
const MAX_DESCRIPTION = 100

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/privacy') {
      return htmlResponse(privacyPolicyHtml())
    }
    if (request.method === 'GET' && url.pathname === '/data-deletion') {
      return htmlResponse(dataDeletionHtml())
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
        url.pathname.startsWith('/api/complaints/') ||
        url.pathname.startsWith('/api/street-lights/')
      )
    ) {
      return apiResponse({ ok: true }, 200)
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/acknowledge') {
      return handleSupervisorAction(request, env, 'ACKNOWLEDGED')
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints/resolve') {
      return handleSupervisorAction(request, env, 'RESOLVED')
    }

    if (request.method === 'POST' && url.pathname === '/api/street-lights/notify-whatsapp') {
      return handleStreetLightWhatsapp(request, env)
    }

    if (request.method === 'POST') {
      try {
        const body = await request.json()
        const value = body?.entry?.[0]?.changes?.[0]?.value
        const message = value?.messages?.[0]
        if (!message) return webhookResponse()

        const from = normalizeMobile(message.from)
        if (!from) return webhookResponse()

        if (message.type !== 'text') {
          const session = await getSession(env, from)
          await sendWhatsAppMessage(env, from,
            session?.preferred_language === 'EN'
              ? 'Please send a text message.'
              : 'कृपया टेक्स्ट संदेश भेजें।')
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
        if (!session) {
          await sendWhatsAppMessage(env, from, 'Please send *Hi* to register a complaint.\n\nशिकायत दर्ज करने के लिए *Hi* भेजें।\n\n— RWA Pocket-A')
          return webhookResponse()
        }

        await processConversation(env, from, originalText, session)
      } catch (error) {
        console.error('Webhook error:', error)
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  })
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

  return `दिनांक: ${formatStreetLightMessageDate(inspection.inspection_date)}

सेवा में,
${agency.agency_name}

Pocket-A, Sector-105 में ${lightText} और यह समस्या ${oldestDays} दिन से लंबित है। कृपया जल्द से जल्द ठीक करवाने की कृपा करें।

अधिक जानकारी के लिए संपर्क करें:
Supervisor: ${supervisor}
RWA: ${rwa}

धन्यवाद
RWA Pocket-A`
}

async function handleStreetLightWhatsapp(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env)
    if (!user?.id) {
      return apiResponse({ ok: false, error: 'Authentication required.' }, 401)
    }

    const body = await request.json()
    const inspectionId = Number(body?.inspection_id)

    if (!Number.isInteger(inspectionId) || inspectionId <= 0) {
      return apiResponse({ ok: false, error: 'Invalid street-light inspection id.' }, 400)
    }

    const inspections = await supabaseRequest(
      env,
      `/rest/v1/street_light_agency_daily_inspections?id=eq.${inspectionId}&select=id,inspection_date,agency_id,faulty_count,remarks`,
      { method: 'GET' }
    )

    if (!Array.isArray(inspections) || !inspections.length) {
      return apiResponse({ ok: false, error: 'Street-light inspection not found.' }, 404)
    }

    const inspection = inspections[0]

    if (!inspection.faulty_count || inspection.faulty_count <= 0) {
      return apiResponse({ ok: false, error: 'There are no faulty street lights to report.' }, 409)
    }

    const agencies = await supabaseRequest(
      env,
      `/rest/v1/society_service_agencies?id=eq.${inspection.agency_id}&select=id,agency_name,contact_name,mobile_no,whatsapp_no`,
      { method: 'GET' }
    )

    if (!Array.isArray(agencies) || !agencies.length) {
      return apiResponse({ ok: false, error: 'Street-light agency not found.' }, 404)
    }

    const agency = agencies[0]
    let recipient = normalizeMobile(agency.mobile_no || agency.whatsapp_no)
    if (recipient.length === 10) recipient = `91${recipient}`

    if (!recipient) {
      return apiResponse({ ok: false, error: 'Please configure the agency mobile number first.' }, 400)
    }

    const locations = await supabaseRequest(
      env,
      `/rest/v1/street_light_fault_locations?inspection_id=eq.${inspection.id}&select=id,sequence_no,location_text,status,issue_id&order=sequence_no.asc`,
      { method: 'GET' }
    )

    if (!Array.isArray(locations) || locations.length !== inspection.faulty_count) {
      return apiResponse({ ok: false, error: 'Please save all fault locations before sending the complaint.' }, 409)
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

    const settingsRows = await supabaseRequest(
      env,
      '/rest/v1/society_inspection_settings?id=eq.1&select=supervisor_contact_name,supervisor_contact_mobile,rwa_contact_name,rwa_contact_mobile',
      { method: 'GET' }
    )
    const settings = Array.isArray(settingsRows) && settingsRows.length
      ? settingsRows[0]
      : {}

    const message = streetLightComplaintMessage(
      agency,
      inspection,
      locations,
      issues,
      settings
    )
    const now = new Date().toISOString()

    try {
      const providerResult = await sendWhatsAppMessage(env, recipient, message)
      const providerReference = providerResult?.messages?.[0]?.id || null

      await supabaseRequest(env, '/rest/v1/street_light_notifications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          inspection_id: inspection.id,
          agency_id: inspection.agency_id,
          channel: 'WHATSAPP',
          recipient_name: agency.contact_name || null,
          recipient_mobile: recipient,
          message_text: message,
          delivery_status: 'SENT',
          provider_reference: providerReference,
          provider_response: JSON.stringify(providerResult || {}),
          sent_by: user.id,
          sent_at: now
        })
      })

      return apiResponse({
        ok: true,
        whatsapp_sent: true,
        message,
        recipient_mobile: recipient
      }, 200)
    } catch (sendError) {
      console.error('Street-light WhatsApp notification failed:', sendError)

      await supabaseRequest(env, '/rest/v1/street_light_notifications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          inspection_id: inspection.id,
          agency_id: inspection.agency_id,
          channel: 'WHATSAPP',
          recipient_name: agency.contact_name || null,
          recipient_mobile: recipient,
          message_text: message,
          delivery_status: 'FAILED',
          provider_response: String(sendError?.message || sendError),
          sent_by: user.id
        })
      })

      return apiResponse({
        ok: false,
        whatsapp_sent: false,
        error: 'Unable to send WhatsApp complaint.'
      }, 502)
    }
  } catch (error) {
    console.error('Street-light WhatsApp action error:', error)
    return apiResponse({ ok: false, error: 'Unable to process street-light complaint.' }, 500)
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
  const lang = complaint.preferred_language || 'EN'
  const greeting = residentGreeting(complaint, lang)
  if (lang === 'HI') {
    return `${greeting}\n\nआपकी शिकायत *${complaint.complaint_no}* प्राप्त कर ली गई है। ✅\n\nहमारा *${hindiWorkerName(Number(complaint.category_id))}* जल्द ही आपकी शिकायत पर कार्यवाही करेगा।\n\n*शिकायत संख्या:* ${complaint.complaint_no}\n\nआपके धैर्य एवं सहयोग के लिए धन्यवाद।\n\n*— RWA Pocket-A*`
  }
  return `${greeting}\n\nYour complaint *${complaint.complaint_no}* has been acknowledged. ✅\n\nOur team will attend to your complaint shortly.\n\n*Complaint No:* ${complaint.complaint_no}\n\nThank you for your patience and cooperation.\n\n*— RWA Pocket-A*`
}

function supervisorResolvedMessage(complaint, resolvedAt) {
  const lang = complaint.preferred_language || 'EN'
  const greeting = residentGreeting(complaint, lang)
  if (lang === 'HI') {
    return `${greeting}\n\nआपकी शिकायत *${complaint.complaint_no}* का समाधान कर दिया गया है। ✅\n\nयदि समस्या अभी भी बनी हुई है, तो इस संदेश का उत्तर दें:\n*REOPEN ${complaint.complaint_no}*\n\n*शिकायत संख्या:* ${complaint.complaint_no}\n\nधन्यवाद।\n\n*— RWA Pocket-A*`
  }
  return `${greeting}\n\nYour complaint *${complaint.complaint_no}* has been resolved. ✅\n\nIf the problem is still not resolved, reply:\n*REOPEN ${complaint.complaint_no}*\n\n*Complaint No:* ${complaint.complaint_no}\n\nThank you.\n\n*— RWA Pocket-A*`
}

async function reopenComplaint(env, mobile, complaintNo) {
  const rows = await supabaseRequest(
    env,
    `/rest/v1/complaints?complaint_no=eq.${encodeURIComponent(complaintNo)}&mobile_no=eq.${encodeURIComponent(mobile)}&status=in.(RESOLVED,CLOSED)&order=created_at.desc&limit=1&select=id,complaint_no,preferred_language`,
    { method: 'GET' }
  )

  if (!Array.isArray(rows) || !rows.length) {
    await sendWhatsAppMessage(
      env,
      mobile,
      `We could not find a resolved complaint *${complaintNo}* registered with this WhatsApp number.\n\nPlease check the complaint number or send *Hi* for a new complaint.\n\n— RWA Pocket-A`
    )
    return
  }

  const complaint = rows[0]
  const now = new Date().toISOString()

  await supabaseRequest(
    env,
    `/rest/v1/complaints?id=eq.${complaint.id}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'REOPENED',
        reopened_at: now,
        updated_at: now
      })
    }
  )

  const lang = complaint.preferred_language || 'EN'
  const message = lang === 'HI'
    ? `आपकी शिकायत *${complaintNo}* दोबारा खोल दी गई है। 🔄\n\nSupervisor को सूचित कर दिया गया है और शिकायत पर पुनः कार्यवाही की जाएगी।\n\n*— RWA Pocket-A*`
    : `Your complaint *${complaintNo}* has been reopened. 🔄\n\nThe Supervisor has been notified and the complaint will be attended again.\n\n*— RWA Pocket-A*`

  await sendWhatsAppMessage(env, mobile, message)
}

async function startComplaint(env, mobile) {
  await deleteSession(env, mobile)
  await createSession(env, mobile)
  await sendWhatsAppMessage(env, mobile, languageMenu())
}

async function processConversation(env, mobile, originalText, session) {
  const text = originalText.trim()
  const step = session.step
  const lang = session.preferred_language || 'EN'
  const categoryId = Number(session.category_id)

  if (step === 'LANGUAGE') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, languageMenu())
      return
    }
    const language = text === '1' ? 'EN' : 'HI'
    await updateSession(env, mobile, { preferred_language: language, step: 'CATEGORY' })
    await sendWhatsAppMessage(env, mobile, categoryMenu(language))
    return
  }

  if (step === 'CATEGORY') {
    const category = getCategory(text)
    if (!category) {
      await sendWhatsAppMessage(env, mobile, invalidChoice(lang) + '\n\n' + categoryMenu(lang))
      return
    }

    const nextStep = [1, 2].includes(category.id) ? 'FLAT_NO' : 'LOCATION'
    await updateSession(env, mobile, {
      category_id: category.id,
      flat_no: null,
      location_text: null,
      issue_type: null,
      incident_datetime_text: null,
      description: null,
      wants_description: null,
      is_urgent: false,
      urgency_code: null,
      urgency_reason: null,
      elderly_citizen_70_plus: false,
      step: nextStep
    })

    await sendWhatsAppMessage(env, mobile,
      nextStep === 'FLAT_NO'
        ? flatNumberQuestion(lang, category)
        : locationQuestion(lang, category))
    return
  }

  if (step === 'FLAT_NO') {
    const flatNo = text.toUpperCase().slice(0, 50)
    if (flatNo.length < 2) {
      await sendWhatsAppMessage(env, mobile, lang === 'HI'
        ? 'कृपया सही Flat Number भेजें।\nउदाहरण: *36-D*'
        : 'Please enter a valid Flat Number.\nExample: *36-D*')
      return
    }
    await updateSession(env, mobile, { flat_no: flatNo, step: 'URGENT' })
    await sendWhatsAppMessage(env, mobile, urgentQuestion(categoryId, lang))
    return
  }

  if (step === 'LOCATION') {
    const location = text.slice(0, 150)
    if (location.length < 2) {
      await sendWhatsAppMessage(env, mobile, locationQuestion(lang, getCategoryById(categoryId)))
      return
    }
    const next = categoryId === 3 ? 'URGENT' : categoryId === 4 ? 'INCIDENT_DATETIME' : [5, 6, 7].includes(categoryId) ? 'ISSUE_TYPE' : 'ADD_NOTE'
    await updateSession(env, mobile, { location_text: location, step: next })
    if (next === 'URGENT') await sendWhatsAppMessage(env, mobile, urgentQuestion(categoryId, lang))
    if (next === 'INCIDENT_DATETIME') await sendWhatsAppMessage(env, mobile, incidentDateTimeQuestion(lang))
    if (next === 'ISSUE_TYPE') await sendWhatsAppMessage(env, mobile, issueTypeMenu(categoryId, lang))
    return
  }

  if (step === 'INCIDENT_DATETIME') {
    if (text.length < 3) {
      await sendWhatsAppMessage(env, mobile, incidentDateTimeQuestion(lang))
      return
    }
    await updateSession(env, mobile, { incident_datetime_text: text.slice(0, 100), step: 'ADD_NOTE' })
    await sendWhatsAppMessage(env, mobile, addNoteQuestion(lang))
    return
  }

  if (step === 'ISSUE_TYPE') {
    const issue = getIssueType(categoryId, text)
    if (!issue) {
      await sendWhatsAppMessage(env, mobile, issueTypeMenu(categoryId, lang))
      return
    }
    const next = categoryId === 6 ? 'URGENT' : 'ADD_NOTE'
    await updateSession(env, mobile, { issue_type: issue, step: next })
    await sendWhatsAppMessage(env, mobile,
      next === 'URGENT' ? urgentQuestion(categoryId, lang) : addNoteQuestion(lang))
    return
  }

  if (step === 'URGENT') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, urgentQuestion(categoryId, lang))
      return
    }

    if (text === '2') {
      const urgent = defaultUrgency(categoryId)
      const next = [1, 2].includes(categoryId) ? 'ELDERLY' : 'ADD_NOTE'
      await updateSession(env, mobile, {
        is_urgent: true,
        urgency_code: urgent.code,
        urgency_reason: urgent.reason,
        step: next
      })
      await sendWhatsAppMessage(env, mobile,
        next === 'ELDERLY' ? elderlyQuestion(lang) : addNoteQuestion(lang))
      return
    }

    const next = [1, 2].includes(categoryId) ? 'ELDERLY' : 'ADD_NOTE'
    await updateSession(env, mobile, {
      is_urgent: false, urgency_code: null, urgency_reason: null, step: next
    })
    await sendWhatsAppMessage(env, mobile,
      next === 'ELDERLY' ? elderlyQuestion(lang) : addNoteQuestion(lang))
    return
  }

  if (step === 'ELDERLY') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, elderlyQuestion(lang))
      return
    }
    await updateSession(env, mobile, {
      elderly_citizen_70_plus: text === '2',
      step: 'ADD_NOTE'
    })
    await sendWhatsAppMessage(env, mobile, addNoteQuestion(lang))
    return
  }

  if (step === 'ADD_NOTE') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, addNoteQuestion(lang))
      return
    }
    if (text === '2') {
      await updateSession(env, mobile, { wants_description: true, step: 'DESCRIPTION' })
      await sendWhatsAppMessage(env, mobile, descriptionQuestion(lang))
      return
    }
    await updateSession(env, mobile, { wants_description: false, description: null, step: 'CONFIRM' })
    await sendConfirmation(env, mobile, await getSession(env, mobile))
    return
  }

  if (step === 'DESCRIPTION') {
    if (!text) {
      await sendWhatsAppMessage(env, mobile, descriptionQuestion(lang))
      return
    }
    await updateSession(env, mobile, { description: text.slice(0, MAX_DESCRIPTION), step: 'CONFIRM' })
    await sendConfirmation(env, mobile, await getSession(env, mobile))
    return
  }

  if (step === 'CONFIRM') {
    if (!['1', '2'].includes(text)) {
      await sendWhatsAppMessage(env, mobile, confirmChoiceMessage(lang))
      return
    }
    if (text === '2') {
      await deleteSession(env, mobile)
      await sendWhatsAppMessage(env, mobile, cancelMessage(lang))
      return
    }

    const current = await getSession(env, mobile)
    if (!current) throw new Error('Complaint session not found.')
    const complaint = await createComplaint(env, mobile, current)
    const complaintsAhead = await getComplaintsAhead(env, complaint.id)
    await deleteSession(env, mobile)
    await sendWhatsAppMessage(env, mobile, complaintCreatedMessage(complaint, current, complaintsAhead))
    return
  }

  await deleteSession(env, mobile)
  await sendWhatsAppMessage(env, mobile, lang === 'HI'
    ? 'शिकायत प्रक्रिया दोबारा शुरू करने के लिए *Hi* भेजें।\n\n— RWA Pocket-A'
    : 'Please send *Hi* to restart the complaint process.\n\n— RWA Pocket-A')
}

function languageMenu() {
  return '*Welcome to RWA Pocket-A Complaint Service* 🙏\n\nPlease select your preferred language.\nकृपया अपनी भाषा चुनें।\n\n*1.* English\n*2.* हिंदी\n\nPlease send only the option number.'
}

function categoryMenu(lang) {
  if (lang === 'HI') {
    return '*शिकायत का प्रकार चुनें:*\n\n*1.* 🔧 Plumber\n*2.* ⚡ Electrician\n*3.* 🚰 Sewerage Issue\n*4.* 📹 Camera Recording\n*5.* 🌿 Horticulture\n*6.* 💡 Street Light\n*7.* 🧹 Housekeeping/Garbage\n*8.* 📋 Other\n\nकृपया केवल विकल्प संख्या भेजें।'
  }
  return '*Please select the complaint category:*\n\n*1.* 🔧 Plumber\n*2.* ⚡ Electrician\n*3.* 🚰 Sewerage Issue\n*4.* 📹 Camera Recording\n*5.* 🌿 Horticulture\n*6.* 💡 Street Light\n*7.* 🧹 Housekeeping/Garbage\n*8.* 📋 Other\n\nPlease send only the option number.'
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
function getCategory(text) { return CATEGORIES[Number(text)] || null }
function getCategoryById(id) { return CATEGORIES[id] || null }

function flatNumberQuestion(lang, category) {
  return lang === 'HI'
    ? `आपने *${category.hi}* चुना है।\n\nकृपया अपना *Flat Number* भेजें।\nउदाहरण: *36-D*`
    : `You selected *${category.label}*.\n\nPlease enter your *Flat Number*.\nExample: *36-D*`
}

function locationQuestion(lang, category) {
  return lang === 'HI'
    ? `आपने *${category?.hi || ''}* चुना है।\n\nकृपया समस्या का *स्थान* बताएं।\nउदाहरण: Near Tower 4, Park-1, Gate-2`
    : `You selected *${category?.label || ''}*.\n\nPlease enter the *location*.\nExample: Near Tower 4, Park-1, Gate-2`
}

function urgentQuestion(categoryId, lang) {
  return lang === 'HI'
    ? 'शिकायत की प्राथमिकता चुनें:\n\n*1.* Normal\n*2.* Urgent'
    : 'Select complaint priority:\n\n*1.* Normal\n*2.* Urgent'
}

function defaultUrgency(categoryId) {
  return {
    1: { code: 'PLUMBING_URGENT', reason: 'Urgent plumbing condition confirmed by resident' },
    2: { code: 'ELECTRICAL_URGENT', reason: 'Urgent electrical condition confirmed by resident' },
    3: { code: 'SEWERAGE_URGENT', reason: 'Urgent sewerage condition confirmed by resident' },
    6: { code: 'STREET_LIGHT_HAZARD', reason: 'Hazardous street-light electrical condition confirmed by resident' }
  }[categoryId] || { code: 'URGENT', reason: 'Urgent condition confirmed by resident' }
}

function elderlyQuestion(lang) {
  return lang === 'HI'
    ? 'क्या आप *70 वर्ष या उससे अधिक आयु के Elderly Citizen* हैं?\n\n*1.* No\n*2.* Yes'
    : 'Are you an *Elderly Citizen (70 years or above)*?\n\n*1.* No\n*2.* Yes'
}

function addNoteQuestion(lang) {
  return lang === 'HI'
    ? 'क्या आप समस्या के बारे में कोई *Note/Description* जोड़ना चाहते हैं?\n\n*1.* No\n*2.* Yes'
    : 'Would you like to add any *note/description* about the problem?\n\n*1.* No\n*2.* Yes'
}

function descriptionQuestion(lang) {
  return lang === 'HI'
    ? `कृपया संक्षिप्त विवरण भेजें। अधिकतम *${MAX_DESCRIPTION} characters*.`
    : `Please enter a short description. Maximum *${MAX_DESCRIPTION} characters*.`
}

function incidentDateTimeQuestion(lang) {
  return lang === 'HI'
    ? 'कृपया Camera Recording के लिए अनुमानित *Date & Time* बताएं।\nउदाहरण: *20 Sep, around 8:30 PM*'
    : 'Please enter the approximate *Date & Time* for the camera recording.\nExample: *20 Sep, around 8:30 PM*'
}

function issueTypeMenu(categoryId, lang) {
  if (categoryId === 7) {
    return lang === 'HI'
      ? '*Housekeeping/Garbage समस्या चुनें:*\n\n*1.* Garbage Not Collected\n*2.* Common Area Cleaning\n*3.* Sweeping/Cleaning Issue\n*4.* Garbage Dumping\n*5.* Other'
      : '*Select Housekeeping/Garbage issue:*\n\n*1.* Garbage Not Collected\n*2.* Common Area Cleaning\n*3.* Sweeping/Cleaning Issue\n*4.* Garbage Dumping\n*5.* Other'
  }
  if (categoryId === 5) {
    return lang === 'HI'
      ? '*Horticulture समस्या चुनें:*\n\n*1.* Tree/Branch Cutting\n*2.* Grass/Plant Maintenance\n*3.* Watering Issue\n*4.* Fallen/Damaged Tree or Branch\n*5.* Other'
      : '*Select Horticulture issue:*\n\n*1.* Tree/Branch Cutting\n*2.* Grass/Plant Maintenance\n*3.* Watering Issue\n*4.* Fallen/Damaged Tree or Branch\n*5.* Other'
  }
  return lang === 'HI'
    ? '*Street Light समस्या चुनें:*\n\n*1.* Light Not Working\n*2.* Light Blinking/Flickering\n*3.* Light ON During Daytime\n*4.* Pole/Wiring Issue\n*5.* Other'
    : '*Select Street Light issue:*\n\n*1.* Light Not Working\n*2.* Light Blinking/Flickering\n*3.* Light ON During Daytime\n*4.* Pole/Wiring Issue\n*5.* Other'
}

function getIssueType(categoryId, text) {
  const values = categoryId === 5
    ? { '1': 'TREE_BRANCH_CUTTING', '2': 'GRASS_PLANT_MAINTENANCE', '3': 'WATERING_ISSUE', '4': 'FALLEN_DAMAGED_TREE_BRANCH', '5': 'OTHER' }
    : categoryId === 7
      ? { '1': 'GARBAGE_NOT_COLLECTED', '2': 'COMMON_AREA_CLEANING', '3': 'SWEEPING_CLEANING_ISSUE', '4': 'GARBAGE_DUMPING', '5': 'OTHER' }
      : { '1': 'LIGHT_NOT_WORKING', '2': 'LIGHT_FLICKERING', '3': 'LIGHT_ON_DAYTIME', '4': 'POLE_WIRING_ISSUE', '5': 'OTHER' }
  return values[text] || null
}

async function sendConfirmation(env, mobile, session) {
  const lang = session.preferred_language || 'EN'
  const c = getCategoryById(Number(session.category_id))
  const rows = []
  rows.push(lang === 'HI' ? '*कृपया जानकारी जाँच लें:*' : '*Please review the complaint:*')
  rows.push('')
  rows.push(`*Category:* ${lang === 'HI' ? c?.hi : c?.label}`)
  if (session.flat_no) rows.push(`*Flat:* ${session.flat_no}`)
  if (session.location_text) rows.push(`*Location:* ${session.location_text}`)
  if (session.issue_type) rows.push(`*Issue:* ${session.issue_type.replaceAll('_', ' ')}`)
  if (session.incident_datetime_text) rows.push(`*Date/Time:* ${session.incident_datetime_text}`)
  if (session.description) rows.push(`*Note:* ${session.description}`)
  if ([1,2,3,6].includes(Number(session.category_id))) rows.push(`*Urgent:* ${session.is_urgent ? 'Yes' : 'No'}`)
  if ([1,2].includes(Number(session.category_id))) rows.push(`*Elderly Citizen 70+:* ${session.elderly_citizen_70_plus ? 'Yes' : 'No'}`)
  rows.push(`*Priority:* ${getPriorityLabel(session)}`)
  rows.push('')
  rows.push(lang === 'HI' ? '*1.* शिकायत दर्ज करें\n*2.* Cancel' : '*1.* Register Complaint\n*2.* Cancel')
  await sendWhatsAppMessage(env, mobile, rows.join('\n'))
}

function confirmChoiceMessage(lang) {
  return lang === 'HI' ? 'कृपया चुनें:\n\n*1.* शिकायत दर्ज करें\n*2.* Cancel' : 'Please choose:\n\n*1.* Register Complaint\n*2.* Cancel'
}

async function createComplaint(env, mobile, session) {
  const now = new Date().toISOString()
  const description = session.description || buildDefaultDescription(session)
  const payload = {
    category_id: Number(session.category_id),
    flat_no: session.flat_no || session.location_text || 'COMMON AREA',
    mobile_no: mobile,
    description,
    status: 'OPEN',
    source: 'WHATSAPP',
    opened_at: now,
    created_at: now,
    updated_at: now,
    preferred_language: session.preferred_language || 'EN',
    is_urgent: Boolean(session.is_urgent),
    urgency_code: session.urgency_code || null,
    urgency_reason: session.urgency_reason || null,
    elderly_citizen_70_plus: Boolean(session.elderly_citizen_70_plus),
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
    const result = await supabaseRequest(env, '/rest/v1/rpc/get_complaints_ahead', {
      method: 'POST',
      body: JSON.stringify({ p_complaint_id: complaintId })
    })
    const value = Number(result)
    return Number.isFinite(value) ? value : 0
  } catch (error) {
    console.error('Queue-ahead calculation error:', error)
    return 0
  }
}

function complaintCreatedMessage(complaint, session, complaintsAhead = 0) {
  const lang = session.preferred_language || 'EN'
  const c = getCategoryById(Number(session.category_id))
  const location = session.flat_no || session.location_text || ''
  const priority = getPriorityLabel(session)
  if (lang === 'HI') {
    return `*आदरणीय महोदय/महोदया,*\n\nआपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। ✅\n\n*शिकायत संख्या:* ${complaint.complaint_no}\n*Category:* ${c?.hi}\n*Flat/Location:* ${location}\n*Priority:* ${priority}\n*आपसे पहले शिकायतें:* ${complaintsAhead}\n\nSupervisor द्वारा शिकायत प्राप्त करने के बाद आपको सूचित किया जाएगा।\n\nधन्यवाद।\n\n*— RWA Pocket-A*`
  }
  return `*Dear Sir/Madam,*\n\nYour complaint has been registered successfully. ✅\n\n*Complaint No:* ${complaint.complaint_no}\n*Category:* ${c?.label}\n*Flat/Location:* ${location}\n*Priority:* ${priority}\n*Complaints ahead of you:* ${complaintsAhead}\n\nYou will be notified after the Supervisor acknowledges the complaint.\n\nThank you.\n\n*— RWA Pocket-A*`
}

function getPriorityLabel(session) {
  if (session.is_urgent) return 'URGENT'
  if (session.elderly_citizen_70_plus) return 'ELDERLY 70+'
  return 'NORMAL'
}

async function createSession(env, mobile) {
  await supabaseRequest(env, '/rest/v1/whatsapp_complaint_sessions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      mobile_no: mobile,
      step: 'LANGUAGE',
      preferred_language: null,
      category_id: null,
      flat_no: null,
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
  console.log('WhatsApp send result:', resultText)
  if (!response.ok) throw new Error(`WhatsApp API error: ${resultText}`)

  try {
    return JSON.parse(resultText)
  } catch {
    return { raw: resultText }
  }
}

function invalidChoice(lang) {
  return lang === 'HI' ? 'कृपया सही विकल्प चुनें।' : 'Please select a valid option.'
}
function cancelMessage(lang) {
  return lang === 'HI'
    ? 'शिकायत दर्ज नहीं की गई।\n\nनई शिकायत के लिए *Hi* भेजें।\n\n— RWA Pocket-A'
    : 'The complaint was not registered.\n\nSend *Hi* to start a new complaint.\n\n— RWA Pocket-A'
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
