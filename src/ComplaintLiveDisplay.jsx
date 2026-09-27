import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    load()
    const channel = supabase
      .channel('complaint-live-display')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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

  const workerAction = async (complaint, action, enteredOtp = null) => {
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
        <div><h1>{workerMode ? 'Plumber Complaints' : 'Live Complaints'}</h1><p>{workerMode ? 'Plumbing Work Queue' : 'Supervisor Live Status Board'}</p></div>
        <button className="live-refresh" onClick={load}><RefreshCw size={18}/></button>
      </header>

      <main className="live-content">
        <div className="live-summary">
          {workerMode ? (
            <div><BellRing size={18}/><strong>{statusCounts.waiting}</strong><span>Waiting</span></div>
          ) : (
            <div className="live-status-summary">
              <span><strong>{statusCounts.waiting}</strong> Waiting</span>
              <span><strong>{statusCounts.inProgress}</strong> In Progress</span>
              <span><strong>{statusCounts.workDone}</strong> Work Done</span>
              <span><strong>{statusCounts.closed}</strong> Closed</span>
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
                  <p>{c.description || c.issue_type?.replaceAll('_', ' ') || ''}</p>
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
                            <button disabled={workingId === c.id || otp.length !== 4} onClick={() => workerAction(c, 'start', otp)}>
                              VERIFY & START
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setOtpFor(c.id); setOtp('') }}>START</button>
                        )
                      )}
                      {c.status === 'IN_PROGRESS' && (
                        <button disabled={workingId === c.id} onClick={() => workerAction(c, 'done')}>
                          {workingId === c.id ? 'Saving...' : 'DONE'}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="live-current-status">{c.status === 'OPEN' ? 'WAITING' : c.status.replaceAll('_', ' ')}</span>
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
