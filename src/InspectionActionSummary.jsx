import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const value = (type) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

function formatDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}-${month}-${year}` : value
}

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

function complaintLabel(status, required) {
  if (!required) return '✅ Complaint not required'
  if (status === 'SENT') return '✅ Marked Sent'
  if (status === 'WHATSAPP_OPENED') return '↗ WhatsApp Opened'
  return '⏳ Complaint Pending'
}

export default function InspectionActionSummary({
  onBack,
  onStreetLights,
  onFinalSummary,
}) {
  const today = useMemo(() => getIndiaDate(), [])
  const [loading, setLoading] = useState(true)
  const [towers, setTowers] = useState([])
  const [inspections, setInspections] = useState([])
  const [agencies, setAgencies] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)
  const [complaints, setComplaints] = useState([])
  const [message, setMessage] = useState('')
  const [savingType, setSavingType] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setMessage('')

    const [
      towerResult,
      inspectionResult,
      agencyResult,
      categoryResult,
      settingsResult,
      complaintResult,
    ] = await Promise.all([
      supabase
        .from('towers')
        .select('id,tower_name,display_order')
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('tower_daily_inspections')
        .select('tower_id,camera_working,camera_led_working,led_screen_working,saved_at')
        .eq('inspection_date', today),
      supabase
        .from('society_service_agencies')
        .select('id,agency_name,service_type,contact_name,mobile_no,active,display_order')
        .in('service_type', ['CAMERA_AMC', 'LED_AMC'])
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('society_service_categories')
        .select('service_type,rwa_name,rwa_mobile')
        .in('service_type', ['CAMERA_AMC', 'LED_AMC']),
      supabase
        .from('society_inspection_settings')
        .select('supervisor_contact_name,supervisor_contact_mobile')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('society_service_complaints')
        .select('*')
        .eq('complaint_date', today)
        .in('service_type', ['CAMERA_AMC', 'LED_AMC']),
    ])

    const error =
      towerResult.error ||
      inspectionResult.error ||
      agencyResult.error ||
      categoryResult.error ||
      settingsResult.error ||
      complaintResult.error

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setTowers(towerResult.data || [])
    setInspections(inspectionResult.data || [])
    setAgencies(agencyResult.data || [])
    setCategories(categoryResult.data || [])
    setSettings(settingsResult.data || null)
    setComplaints(complaintResult.data || [])
    setLoading(false)
  }

  const issueSummary = useMemo(() => {
    const inspectionByTower = new Map(
      inspections.map((inspection) => [Number(inspection.tower_id), inspection])
    )

    const cameraIssues = []
    const ledIssues = []
    const pendingTowers = []

    towers.forEach((tower) => {
      const inspection = inspectionByTower.get(Number(tower.id))

      if (!inspection?.saved_at) {
        pendingTowers.push(tower.tower_name)
        return
      }

      const camera =
        inspection.camera_working ??
        inspection.camera_led_working

      const led =
        inspection.led_screen_working ??
        inspection.camera_led_working

      if (camera === false) cameraIssues.push(tower.tower_name)
      if (led === false) ledIssues.push(tower.tower_name)
    })

    return { cameraIssues, ledIssues, pendingTowers }
  }, [towers, inspections])

  const getComplaint = (serviceType) =>
    complaints.find((item) => item.service_type === serviceType)

  const getAgency = (serviceType) =>
    agencies.find((item) => item.service_type === serviceType)

  const getCategory = (serviceType) =>
    categories.find((item) => item.service_type === serviceType)

  const buildMessage = (serviceType, issueTowers, agency) => {
    const isCamera = serviceType === 'CAMERA_AMC'
    const itemLabel = isCamera ? 'कैमरा' : 'LED स्क्रीन'
    const category = getCategory(serviceType)

    const supervisor = [
      settings?.supervisor_contact_name,
      settings?.supervisor_contact_mobile,
    ].filter(Boolean).join(' - ') || '—'

    const rwa = [
      category?.rwa_name,
      category?.rwa_mobile,
    ].filter(Boolean).join(' - ') || '—'

    return `दिनांक: ${formatDate(today)}
सेवा में ${agency?.agency_name || (isCamera ? 'Camera AMC' : 'LED AMC')},

पॉकेट-A, सेक्टर-105 के दैनिक निरीक्षण में ${issueTowers.length} ${itemLabel} में समस्या पाई गई है।

स्थान: ${issueTowers.join(', ')}

