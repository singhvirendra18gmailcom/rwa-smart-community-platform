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

function ComplaintLiveDisplay({ onBack, onOpenComplaints }) {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = async () => {
    setError('')
    const { data, error: loadError } = await supabase
      .from('complaints')
      .select('*, service_categories(id,name)')
      .in('status', ['OPEN', 'REOPENED'])
      .order('created_at', { ascending: true })

    if (loadError) setError(loadError.message)
    else setComplaints(data || [])
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

  const ordered = useMemo(() => [...complaints].sort((a, b) => {
    const priority = x => x.is_urgent ? 0 : x.elderly_citizen_70_plus ? 1 : 2
    return priority(a) - priority(b) || new Date(a.created_at) - new Date(b.created_at)
  }), [complaints])

  const normalizeMobile = mobile => {
    let number = String(mobile || '').replace(/\D/g, '')
    if (number.length === 10) number = `91${number}`
    return number
  }

  const workerName = category => {
    if (['PLUMBER', 'PLUMBING'].includes(category)) return 'प्लंबर'
    if (['ELECTRICIAN', 'ELECTRICAL', 'STREET_LIGHT'].includes(category)) return 'इलेक्ट्रीशियन'
    if (category === 'HOUSEKEEPING_GARBAGE') return 'हाउसकीपिंग कर्मचारी'
    if (category === 'SEWERAGE_ISSUE') return 'सीवरेज कर्मचारी'
    if (category === 'CAMERA_RECORDING') return 'सुरक्षा टीम'
    if (category === 'HORTICULTURE') return 'माली'
    return 'संबंधित कर्मचारी'
  }

  const acknowledgementMessage = complaint => {
    const category = complaint.service_categories?.name || 'OTHER'
    return `*आदरणीय महोदय/महोदया,*\n\nआपकी शिकायत *${complaint.complaint_no}* प्राप्त कर ली गई है। ✅\n\nहमारा *${workerName(category)}* जल्द ही आपकी शिकायत पर कार्यवाही करेगा।\n\n*शिकायत संख्या:* ${complaint.complaint_no}\n\nआपके धैर्य एवं सहयोग के लिए धन्यवाद।\n\n*— RWA Pocket-A*`
  }

  const acknowledge = async complaint => {
    try {
      setWorkingId(complaint.id)
      setError('')
      const phone = normalizeMobile(complaint.mobile_no)
      const whatsappWindow = phone ? window.open('', '_blank') : null
      const { error: updateError } = await supabase
        .from('complaints')
        .update({ status: 'ACKNOWLEDGED', updated_at: new Date().toISOString() })
        .eq('id', complaint.id)
      if (updateError) {
        if (whatsappWindow) whatsappWindow.close()
        throw updateError
      }
      if (phone && whatsappWindow) {
        whatsappWindow.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(acknowledgementMessage(complaint))}`
      }
      await load()
    } catch (e) {
      setError(e.message || 'Unable to acknowledge complaint.')
    } finally {
      setWorkingId(null)
    }
  }

  const formatTime = value => new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(value))

  return (
    <div className="live-page">
      <header className="live-header">
        <button onClick={onBack}><ArrowLeft size={18}/> Back</button>
        <div><h1>Live Complaints</h1><p>Supervisor Attention Board</p></div>
        <button className="live-refresh" onClick={load}><RefreshCw size={18}/></button>
      </header>

      <main className="live-content">
        <div className="live-summary">
          <div><BellRing size={18}/><strong>{ordered.length}</strong><span>Waiting</span></div>
          <button onClick={onOpenComplaints}>Open Full Dashboard</button>
        </div>

        {error && <div className="live-error">{error}</div>}
        {loading ? <div className="live-empty">Loading complaints...</div> :
          ordered.length === 0 ? <div className="live-empty"><Check size={32}/><strong>All caught up</strong><span>No new complaints need acknowledgement.</span></div> :
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
                    {c.elderly_citizen_70_plus && <span className="elderly-badge">70+</span>}
                  </div>
                  <p>{c.description || c.issue_type?.replaceAll('_', ' ') || 'Complaint received'}</p>
                  <button disabled={workingId === c.id} onClick={() => acknowledge(c)}>
                    <Check size={18}/>{workingId === c.id ? 'Acknowledging...' : 'OK · Acknowledge'}
                  </button>
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
