import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BellRing, Check, Clock, RefreshCw } from 'lucide-react'
import { supabase } from './supabase'
import './ComplaintLiveDisplay.css'

const LABELS = {
  PLUMBER: 'Plumber',
  PLUMBING: 'Plumber',
  ELECTRICIAN: 'Electrician',
  ELECTRICAL: 'Electrician',
  HOUSEKEEPING_GARBAGE: 'Housekeeping/Garbage',
  SEWERAGE_ISSUE: 'Sewerage',
  CAMERA_RECORDING: 'Camera Recording',
  HORTICULTURE: 'Horticulture',
  STREET_LIGHT: 'Street Light',
  OTHER: 'Other'
}

function ComplaintLiveDisplay({ onBack, onOpenComplaints, workerMode = false }) {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)
  const [otpFor, setOtpFor] = useState(null)
  const [otp, setOtp] = useState('')
  const knownComplaintsRef = useRef(new Map())

  const load = async () => {
    setError('')
    const { data, error: loadError } = await supabase
      .from('complaints')
      .select('*, service_categories(id,name)')
      .in('status', workerMode ? ['OPEN', 'REOPENED', 'IN_PROGRESS'] : ['OPEN', 'REOPENED', 'IN_PROGRESS', 'WORK_DONE', 'CLOSED'])
      .order('created_at', { ascending: true })

    if (loadError) setError(loadError.message)
    else setComplaints(workerMode ? (data || []).filter(c => Number(c.category_id) === 1) : (data || []))
    setLoading(false)
  }

  const playComplaintAlert = (event, complaint) => {
    if (workerMode || typeof window === 'undefined') return

    const categoryKey = complaint?.service_categories?.name
    const category = LABELS[categoryKey] || ({
      1: 'प्लंबर',
      2: 'इलेक्ट्रीशियन',
      3: 'सीवरेज',
      4: 'कैमरा रिकॉर्डिंग',
      5: 'हॉर्टिकल्चर',
      6: 'स्ट्रीट लाइट',
      7: 'हाउसकीपिंग',
      8: 'अन्य'
    })[Number(complaint?.category_id)] || 'अन्य'

    const location = complaint?.flat_no || complaint?.location_text || 'कॉमन एरिया'
    const details = `${location}, ${category}`

    const messages = {
      INSERT: complaint?.is_urgent
        ? `तत्काल शिकायत प्राप्त हुई है। ${details}। कृपया कंप्लेंट सेंटर तुरंत देखें।`
        : `नई शिकायत प्राप्त हुई है। ${details}। कृपया कंप्लेंट सेंटर देखें।`,
      IN_PROGRESS: `${details}। शिकायत पर काम शुरू हो गया है।`,
      WORK_DONE: `${details}। शिकायत का काम पूरा हो गया है। निवासी की पुष्टि की प्रतीक्षा है।`,
      CLOSED: `${details}। शिकायत सफलतापूर्वक बंद हो गई है।`,
      REOPENED: `${details}। निवासी ने शिकायत दोबारा खोली है।`
    }

    const message = event === 'INSERT' ? messages.INSERT : messages[complaint?.status]
    if (!message) return

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        const ctx = new AudioContext()
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.frequency.value = complaint?.status === 'REOPENED' || complaint?.is_urgent ? 880 : 660
        gain.gain.setValueAtTime(0.22, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65)
        oscillator.start()
        oscillator.stop(ctx.currentTime + 0.65)
      }
    } catch (e) {
      console.warn('Complaint alert tone unavailable:', e)
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const speech = new SpeechSynthesisUtterance(message)
      speech.lang = 'hi-IN'
      speech.rate = 0.92
      speech.volume = 1
      window.speechSynthesis.speak(speech)
    }
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('complaint-live-display')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, payload => {
        if (payload.eventType === 'INSERT') {
          playComplaintAlert('INSERT', payload.new)
        } else if (payload.eventType === 'UPDATE' && payload.old?.status !== payload.new?.status) {
          playComplaintAlert('UPDATE', payload.new)
        }
        load()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  const statusCounts = useMemo(() => ({
    waiting: complaints.filter(c => ['OPEN', 'REOPENED'].includes(c.status)).length,
    inProgress: complaints.filter(c => c.status === 'IN_PROGRESS').length,
    workDone: complaints.filter(c => c.status === 'WORK_DONE').length,
    closed: complaints.filter(c => c.status === 'CLOSED').length
  }), [complaints])

  const ordered = useMemo(() => [...complaints].sort((a, b) => {
    const priority = x => x.is_urgent ? 0 : x.elderly_citizen_70_plus ? 1 : 2
    return priority(a) - priority(b) || new Date(a.created_at) - new Date(b.created_at)
  }), [complaints])

  const acknowledge = async complaint => {
    try {
      setWorkingId(complaint.id)
      setError('')

      const response = await fetch(
        'https://rwa-complaint-bot.singh-virendra18.workers.dev/api/complaints/acknowledge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ complaint_id: complaint.id })
        }
      )

      const result = await response.json()
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Unable to acknowledge complaint.')
      }
      if (result.whatsapp_sent === false) {
        setError(result.warning || 'Complaint acknowledged, but WhatsApp notification could not be sent.')
      }

      await load()
    } catch (e) {
      setError(e.message || 'Unable to acknowledge complaint.')
    } finally {
      setWorkingId(null)
    }
  }

  const complaintAction = async (complaint, action, enteredOtp = null) => {
    try {
      setWorkingId(complaint.id)
      setError('')
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `https://rwa-complaint-bot.singh-virendra18.workers.dev/api/complaints/${action}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({ complaint_id: complaint.id, ...(enteredOtp ? { otp: enteredOtp } : {}) })
        }
      )
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to update complaint.')
      setOtpFor(null)
      setOtp('')
      await load()
    } catch (e) {
      setError(e.message || 'Unable to update complaint.')
    } finally {
      setWorkingId(null)
    }
  }

  const formatDuration = (start, end) => {
    if (!start || !end) return '—'
    const mins = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000))
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    const rest = mins % 60
    return rest ? `${hours} hr ${rest} min` : `${hours} hr`
  }

  const formatTime = value => new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(value))

  return (
    <div className="live-page">
      <header className="live-header">
        <button onClick={onBack}><ArrowLeft size={18}/> Back</button>
        <div><h1>{workerMode ? 'Plumber Complaints' : 'Complaint Center'}</h1><p>{workerMode ? 'Plumbing Work Queue' : 'Supervisor Complaint Dashboard'}</p></div>
        <button className="live-refresh" onClick={load}><RefreshCw size={18}/></button>
      </header>

      <main className="live-content">
        <div className="live-summary">
          {workerMode ? (
            <div><BellRing size={18}/><strong>{statusCounts.waiting}</strong><span>Waiting</span></div>
          ) : (
            <div className="live-status-summary">
              <span className="summary-waiting"><strong>{statusCounts.waiting}</strong><small>Waiting</small></span>
              <span className="summary-progress"><strong>{statusCounts.inProgress}</strong><small>In Progress</small></span>
              <span className="summary-workdone"><strong>{statusCounts.workDone}</strong><small>Work Done</small></span>
              <span className="summary-closed"><strong>{statusCounts.closed}</strong><small>Closed</small></span>
            </div>
          )}
          {!workerMode && <button onClick={onOpenComplaints}>Dashboard →</button>}
        </div>

        {error && <div className="live-error">{error}</div>}
        {loading ? <div className="live-empty">Loading complaints...</div> :
          ordered.length === 0 ? <div className="live-empty"><Check size={32}/><strong>All caught up</strong><span>{workerMode ? 'No plumbing complaints are waiting for work.' : 'No active complaints to display.'}</span></div> :
          <div className="live-grid">
            {ordered.map(c => {
              const category = c.service_categories?.name || 'OTHER'
              const label = LABELS[category] || 'Other'
              const type = category === 'PLUMBER' || category === 'PLUMBING' ? 'plumber'
                : category === 'ELECTRICIAN' || category === 'ELECTRICAL' ? 'electrician'
                : category === 'HOUSEKEEPING_GARBAGE' ? 'housekeeping'
                : category === 'SEWERAGE_ISSUE' ? 'sewerage'
                : category === 'CAMERA_RECORDING' ? 'camera'
                : category === 'HORTICULTURE' ? 'horticulture'
                : category === 'STREET_LIGHT' ? 'streetlight'
                : 'other'
              return (
                <article className={`live-card ${type}`} key={c.id}>
                  <div className="live-card-top">
                    <span className="live-number">{c.complaint_no}</span>
                    <span className="live-category">{label}</span>
                    <span className="live-time"><Clock size={13}/>{formatTime(c.created_at)}</span>
                  </div>
                  <div className="live-flat">{c.flat_no || c.location_text || 'Common Area'}</div>
                  <div className="live-badges">
                    {c.is_urgent && <span className="urgent-badge">URGENT</span>}
                    
                  </div>
                  {!['WORK_DONE', 'CLOSED'].includes(c.status) && (
                    <p>{c.description || c.issue_type?.replaceAll('_', ' ') || ''}</p>
                  )}
                  {!workerMode && ['WORK_DONE', 'CLOSED'].includes(c.status) && (
                    <div className="live-work-result">
                      <span><strong>Time Taken:</strong> {formatDuration(c.work_started_at, c.work_done_at)}</span>
                      <span><strong>Rating:</strong> {c.resident_rating ? `${c.resident_rating}/5 ⭐` : 'Pending'}</span>
                    </div>
                  )}
                  {workerMode ? (
                    <>
                      {(c.status === 'OPEN' || c.status === 'REOPENED') && (
                        otpFor === c.id ? (
                          <div className="worker-otp-box">
                            <input
                              inputMode="numeric"
                              maxLength={4}
                              value={otp}
                              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder="4-digit OTP"
                            />
                            <button disabled={workingId === c.id || otp.length !== 4} onClick={() => complaintAction(c, 'start', otp)}>
                              VERIFY & START
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setOtpFor(c.id); setOtp('') }}>START</button>
                        )
                      )}
                      {c.status === 'IN_PROGRESS' && (
                        <button disabled={workingId === c.id} onClick={() => complaintAction(c, 'done')}>
                          {workingId === c.id ? 'Saving...' : 'DONE'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {Number(c.category_id) !== 1 && ['OPEN', 'REOPENED'].includes(c.status) && (
                        <button disabled={workingId === c.id} onClick={() => complaintAction(c, 'supervisor-done')}>
                          {workingId === c.id ? 'Saving...' : 'WORK DONE'}
                        </button>
                      )}
                      {!((Number(c.category_id) !== 1) && ['OPEN', 'REOPENED'].includes(c.status)) && (
                        <span className={`live-current-status status-${c.status.toLowerCase().replaceAll('_', '-')}`}>
                          {c.status === 'OPEN' ? '● WAITING' :
                           c.status === 'CLOSED' ? '✓ CLOSED' :
                           c.status === 'IN_PROGRESS' ? '● IN PROGRESS' :
                           c.status === 'WORK_DONE' ? '✓ WORK DONE' :
                           c.status === 'REOPENED' ? '● REOPENED' :
                           c.status.replaceAll('_', ' ')}
                        </span>
                      )}
                    </>
                  )}
                </article>
              )
            })}
          </div>
        }
      </main>
    </div>
  )
}

export default ComplaintLiveDisplay
