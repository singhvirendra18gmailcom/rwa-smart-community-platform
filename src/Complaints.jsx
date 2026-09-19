import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  MessageSquareWarning,
  RefreshCw,
  Wrench,
  Zap,
  CircleAlert,
  Clock,
  CheckCircle2
} from 'lucide-react'

import { supabase } from './supabase'
import './Complaints.css'

function Complaints({ onBack }) {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acknowledgingId, setAcknowledgingId] = useState(null)
  const [resolvingId, setResolvingId] = useState(null)

  const [filter, setFilter] = useState('active')

  useEffect(() => {
    loadComplaints()
  }, [])

  const loadComplaints = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: loadError } = await supabase
        .from('complaints')
        .select(`
          *,
          service_categories (
            id,
            name
          )
        `)
        .order('created_at', {
          ascending: false
        })

      if (loadError) {
        throw loadError
      }

      setComplaints(data || [])
    } catch (err) {
      console.error('Load complaints error:', err)

      setError(
        err.message ||
          'Unable to load complaints.'
      )
    } finally {
      setLoading(false)
    }
  }

  const getCategoryName = complaint => {
    return (
      complaint?.service_categories?.name ||
      'OTHER'
    )
  }

  const getCategoryIcon = category => {
    const value =
      category?.toUpperCase() || ''

    if (value === 'PLUMBING') {
      return <Wrench size={21} />
    }

    if (value === 'ELECTRICAL') {
      return <Zap size={21} />
    }

    return <CircleAlert size={21} />
  }

  const getCategoryLabel = category => {
    const value =
      category?.toUpperCase() || ''

    if (value === 'PLUMBING') {
      return 'Plumbing'
    }

    if (value === 'ELECTRICAL') {
      return 'Electrical'
    }

    return 'Other'
  }

  const getHindiCategoryName = category => {
    const value =
      category?.toUpperCase() || ''

    if (value === 'PLUMBING') {
      return 'प्लंबिंग'
    }

    if (value === 'ELECTRICAL') {
      return 'इलेक्ट्रिकल'
    }

    return 'संबंधित सेवा'
  }

  const getHindiWorkerName = category => {
    const value =
      category?.toUpperCase() || ''

    if (value === 'PLUMBING') {
      return 'प्लंबर'
    }

    if (value === 'ELECTRICAL') {
      return 'इलेक्ट्रीशियन'
    }

    return 'संबंधित कर्मचारी'
  }

  const getStatusLabel = status => {
    const value =
      status?.toUpperCase() || 'OPEN'

    if (value === 'OPEN') return 'New'
    if (value === 'REOPENED') return 'Reopened'
    if (value === 'ACKNOWLEDGED') return 'Acknowledged'
    if (value === 'RESOLVED') return 'Resolved'
    if (value === 'CLOSED') return 'Closed'
    if (value === 'ASSIGNED') return 'Acknowledged'
    if (value === 'WORK_DONE') return 'Work Done'

    return value
  }

  const getStatusClass = status => {
    const value =
      status?.toUpperCase() || 'OPEN'

    if (
      value === 'OPEN' ||
      value === 'REOPENED'
    ) {
      return 'new'
    }

    if (
      value === 'ACKNOWLEDGED' ||
      value === 'ASSIGNED' ||
      value === 'WORK_DONE'
    ) {
      return 'acknowledged'
    }

    return 'resolved'
  }

  const getStatusIcon = status => {
    const value =
      status?.toUpperCase()

    if (
      value === 'RESOLVED' ||
      value === 'CLOSED'
    ) {
      return <CheckCircle2 size={16} />
    }

    return <Clock size={16} />
  }

  const formatDateTime = dateValue => {
    if (!dateValue) {
      return ''
    }

    return new Intl.DateTimeFormat(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }
    ).format(new Date(dateValue))
  }

  const formatHindiDateTime = dateValue => {
    if (!dateValue) {
      return ''
    }

    return new Intl.DateTimeFormat(
      'hi-IN',
      {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }
    ).format(new Date(dateValue))
  }

  const normalizeMobileNumber = mobile => {
    if (!mobile) {
      return ''
    }

    let number =
      String(mobile).replace(/\D/g, '')

    if (number.length === 10) {
      number = `91${number}`
    }

    return number
  }

  const buildHindiAcknowledgementMessage = (
    complaint,
    complaintsAhead
  ) => {
    const category =
      getCategoryName(complaint)

    const hindiCategory =
      getHindiCategoryName(category)

    const worker =
      getHindiWorkerName(category)

    let queueText

    if (complaintsAhead > 0) {
      queueText =
        `वर्तमान में आपकी शिकायत से पहले *${hindiCategory} की ${complaintsAhead} शिकायतें* लंबित हैं। ` +
        `हमारा ${worker} यथाशीघ्र आपकी शिकायत पर कार्यवाही करेगा।`
    } else {
      queueText =
        `हमारा ${worker} यथाशीघ्र आपकी शिकायत पर कार्यवाही करेगा।`
    }

    return `*आदरणीय महोदय/महोदया,*

आपकी शिकायत प्राप्त हो गई है।

${queueText}

*शिकायत संख्या:* ${complaint.complaint_no}
*दिनांक एवं समय:* ${formatHindiDateTime(
      complaint.created_at
    )}

आपके धैर्य एवं सहयोग के लिए धन्यवाद।

*— RWA Pocket-A*`
  }

  const buildHindiResolvedMessage = (
    complaint,
    resolvedAt
  ) => {
    return `*आदरणीय महोदय/महोदया,*

आपकी शिकायत *${complaint.complaint_no}* का समाधान कर दिया गया है।

यदि समस्या अभी भी बनी हुई है, तो कृपया हमें सूचित करें।

*शिकायत संख्या:* ${complaint.complaint_no}
*दिनांक एवं समय:* ${formatHindiDateTime(resolvedAt)}

धन्यवाद।

*— RWA Pocket-A*`
  }

  const openWhatsApp = (
    complaint,
    message,
    whatsappWindow
  ) => {
    const phone =
      normalizeMobileNumber(
        complaint.mobile_no
      )

    if (!phone) {
      if (whatsappWindow) {
        whatsappWindow.close()
      }

      setError(
        'Status updated, but resident mobile number is not available.'
      )

      return
    }

    const whatsappUrl =
      `https://wa.me/${phone}` +
      `?text=${encodeURIComponent(message)}`

    if (whatsappWindow) {
      whatsappWindow.location.href =
        whatsappUrl
    } else {
      window.location.href =
        whatsappUrl
    }
  }

  const acknowledgeComplaint = async complaint => {
    let whatsappWindow = null

    try {
      setAcknowledgingId(complaint.id)
      setError('')

      whatsappWindow =
        window.open('', '_blank')

      const {
        data: complaintsAhead,
        error: queueError
      } = await supabase.rpc(
        'get_complaints_ahead',
        {
          p_complaint_id: complaint.id
        }
      )

      if (queueError) {
        throw queueError
      }

      const now =
        new Date().toISOString()

      const { error: updateError } =
        await supabase
          .from('complaints')
          .update({
            status: 'ACKNOWLEDGED',
            updated_at: now
          })
          .eq('id', complaint.id)

      if (updateError) {
        throw updateError
      }

      const message =
        buildHindiAcknowledgementMessage(
          complaint,
          Number(complaintsAhead || 0)
        )

      openWhatsApp(
        complaint,
        message,
        whatsappWindow
      )

      await loadComplaints()

    } catch (err) {
      console.error(err)

      if (whatsappWindow) {
        whatsappWindow.close()
      }

      setError(
        err.message ||
          'Unable to acknowledge complaint.'
      )
    } finally {
      setAcknowledgingId(null)
    }
  }

  const resolveComplaint = async complaint => {
    let whatsappWindow = null

    try {
      setResolvingId(complaint.id)
      setError('')

      whatsappWindow =
        window.open('', '_blank')

      const now =
        new Date().toISOString()

      const { error: updateError } =
        await supabase
          .from('complaints')
          .update({
            status: 'RESOLVED',
            work_done_at: now,
            updated_at: now
          })
          .eq('id', complaint.id)

      if (updateError) {
        throw updateError
      }

      const message =
        buildHindiResolvedMessage(
          complaint,
          now
        )

      openWhatsApp(
        complaint,
        message,
        whatsappWindow
      )

      await loadComplaints()

    } catch (err) {
      console.error(err)

      if (whatsappWindow) {
        whatsappWindow.close()
      }

      setError(
        err.message ||
          'Unable to resolve complaint.'
      )
    } finally {
      setResolvingId(null)
    }
  }

  const canAcknowledge = complaint => {
    const status =
      complaint.status?.toUpperCase()

    return (
      status === 'OPEN' ||
      status === 'REOPENED'
    )
  }

  const canResolve = complaint => {
    return (
      complaint.status?.toUpperCase() ===
      'ACKNOWLEDGED'
    )
  }

  const isResolved = complaint => {
    const status =
      complaint.status?.toUpperCase()

    return (
      status === 'RESOLVED' ||
      status === 'CLOSED'
    )
  }

  const newCount =
    complaints.filter(complaint => {
      const status =
        complaint.status?.toUpperCase()

      return (
        status === 'OPEN' ||
        status === 'REOPENED'
      )
    }).length

  const acknowledgedCount =
    complaints.filter(
      complaint =>
        complaint.status?.toUpperCase() ===
        'ACKNOWLEDGED'
    ).length

  const resolvedCount =
    complaints.filter(
      complaint =>
        isResolved(complaint)
    ).length

  const activeCount =
    complaints.filter(
      complaint =>
        !isResolved(complaint)
    ).length

  const visibleComplaints =
    useMemo(() => {
      if (filter === 'active') {
        return complaints.filter(
          complaint =>
            !isResolved(complaint)
        )
      }

      if (filter === 'resolved') {
        return complaints.filter(
          complaint =>
            isResolved(complaint)
        )
      }

      return complaints
    }, [complaints, filter])

  return (
    <div className="complaints-page">

      <header className="complaints-header">

        <div className="complaints-header-row">

          <button
            className="complaints-back-button"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="complaints-title">

            <div className="complaints-title-icon">
              <MessageSquareWarning
                size={27}
              />
            </div>

            <div>
              <h1>Complaints</h1>
              <p>RWA Pocket-A</p>
            </div>

          </div>

          <button
            className="complaints-refresh-button"
            onClick={loadComplaints}
            disabled={loading}
          >
            <RefreshCw
              size={19}
              className={
                loading
                  ? 'refresh-spinning'
                  : ''
              }
            />
          </button>

        </div>

      </header>

      <main className="complaints-content">

        <section className="complaints-summary">

          <div className="complaint-summary-card">
            <span className="summary-number">
              {newCount}
            </span>
            <span className="summary-label">
              New
            </span>
          </div>

          <div className="complaint-summary-card">
            <span className="summary-number">
              {acknowledgedCount}
            </span>
            <span className="summary-label">
              Acknowledged
            </span>
          </div>

          <div className="complaint-summary-card">
            <span className="summary-number">
              {resolvedCount}
            </span>
            <span className="summary-label">
              Resolved
            </span>
          </div>

          <div className="complaint-summary-card">
            <span className="summary-number">
              {activeCount}
            </span>
            <span className="summary-label">
              Active
            </span>
          </div>

        </section>

        <div className="complaint-filters">

          <button
            className={
              filter === 'active'
                ? 'complaint-filter active'
                : 'complaint-filter'
            }
            onClick={() =>
              setFilter('active')
            }
          >
            Active ({activeCount})
          </button>

          <button
            className={
              filter === 'resolved'
                ? 'complaint-filter active'
                : 'complaint-filter'
            }
            onClick={() =>
              setFilter('resolved')
            }
          >
            Resolved ({resolvedCount})
          </button>

          <button
            className={
              filter === 'all'
                ? 'complaint-filter active'
                : 'complaint-filter'
            }
            onClick={() =>
              setFilter('all')
            }
          >
            All ({complaints.length})
          </button>

        </div>

        {error && (
          <div className="complaints-error">
            {error}
          </div>
        )}

        {loading ? (

          <div className="complaints-empty">
            Loading complaints...
          </div>

        ) : visibleComplaints.length === 0 ? (

          <div className="complaints-empty">

            <CheckCircle2
              size={38}
              strokeWidth={1.5}
            />

            <h3>
              No complaints here
            </h3>

            <p>
              No complaints match this filter.
            </p>

          </div>

        ) : (

          <div className="complaints-list">

            {visibleComplaints.map(
              complaint => {

                const category =
                  getCategoryName(
                    complaint
                  )

                const statusLabel =
                  getStatusLabel(
                    complaint.status
                  )

                const statusClass =
                  getStatusClass(
                    complaint.status
                  )

                return (
                  <article
                    className="complaint-card"
                    key={complaint.id}
                  >

                    <div className="complaint-card-top">

                      <div className="complaint-category">

                        <span className="complaint-category-icon">
                          {getCategoryIcon(
                            category
                          )}
                        </span>

                        <div>

                          <strong>
                            {getCategoryLabel(
                              category
                            )}
                          </strong>

                          <span>
                            {complaint.complaint_no}
                          </span>

                        </div>

                      </div>

                      <span
                        className={`complaint-status complaint-status-${statusClass}`}
                      >
                        {getStatusIcon(
                          complaint.status
                        )}

                        {statusLabel}
                      </span>

                    </div>

                    <div className="complaint-details">

                      {complaint.flat_no && (
                        <p>
                          <strong>Flat:</strong>{' '}
                          {complaint.flat_no}
                        </p>
                      )}

                      {complaint.mobile_no && (
                        <p>
                          <strong>Mobile:</strong>{' '}
                          {complaint.mobile_no}
                        </p>
                      )}

                      <p className="complaint-description">
                        {complaint.description}
                      </p>

                      <p className="complaint-time">
                        <Clock size={15} />

                        {formatDateTime(
                          complaint.created_at
                        )}
                      </p>

                    </div>

                    {canAcknowledge(
                      complaint
                    ) && (
                      <button
                        className="acknowledge-button"
                        disabled={
                          acknowledgingId ===
                          complaint.id
                        }
                        onClick={() =>
                          acknowledgeComplaint(
                            complaint
                          )
                        }
                      >
                        {acknowledgingId ===
                        complaint.id
                          ? 'Acknowledging...'
                          : 'Acknowledge & Notify Resident'}
                      </button>
                    )}

                    {canResolve(
                      complaint
                    ) && (
                      <button
                        className="resolve-button"
                        disabled={
                          resolvingId ===
                          complaint.id
                        }
                        onClick={() =>
                          resolveComplaint(
                            complaint
                          )
                        }
                      >
                        {resolvingId ===
                        complaint.id
                          ? 'Resolving...'
                          : 'Mark Resolved & Notify Resident'}
                      </button>
                    )}

                  </article>
                )
              }
            )}

          </div>
        )}

      </main>

      <footer className="complaints-footer">
        <strong>RWA Pocket-A</strong>
        <span>•</span>
        <span>Sector -105 Noida</span>
      </footer>

    </div>
  )
}

export default Complaints