कृपया आवश्यक जांच एवं मरम्मत जल्द से जल्द करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
  }

  const openWhatsApp = async (serviceType, issueTowers) => {
    const agency = getAgency(serviceType)

    if (!agency) {
      setMessage(
        serviceType === 'CAMERA_AMC'
          ? 'Camera AMC agency is not configured.'
          : 'LED AMC agency is not configured.'
      )
      return
    }

    const mobile = normalizeMobile(agency.mobile_no)
    if (mobile.length !== 12 || !mobile.startsWith('91')) {
      setMessage(
        `Please configure a valid mobile number for ${agency.agency_name}.`
      )
      return
    }

    const complaintMessage = buildMessage(serviceType, issueTowers, agency)
    setSavingType(serviceType)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_complaints')
      .upsert(
        {
          complaint_date: today,
          service_type: serviceType,
          agency_id: agency.id,
          issue_count: issueTowers.length,
          issue_summary: issueTowers.join(', '),
          status: 'WHATSAPP_OPENED',
          recipient_name: agency.contact_name || agency.agency_name,
          recipient_mobile: mobile,
          opened_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'complaint_date,service_type' }
      )
      .select()
      .single()

    setSavingType(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setComplaints((current) => [
      ...current.filter((item) => item.service_type !== serviceType),
      data,
    ])

    const url = `https://wa.me/${mobile}?text=${encodeURIComponent(
      complaintMessage
    )}`
    window.location.href = url
  }

  const markSent = async (serviceType) => {
    setSavingType(serviceType)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_complaints')
      .update({
        status: 'SENT',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('complaint_date', today)
      .eq('service_type', serviceType)
      .select()
      .single()

    setSavingType(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setComplaints((current) => [
      ...current.filter((item) => item.service_type !== serviceType),
      data,
    ])
    setMessage('Complaint marked as sent.')
  }

  const renderComplaintCard = (
    serviceType,
    title,
    icon,
    issueTowers
  ) => {
    const complaint = getComplaint(serviceType)
    const agency = getAgency(serviceType)
    const required = issueTowers.length > 0

    return (
      <section className="inspection-action-card">
        <div className="inspection-action-title">
          <div className="inspection-action-icon">{icon}</div>
          <div>
            <span>{title}</span>
            <h2>
              {required
                ? `${issueTowers.length} tower${issueTowers.length === 1 ? '' : 's'} need attention`
                : 'No issue found'}
            </h2>
          </div>
        </div>

        <div className="inspection-action-detail">
          <strong>Inspection Summary</strong>
          <p>
            {required
              ? issueTowers.join(', ')
              : `All inspected ${title.toLowerCase()} are working.`}
          </p>
        </div>

        <div className="inspection-action-detail">
          <strong>Agency</strong>
          <p>
            {agency
              ? `${agency.agency_name}${agency.contact_name ? ` • ${agency.contact_name}` : ''}`
              : 'Not configured'}
          </p>
        </div>

        <div className="inspection-complaint-status">
          {complaintLabel(complaint?.status, required)}
        </div>

        {required && (
          <div className="inspection-action-buttons">
            <button
              type="button"
              className="society-primary-button"
              disabled={savingType === serviceType}
              onClick={() => openWhatsApp(serviceType, issueTowers)}
            >
              {savingType === serviceType
                ? 'Preparing…'
                : complaint?.status === 'SENT'
                ? '↗ Send Again'
                : '↗ Open WhatsApp Complaint'}
            </button>

            {complaint?.status === 'WHATSAPP_OPENED' && (
              <button
                type="button"
                className="inspection-mark-sent-button"
                disabled={savingType === serviceType}
                onClick={() => markSent(serviceType)}
              >
                ✓ Mark Complaint Sent
              </button>
            )}
          </div>
        )}
      </section>
    )
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading inspection action summary…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Inspection Action Summary</h1>
          <p>{formatDate(today)} • Review issues before the final report</p>
        </div>
      </header>

      <main className="street-light-content">
        {issueSummary.pendingTowers.length > 0 && (
          <div className="inspection-workflow-warning">
            ⚠️ Tower inspection is still pending for:{' '}
            {issueSummary.pendingTowers.join(', ')}
          </div>
        )}

        {renderComplaintCard(
          'CAMERA_AMC',
          'Camera',
          '📷',
          issueSummary.cameraIssues
        )}

        {renderComplaintCard(
          'LED_AMC',
          'LED Screen',
          '🖥️',
          issueSummary.ledIssues
        )}

        <section className="inspection-action-card inspection-action-next">
          <div className="inspection-action-title">
            <div className="inspection-action-icon">💡</div>
            <div>
              <span>NEXT STEP</span>
              <h2>Street Light Faults</h2>
            </div>
          </div>
          <p>
            Record only faulty street lights, their lane/park location and
            whether they belong to UPPCL or TATA.
          </p>
          <button
            type="button"
            className="society-primary-button"
            onClick={onStreetLights}
          >
            Continue to Street Lights →
          </button>
        </section>

        <button
          type="button"
          className="view-summary-button"
          style={{ width: '100%', marginTop: '12px' }}
          onClick={onFinalSummary}
        >
          View Final Summary Report
        </button>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
