// RWA Pocket-A WhatsApp Complaint Bot
// Source-controlled Cloudflare Worker. Secrets are configured in Cloudflare, never in this file.

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
    const next = categoryId === 3 ? 'URGENT' : categoryId === 4 ? 'INCIDENT_DATETIME' : 'ISSUE_TYPE'
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

    if (text === '1') {
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
      elderly_citizen_70_plus: text === '1',
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
    if (text === '1') {
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
    await deleteSession(env, mobile)
    await sendWhatsAppMessage(env, mobile, complaintCreatedMessage(complaint, current))
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
    return '*शिकायत का प्रकार चुनें:*\n\n*1.* 🔧 Plumber\n*2.* ⚡ Electrician\n*3.* 🚰 Sewerage Issue\n*4.* 📹 Camera Recording\n*5.* 🌿 Horticulture\n*6.* 💡 Street Light\n\nकृपया केवल विकल्प संख्या भेजें।'
  }
  return '*Please select the complaint category:*\n\n*1.* 🔧 Plumber\n*2.* ⚡ Electrician\n*3.* 🚰 Sewerage Issue\n*4.* 📹 Camera Recording\n*5.* 🌿 Horticulture\n*6.* 💡 Street Light\n\nPlease send only the option number.'
}

const CATEGORIES = {
  1: { id: 1, label: 'Plumber', hi: 'प्लंबर' },
  2: { id: 2, label: 'Electrician', hi: 'इलेक्ट्रीशियन' },
  3: { id: 3, label: 'Sewerage Issue', hi: 'सीवरेज समस्या' },
  4: { id: 4, label: 'Camera Recording', hi: 'कैमरा रिकॉर्डिंग' },
  5: { id: 5, label: 'Horticulture', hi: 'हॉर्टिकल्चर' },
  6: { id: 6, label: 'Street Light', hi: 'स्ट्रीट लाइट' }
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
  const criteria = {
    1: {
      en: '• No water supply\n• Unstoppable water flow\n• Major pipe/tank/common-line leakage',
      hi: '• पानी की सप्लाई बिल्कुल नहीं है\n• पानी का बहाव बंद नहीं हो रहा\n• Major pipe/tank/common-line leakage'
    },
    2: {
      en: '• No electricity\n• Short circuit / sparking\n• Any hazardous electrical situation',
      hi: '• बिजली बिल्कुल नहीं है\n• Short circuit / sparking\n• कोई खतरनाक electrical situation'
    },
    3: {
      en: '• Sewage overflowing\n• Sewer water entering a flat/common area\n• Major blockage causing continuous accumulation',
      hi: '• सीवर ओवरफ्लो हो रहा है\n• सीवर का पानी flat/common area में आ रहा है\n• Major blockage से लगातार पानी जमा हो रहा है'
    },
    6: {
      en: '• Exposed/live wire or sparking\n• Damaged/fallen pole creating immediate danger',
      hi: '• खुली/live wire या sparking\n• क्षतिग्रस्त/गिरा हुआ pole जिससे तत्काल खतरा हो'
    }
  }[categoryId]
  if (lang === 'HI') return `क्या यह *Urgent Problem* है?\n\nUrgent केवल इन स्थितियों में चुनें:\n${criteria.hi}\n\n*1.* Yes — Urgent\n*2.* No — Normal`
  return `Is this an *Urgent Problem*?\n\nChoose Urgent only for:\n${criteria.en}\n\n*1.* Yes — Urgent\n*2.* No — Normal`
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
    ? 'क्या आप *70 वर्ष या उससे अधिक आयु के Elderly Citizen* हैं?\n\n*1.* Yes\n*2.* No'
    : 'Are you an *Elderly Citizen (70 years or above)*?\n\n*1.* Yes\n*2.* No'
}

function addNoteQuestion(lang) {
  return lang === 'HI'
    ? 'क्या आप समस्या के बारे में कोई *Note/Description* जोड़ना चाहते हैं?\n\n*1.* Yes\n*2.* No'
    : 'Would you like to add any *note/description* about the problem?\n\n*1.* Yes\n*2.* No'
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
  const complaintNo = await generateComplaintNumber(env)
  const now = new Date().toISOString()
  const description = session.description || buildDefaultDescription(session)
  const payload = {
    complaint_no: complaintNo,
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

async function generateComplaintNumber(env) {
  try {
    const result = await supabaseRequest(env, '/rest/v1/rpc/generate_complaint_no', {
      method: 'POST', body: JSON.stringify({})
    })
    if (typeof result === 'string' && result.trim()) return result.trim()
    if (result?.generate_complaint_no) return String(result.generate_complaint_no)
  } catch (error) {
    console.error('Complaint number RPC error:', error)
  }
  return `CMP-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`
}

function complaintCreatedMessage(complaint, session) {
  const lang = session.preferred_language || 'EN'
  const c = getCategoryById(Number(session.category_id))
  const location = session.flat_no || session.location_text || ''
  const priority = getPriorityLabel(session)
  if (lang === 'HI') {
    return `*आदरणीय महोदय/महोदया,*\n\nआपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। ✅\n\n*शिकायत संख्या:* ${complaint.complaint_no}\n*Category:* ${c?.hi}\n*Flat/Location:* ${location}\n*Priority:* ${priority}\n\nSupervisor द्वारा शिकायत प्राप्त करने के बाद आपको सूचित किया जाएगा।\n\nधन्यवाद।\n\n*— RWA Pocket-A*`
  }
  return `*Dear Sir/Madam,*\n\nYour complaint has been registered successfully. ✅\n\n*Complaint No:* ${complaint.complaint_no}\n*Category:* ${c?.label}\n*Flat/Location:* ${location}\n*Priority:* ${priority}\n\nYou will be notified after the Supervisor acknowledges the complaint.\n\nThank you.\n\n*— RWA Pocket-A*`
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
  const result = await response.text()
  console.log('WhatsApp send result:', result)
  if (!response.ok) throw new Error(`WhatsApp API error: ${result}`)
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
