import { useEffect, useRef, useState } from 'react'
import { CheckCheck, ClipboardCheck, MessageCircle, RefreshCw, Send, Trash2 } from 'lucide-react'
import './WebComplaintChat.css'

const API = __WEB_COMPLAINT_API_BASE_URL__
const SITE_KEY = __WEB_TURNSTILE_SITE_KEY__
const PROFILE = 'rwa.web-complaint.profile'
const LAST = 'rwa.web-complaint.last'
const readSaved = key => {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') } catch { return null }
}
const validFlat = x => {
  const s = String(x || '').trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9 /-]{1,24}$/.test(s)
    && !['COMMON AREA','UNKNOWN','N/A','NA','NONE','NOT GIVEN'].includes(s)
}
const mobileNumber = x => {
  const d = String(x || '').replace(/\D/g, '')
  const n = d.length === 10 ? `91${d}` : d
  return /^91[6-9]\d{9}$/.test(n) ? n : null
}
const statusLabel = {
  OPEN:'Waiting / प्रतीक्षा', ACKNOWLEDGED:'Acknowledged / स्वीकार',
  ASSIGNED:'Assigned / सौंपा', IN_PROGRESS:'In progress / कार्य जारी',
  WORK_DONE:'Work completed / कार्य पूरा', RESOLVED:'Work completed / कार्य पूरा',
  CLOSED:'Closed / बंद', REOPENED:'Reopened / पुनः खुली'
}
export default function WebComplaintChat() {
  const [profile, setProfile] = useState(() => readSaved(PROFILE) || {})
  const [last, setLast] = useState(() => readSaved(LAST))
  const [config, setConfig] = useState(null)
  const [step, setStep] = useState('LOADING')
  const [draft, setDraft] = useState({})
  const [messages, setMessages] = useState([])
  const [entry, setEntry] = useState('')
  const [pending, setPending] = useState(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const widget = useRef(null)
  const widgetId = useRef(null)
  const end = useRef(null)
  const seq = useRef(0)
  const submitting = useRef(false)
  const add = (side, text) => {
    seq.current += 1
    setMessages(current => [...current, { id:seq.current, side, text }])
  }
  const bot = text => add('bot', text)
  const resident = text => add('resident', text)
  const api = async (path, opts = {}) => {
    const response = await fetch(`${API}${path}`, { cache:'no-store', ...opts })
    const data = await response.json()
    if (!response.ok || !data.ok) throw Error(data.error || 'Complaint service unavailable.')
    return data
  }
  useEffect(() => { end.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, step])

  useEffect(() => {
    let active = true
    if (!API) {
      setStep('UNAVAILABLE')
      bot('This preview needs a staging complaint API. / यह परीक्षण अभी सर्वर से नहीं जुड़ा है।')
      return
    }
    api('/api/web-complaints/config')
      .then(data => {
        if (!active) return
        setConfig(data)
        setStep('CATEGORY')
        bot('Namaste! Welcome to RWA Pocket-A Complaint Chat.\nनमस्ते! RWA Pocket-A शिकायत चैट में स्वागत है।\n\nChoose complaint category / शिकायत का प्रकार चुनें:')
      })
      .catch(() => {
        if (!active) return
        setStep('UNAVAILABLE')
        bot('Complaint service unavailable. Please try again later.\nशिकायत सेवा अभी उपलब्ध नहीं है।')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!SITE_KEY || !widget.current) return
    let cancelled = false
    const mount = () => {
      if (cancelled || !window.turnstile || !widget.current || widgetId.current != null) return
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey:SITE_KEY, theme:'light',
        callback:t => { if (!cancelled) setToken(t) },
        'expired-callback':() => { if (!cancelled) setToken('') },
        'error-callback':() => { if (!cancelled) setToken('') }
      })
    }
    if (window.turnstile) mount()
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = mount
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      if (widgetId.current != null && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [])
  const resetCaptcha = () => {
    setToken('')
    if (window.turnstile && widgetId.current != null) window.turnstile.reset(widgetId.current)
  }

  useEffect(() => {
    if (!pending || !token || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    api('/api/web-complaints/register', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ ...pending, turnstile_token:token })
    })
      .then(result => {
        setReceipt(result)
        setLast({ ticket:result.ticket, complaint_no:result.complaint_no })
        window.localStorage.setItem(LAST, JSON.stringify({ ticket:result.ticket, complaint_no:result.complaint_no }))
        const saved = { mobile_no:pending.mobile_no, flat_no:pending.flat_no }
        setProfile(saved)
        window.localStorage.setItem(PROFILE, JSON.stringify(saved))
        setStep('DONE')
        bot(`✅ Complaint registered / शिकायत दर्ज हुई!\n\nNo / संख्या: ${result.complaint_no}\nFlat / फ्लैट: ${result.flat_no}\nQueue position / कतार: ${result.queue_position || '—'}${result.work_start_otp ? `\nWork-start OTP / कार्य शुरू करने का OTP: ${result.work_start_otp}\nOnly tell the plumber when they arrive. / प्लंबर आने पर ही बताएं।` : ''}\n\nKeep this complaint number for reference. / शिकायत नंबर संभालकर रखें।`)
        setPending(null)
      })
      .catch(e => {
        setError(e.message)
        setStep('RETRY')
        bot('Complaint not registered. Please retry / शिकायत दर्ज नहीं हुई। फिर प्रयास करें।')
      })
      .finally(() => { submitting.current = false; setBusy(false); resetCaptcha() })
  }, [pending, token])

  const register = data => {
    const full = { ...data, ticket:window.crypto.randomUUID() }
    setPending(full)
    setStep('VERIFY')
    bot(SITE_KEY
      ? 'Registering complaint securely... / शिकायत सुरक्षित रूप से दर्ज हो रही है…'
      : 'Browser security is not configured. / ब्राउज़र सुरक्षा अभी कॉन्फ़िगर नहीं है।')
    if (!SITE_KEY) setStep('UNAVAILABLE')
  }
  const afterDetails = data => {
    const mobile = mobileNumber(profile.mobile_no)
    if (mobile) register({ ...data, mobile_no:mobile })
    else {
      setStep('MOBILE')
      bot('Enter your 10-digit contact mobile number (no login or OTP).\nअपना 10 अंकों का संपर्क मोबाइल नंबर भेजें। लॉगिन या OTP नहीं चाहिए।')
    }
  }
  const afterFlat = data => {
    if (data.category_id === 4) {
      setStep('DATE')
      bot('Please provide approximate date and time for camera recording.\nकैमरा रिकॉर्डिंग का अनुमानित दिनांक और समय भेजें।\nExample: 20 Sep, 8:30 PM')
    } else if ([5,7].includes(data.category_id)) {
      setStep('ISSUE')
      bot('Select issue type / समस्या का प्रकार चुनें:')
    } else afterDetails(data)
  }
  const confirmDone = async resolved => {
    if (!last?.ticket) return
    setBusy(true)
    try {
      const result = await api('/api/web-complaints/confirm', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ ticket:last.ticket, resolved })
      })
      setStep('DONE')
      bot(result.status === 'CLOSED' ? 'Complaint closed. / शिकायत बंद की गई है।' : 'Complaint reopened. / शिकायत फिर से खोली गई है।')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const choose = text => {
    if (busy || !config || !['CATEGORY','FLAT','DATE','ISSUE','MOBILE','CONFIRM'].includes(step)) return
    const v = String(text).trim()
    if (!v) return
    resident(v); setEntry('')
    if (step === 'CATEGORY') {
      const category = config.categories.find(x => x.option === v)
      if (!category) return bot('Please choose a valid option / सही विकल्प चुनें।')
      const next = { category_id:category.id, flat_no:validFlat(profile.flat_no) ? profile.flat_no : null }
      setDraft(next)
      if (!next.flat_no) {
        setStep('FLAT')
        bot(`Selected / चुना: ${category.en} / ${category.hi}\n\nEnter your flat number / अपना फ्लैट नंबर भेजें। Example: 36-D`)
      } else afterFlat(next)
    } else if (step === 'FLAT') {
      if (!validFlat(v)) return bot('Enter a valid flat e.g. 36-D / सही फ्लैट नंबर भेजें।')
      const next = { ...draft, flat_no:v.toUpperCase() }
      setDraft(next); afterFlat(next)
    } else if (step === 'DATE') {
      if (v.length < 3 || v.length > 100) return bot('Enter a valid date and time / सही दिनांक और समय भेजें।')
      const next = { ...draft, incident_datetime_text:v }
      setDraft(next); afterDetails(next)
    } else if (step === 'ISSUE') {
      const issue = config.issue_types[String(draft.category_id)]?.find(x => x.option === v)
      if (!issue) return bot('Choose a valid issue number / सही समस्या नंबर चुनें।')
      const next = { ...draft, issue_option:issue.option, issue_type:issue.code }
      setDraft(next); afterDetails(next)
    } else if (step === 'MOBILE') {
      const mobile = mobileNumber(v)
      if (!mobile) return bot('Enter a valid Indian contact number / सही भारतीय मोबाइल नंबर भेजें।')
      register({ ...draft, mobile_no:mobile })
    } else if (step === 'CONFIRM') {
      if (v !== '1' && v !== '2') return bot('1 Yes / हाँ, 2 No / नहीं')
      confirmDone(v === '1')
    }
  }
  const checkStatus = async () => {
    if (!last?.ticket || busy) return
    setBusy(true); setError('')
    try {
      const result = await api(`/api/web-complaints/status?ticket=${encodeURIComponent(last.ticket)}`)
      setReceipt(result)
      bot(`Complaint / शिकायत: ${result.complaint_no}\nStatus / स्थिति: ${statusLabel[result.status] || result.status}${result.work_start_otp ? `\nWork-start OTP: ${result.work_start_otp}` : ''}`)
      if (['WORK_DONE','RESOLVED'].includes(result.status)) {
        setStep('CONFIRM')
        bot('Is your problem resolved? / क्या समस्या हल हुई?\n1. Yes / हाँ\n2. No / नहीं')
      }
    } catch(e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const restart = () => {
    setPending(null); setReceipt(null); setDraft({}); setEntry('')
    setMessages([]); setError(''); setStep('CATEGORY')
    bot('Select complaint category / शिकायत का प्रकार चुनें:')
  }
  const forget = () => {
    if (!window.confirm('Forget saved flat, contact number and complaint ticket from this browser?')) return
    window.localStorage.removeItem(PROFILE); window.localStorage.removeItem(LAST)
    setProfile({}); setLast(null); restart()
  }
  const options = step === 'CATEGORY' ? config?.categories || []
    : step === 'ISSUE' ? config?.issue_types[String(draft.category_id)] || []
    : step === 'CONFIRM' ? [{ option:'1',en:'Yes',hi:'हाँ' },{ option:'2',en:'No',hi:'नहीं' }]
    : []

  return <div className="webchat-root">
    <header className="webchat-header">
      <div className="webchat-logo"><MessageCircle size={25}/></div>
      <div className="webchat-title"><strong>RWA Pocket-A</strong><small><i/> Complaint Assistant • शिकायत सहायता</small></div>
      <button type="button" title="Forget saved details" onClick={forget}><Trash2 size={17}/></button>
    </header>
    <div className="webchat-notice">Private chat-style form • No login required / लॉगिन की जरूरत नहीं</div>
    <main className="webchat-messages" aria-label="Complaint conversation" aria-live="polite">
      <div className="webchat-today">Today • आज</div>
      {messages.map(m => <div className={`webchat-row ${m.side}`} key={m.id}>
        {m.side === 'bot' && <div className="webchat-avatar">R</div>}
        <div className="webchat-bubble">{m.text}<small>{m.side === 'resident' ? <CheckCheck size={12}/> : 'RWA'}</small></div>
      </div>)}
      {step === 'CATEGORY' && validFlat(profile.flat_no) && <p className="webchat-saved">Saved on this device / इस डिवाइस का फ्लैट: <strong>{profile.flat_no}</strong></p>}
      {options.length > 0 && <div className="webchat-options">
        {options.map(x => <button type="button" key={x.option} disabled={busy} onClick={() => choose(x.option)}>
          <span className="webchat-option-content"><span className="webchat-option-main"><strong className="webchat-option-index">{x.option}.</strong> {x.icon ? `${x.icon} ` : ''}{x.en}</span><small>{x.hi}</small></span>
        </button>)}
      </div>}
      {receipt && <div className="webchat-receipt"><ClipboardCheck size={17}/> <strong>{receipt.complaint_no}</strong> • {statusLabel[receipt.status] || receipt.status}</div>}
      {error && <p className="webchat-error" role="alert">{error}</p>}
      {step === 'VERIFY' && <p className="webchat-wait">Browser verification / ब्राउज़र सत्यापन…</p>}
      {step === 'RETRY' && <button className="webchat-action" type="button" onClick={() => { setStep('VERIFY'); resetCaptcha() }} disabled={busy}>Retry registration / फिर प्रयास करें</button>}
      {step === 'DONE' && <button className="webchat-action" type="button" onClick={restart}>New complaint / नई शिकायत</button>}
      {last && !['VERIFY','RETRY','CONFIRM'].includes(step) && <button className="webchat-status" onClick={checkStatus} type="button" disabled={busy}><RefreshCw size={15}/> Check last complaint / पिछली शिकायत देखें</button>}
      <div ref={end}/>
    </main>
    <section className="webchat-footer">
      {SITE_KEY ? <div className="webchat-turnstile" ref={widget}/> : <p className="webchat-warning">Security verification not configured / सुरक्षा सत्यापन उपलब्ध नहीं</p>}
      <form onSubmit={e => { e.preventDefault(); choose(entry) }} className="webchat-composer">
        <input aria-label="Your reply" type={step === 'MOBILE' ? 'tel' : 'text'}
          value={entry} onChange={e => setEntry(e.target.value)} autoComplete="off" maxLength={step === 'DATE' ? 100 : 40}
          placeholder={['CATEGORY','ISSUE','CONFIRM'].includes(step) ? 'Type option number / विकल्प चुनें' : 'Type a message / संदेश भेजें'}
          disabled={busy || !['CATEGORY','FLAT','DATE','ISSUE','MOBILE','CONFIRM'].includes(step)}/>
        <button type="submit" aria-label="Send reply" disabled={!entry.trim() || busy || !['CATEGORY','FLAT','DATE','ISSUE','MOBILE','CONFIRM'].includes(step)}><Send size={20}/></button>
      </form>
      <div className="webchat-credit">Developed and maintained by RWA Pocket-A.<br/>RWA Pocket-A द्वारा विकसित एवं रखरखाव।</div>
    </section>
  </div>
}
