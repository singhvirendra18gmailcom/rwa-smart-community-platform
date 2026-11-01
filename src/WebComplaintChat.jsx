import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, LoaderCircle, MoreVertical, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react'
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
function ChatHeader({ serviceReady, serviceUnavailable, menuOpen, onToggleMenu, onForget }) {
  return (
    <header className="webchat-header">
      <div className="webchat-brand-avatar" aria-hidden="true">R</div>
      <div className="webchat-brand-copy">
        <strong>RWA Pocket-A</strong>
        <span className="webchat-brand-subtitle">
          <span className={`webchat-status-dot ${serviceReady ? 'ready' : serviceUnavailable ? 'unavailable' : 'loading'}`} />
          Complaint Assistant • शिकायत सहायता
        </span>
      </div>
      <div className="webchat-menu-wrap">
        <button type="button" className="webchat-menu-trigger" onClick={onToggleMenu}
          aria-label="Chat options" aria-expanded={menuOpen} aria-haspopup="menu">
          <MoreVertical size={21} />
        </button>
        {menuOpen && (
          <div className="webchat-menu-panel" role="menu">
            <div className="webchat-menu-status">
              {serviceReady ? 'Service available / सेवा उपलब्ध' : serviceUnavailable ? 'Service unavailable / सेवा बंद' : 'Connecting / कनेक्ट हो रहा है'}
            </div>
            <button type="button" role="menuitem" onClick={onForget}>
              <Trash2 size={16} /> Forget saved details / विवरण हटाएं
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function ChatBubble({ message }) {
  const time = new Date(message.time || Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return (
    <div className={`webchat-row ${message.side}`} role="listitem">
      <div className="webchat-bubble">
        <span className="webchat-bubble-content">{message.text}</span>
        <span className="webchat-message-time">{time}</span>
      </div>
    </div>
  )
}

function CategoryChoices({ choices, onChoose, disabled, label }) {
  return (
    <div className="webchat-choices" aria-label={label}>
      {choices.map(option => (
        <button type="button" className="webchat-choice" key={option.option}
          disabled={disabled} onClick={() => onChoose(option.option)}
          aria-label={`${option.option}. ${option.en} / ${option.hi}`}>
          <span className="webchat-choice-index">{option.option}.</span>
          <span className="webchat-choice-copy">
            <strong><span aria-hidden="true">{option.icon || ''} </span>{option.en}</strong>
            <span lang="hi">{option.hi}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function ComplaintReceipt({ receipt, categories }) {
  if (!receipt) return null
  const category = categories?.find(item => item.id === Number(receipt.category_id))
  return (
    <section className="webchat-receipt" aria-label="Complaint receipt">
      <div className="webchat-receipt-title"><ClipboardCheck size={19} /> Complaint details / शिकायत विवरण</div>
      <div className="webchat-receipt-grid">
        <span>Complaint No. / शिकायत संख्या</span><strong>{receipt.complaint_no}</strong>
        {category && <><span>Category / श्रेणी</span><strong>{category.en} / {category.hi}</strong></>}
        <span>Flat / फ्लैट</span><strong>{receipt.flat_no}</strong>
        {receipt.queue_position != null && <><span>Queue / कतार क्रम</span><strong>{receipt.queue_position}</strong></>}
        <span>Status / स्थिति</span><strong>{statusLabel[receipt.status] || receipt.status}</strong>
      </div>
      {receipt.work_start_otp && (
        <div className="webchat-otp">
          <small>Plumber work-start OTP / प्लंबर OTP</small>
          <strong>{receipt.work_start_otp}</strong>
          <span>Share only when plumber arrives / प्लंबर आने पर ही बताएं।</span>
        </div>
      )}
    </section>
  )
}

function VerificationArea({ step, configured, widget }) {
  if (step !== 'VERIFY' && step !== 'RETRY') return null
  return (
    <div className="webchat-verify">
      <div className="webchat-verify-heading"><ShieldCheck size={16} /> Secure verification / सुरक्षित सत्यापन</div>
      {configured ? <div ref={widget} className="webchat-turnstile" aria-label="Cloudflare browser verification" /> :
        <p>Security verification is not configured / सुरक्षा सत्यापन उपलब्ध नहीं है।</p>}
    </div>
  )
}

function ChatComposer({ step, entry, setEntry, busy, onSend }) {
  const enabled = !busy && ['CATEGORY','FLAT','DATE','ISSUE','MOBILE','CONFIRM'].includes(step)
  const optionsOnly = ['CATEGORY','ISSUE','CONFIRM'].includes(step)
  return (
    <form className="webchat-composer" onSubmit={e => { e.preventDefault(); onSend(entry) }}>
      <input aria-label="Your reply / आपका जवाब" type="text"
        inputMode={step === 'MOBILE' ? 'tel' : optionsOnly ? 'numeric' : 'text'}
        enterKeyHint="send" autoComplete="off"
        placeholder={optionsOnly ? 'Type option number / विकल्प चुनें' : step === 'FLAT' ? 'Flat number / फ्लैट नंबर' : 'Type a message / संदेश लिखें'}
        value={entry} onChange={e => setEntry(e.target.value)}
        maxLength={step === 'DATE' ? 100 : step === 'FLAT' ? 25 : step === 'MOBILE' ? 18 : optionsOnly ? 3 : 80}
        disabled={!enabled}/>
      <button className="webchat-send" type="submit" aria-label="Send reply / जवाब भेजें"
        disabled={!enabled || !entry.trim()}><Send size={20}/></button>
    </form>
  )
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
  const [menuOpen, setMenuOpen] = useState(false)
  const widget = useRef(null)
  const widgetId = useRef(null)
  const end = useRef(null)
  const chatLog = useRef(null)
  const root = useRef(null)
  const seq = useRef(0)
  const submitting = useRef(false)
  const add = (side, text) => {
    seq.current += 1
    setMessages(current => [...current, { id:seq.current, side, text, time:Date.now() }])
  }
  const bot = text => add('bot', text)
  const resident = text => add('resident', text)
  const api = async (path, opts = {}) => {
    const response = await fetch(`${API}${path}`, { cache:'no-store', ...opts })
    const data = await response.json()
    if (!response.ok || !data.ok) throw Error(data.error || 'Complaint service unavailable.')
    return data
  }
  useEffect(() => {
    const scroller = chatLog.current
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, step, receipt, error])

  // Android keyboard: track the visual viewport instead of scrolling the page
  // underneath the fixed chat composer.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined
    const sync = () => {
      if (!root.current) return
      root.current.style.setProperty('--webchat-visible-height', `${Math.round(viewport.height)}px`)
      root.current.style.setProperty('--webchat-visible-top', `${Math.round(viewport.offsetTop)}px`)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [])

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

  // Only render the Turnstile challenge while it is needed, and clean up
  // the widget on completion or retry. No permanent captcha takes up space.
  useEffect(() => {
    if (step !== 'VERIFY' || !SITE_KEY) return undefined
    let cancelled = false
    const mount = () => {
      if (cancelled || !window.turnstile || !widget.current || widgetId.current != null) return
      try {
        widgetId.current = window.turnstile.render(widget.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: value => { if (!cancelled) setToken(value) },
          'expired-callback': () => { if (!cancelled) setToken('') },
          'error-callback': () => {
            if (cancelled) return
            setToken('')
            setError('Browser verification failed. Please retry / ब्राउज़र सत्यापन विफल रहा।')
            setStep('RETRY')
          }
        })
      } catch {
        if (!cancelled) {
          setError('Unable to load verification / सत्यापन लोड नहीं हो सका।')
          setStep('RETRY')
        }
      }
    }
    let script = document.getElementById('rwa-webchat-turnstile')
    if (!script && !window.turnstile) {
      script = document.createElement('script')
      script.id = 'rwa-webchat-turnstile'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      document.head.appendChild(script)
    }
    if (window.turnstile) mount()
    else script?.addEventListener('load', mount)
    return () => {
      cancelled = true
      script?.removeEventListener('load', mount)
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch {}
        widgetId.current = null
      }
    }
  }, [step])

  useEffect(() => {
    if (step !== 'VERIFY' || !pending || !token || submitting.current) return
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
        bot('✅ Complaint registered successfully! / आपकी शिकायत सफलतापूर्वक दर्ज हो गई है।\nPlease keep your complaint number for reference. / शिकायत नंबर संभालकर रखें।')
        setPending(null)
      })
      .catch(e => {
        setError(e.message)
        setStep('RETRY')
        bot('Complaint not registered. Please retry / शिकायत दर्ज नहीं हुई। फिर प्रयास करें।')
      })
      .finally(() => { submitting.current = false; setBusy(false); setToken('') })
  }, [pending, token, step])

  const register = data => {
    if (submitting.current) return
    const full = { ...data, ticket:window.crypto.randomUUID() }
    setPending(full)
    setError('')
    setToken('')
    if (!SITE_KEY) {
      setStep('UNAVAILABLE')
      bot('Security verification is not configured. Registration is unavailable. / सुरक्षा सत्यापन उपलब्ध नहीं है। शिकायत दर्ज नहीं हो सकती।')
      return
    }
    setStep('VERIFY')
    bot('Please complete secure browser verification below to register your complaint. / शिकायत दर्ज करने के लिए नीचे सुरक्षित सत्यापन पूरा करें।')
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
      setReceipt(current => current ? { ...current, status: result.status } : current)
      bot(result.status === 'CLOSED' ? 'Complaint closed. / शिकायत बंद की गई है।' : 'Complaint reopened. / शिकायत फिर से खोली गई है।')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const choose = text => {
    if (busy || !config || !['CATEGORY','FLAT','DATE','ISSUE','MOBILE','CONFIRM'].includes(step)) return
    const v = String(text).trim()
    if (!v) return
    const pickedCategory = step === 'CATEGORY' ? config.categories.find(x => x.option === v) : null
    const pickedIssue = step === 'ISSUE' ? config.issue_types[String(draft.category_id)]?.find(x => x.option === v) : null
    const displayValue = pickedCategory
      ? `${v}. ${pickedCategory.icon || ''} ${pickedCategory.en}`
      : pickedIssue ? `${v}. ${pickedIssue.en}` : v
    resident(displayValue)
    setEntry('')
    if (step === 'CATEGORY') {
      const category = pickedCategory
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
      const issue = pickedIssue
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
