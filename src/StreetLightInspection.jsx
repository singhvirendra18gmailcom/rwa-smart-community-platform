import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

const COMPLAINT_WORKER_URL =
  'https://rwa-complaint-bot.singh-virendra18.workers.dev'

const LOCATION_SUGGESTIONS = [
  'In front of Tower 1', 'Backside of Tower 1',
  'In front of Tower 2', 'Backside of Tower 2',
  'In front of Tower 3', 'Backside of Tower 3',
  'In front of Tower 4', 'Backside of Tower 4',
  'In front of Tower 5', 'Backside of Tower 5',
  'In front of Tower 6', 'Backside of Tower 6',
  'In front of Tower 7', 'Backside of Tower 7',
  'In front of Tower 8', 'Backside of Tower 8',
  'In front of Tower 9', 'Backside of Tower 9',
  'In front of Tower 10', 'Backside of Tower 10',
  'In front of Tower 11', 'Backside of Tower 11',
  'In front of Tower 12', 'Backside of Tower 12',
  'Inside Park 1', 'Inside Park 2', 'Gate 1', 'Gate 2',
]

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

function normalizeIndiaMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits

  return digits
}

function normalizeLocationKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function calculateIssueDays(firstReportedDate, today) {
  const start = new Date(`${firstReportedDate}T00:00:00Z`)
  const end = new Date(`${today}T00:00:00Z`)
  const diff = Math.floor((end - start) / 86400000)
  return Math.max(1, diff + 1)
}

function formatMessageDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}-${month}-${year}` : value
}

function buildComplaintMessage(row, today, issues, escalation) {
  const issueByLocation = new Map(
    (issues || []).map((issue) => [
      issue.location_key,
      issue,
    ])
  )

  const issueDays = row.locations.map((location) => {
    const issue = issueByLocation.get(normalizeLocationKey(location))
    return issue
      ? calculateIssueDays(issue.first_reported_date, today)
      : 1
  })

  const oldestDays = Math.max(1, ...issueDays)

  const supervisor = [
    escalation?.supervisor_name,
    escalation?.supervisor_mobile,
  ].filter(Boolean).join(' - ') || '—'

  const rwa = [
    escalation?.rwa_name,
    escalation?.rwa_mobile,
  ].filter(Boolean).join(' - ') || '—'

  const lightText =
    row.faultyCount === 1
      ? '1 स्ट्रीट लाइट खराब है'
      : `${row.faultyCount} स्ट्रीट लाइट खराब हैं`

  const pendingText =
    oldestDays > 1
      ? ` और यह समस्या ${oldestDays} दिन से लंबित है`
      : ''

  return `दिनांक: ${formatMessageDate(today)}
सेवा में ${row.agency.agency_name},

पॉकेट-A, सेक्टर-105 में ${lightText}${pendingText}। कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
}

async function getOpenIssues(agencyId) {
  const { data, error } = await supabase
    .from('street_light_issues')
    .select('id,agency_id,location_key,location_text,first_reported_date,last_seen_date,status')
    .eq('agency_id', agencyId)
    .eq('status', 'OPEN')

  if (error) throw error
  return data || []
}

function blankAgency(agency) {
  return {
    agency,
    inspectionId: null,
    faultyCount: 0,
    locations: [],
    remarks: '',
    saved: false,
    whatsappSent: false,
    whatsappPending: false,
    whatsappFailed: false,
    whatsappManualOpened: false,
    issueAges: {},
  }
}

export default function StreetLightInspection({ config, onBack }) {
  const today = useMemo(() => getIndiaDate(), [])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingAgencyId, setSavingAgencyId] = useState(null)
  const [savingContactId, setSavingContactId] = useState(null)
  const [sendingAgencyId, setSendingAgencyId] = useState(null)
  const [sendingSmsAgencyId, setSendingSmsAgencyId] = useState(null)
  const [message, setMessage] = useState('')
  const [escalation, setEscalation] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setMessage('')

    const [categoryResult, settingsResult] = await Promise.all([
      supabase
        .from('society_service_categories')
        .select('service_type,service_label,rwa_name,rwa_mobile')
        .eq('service_type', 'STREET_LIGHT')
        .maybeSingle(),
      supabase
        .from('society_inspection_settings')
        .select('supervisor_contact_name,supervisor_contact_mobile')
        .eq('id', 1)
        .maybeSingle(),
    ])

    if (categoryResult.error) {
      setMessage(categoryResult.error.message)
      setLoading(false)
      return
    }

    if (settingsResult.error) {
      setMessage(settingsResult.error.message)
      setLoading(false)
      return
    }

    setEscalation({
      supervisor_name: settingsResult.data?.supervisor_contact_name || null,
      supervisor_mobile: settingsResult.data?.supervisor_contact_mobile || null,
      rwa_name: categoryResult.data?.rwa_name || null,
      rwa_mobile: categoryResult.data?.rwa_mobile || null,
    })

    const { data: agencies, error: agencyError } = await supabase
      .from('society_service_agencies')
      .select(
        'id,agency_code,agency_name,service_type,service_label,display_order,contact_name,mobile_no,whatsapp_no,sms_no'
      )
      .eq('active', true)
      .eq('service_type', 'STREET_LIGHT')
      .order('display_order')

    if (agencyError) {
      setMessage(agencyError.message)
      setLoading(false)
      return
    }

    const { data: inspections, error: inspectionError } = await supabase
      .from('street_light_agency_daily_inspections')
      .select('id,agency_id,faulty_count,remarks,saved_at')
      .eq('inspection_date', today)

    if (inspectionError) {
      setMessage(inspectionError.message)
      setLoading(false)
      return
    }

    const inspectionIds = (inspections || []).map((item) => item.id)
    let locations = []
    let notifications = []
    let openIssues = []

    const agencyIds = (agencies || []).map((agency) => agency.id)

    if (agencyIds.length > 0) {
      const { data: issueData, error: issueError } = await supabase
        .from('street_light_issues')
        .select('id,agency_id,location_key,location_text,first_reported_date,last_seen_date,status')
        .in('agency_id', agencyIds)
        .eq('status', 'OPEN')

      if (issueError) {
        setMessage(issueError.message)
        setLoading(false)
        return
      }

      openIssues = issueData || []
    }

    if (inspectionIds.length > 0) {
      const [locationResult, notificationResult] = await Promise.all([
        supabase
          .from('street_light_fault_locations')
          .select('id,inspection_id,sequence_no,location_text,status,issue_id')
          .in('inspection_id', inspectionIds)
          .order('sequence_no'),
        supabase
          .from('street_light_notifications')
          .select('inspection_id,channel,delivery_status,created_at,provider_response')
          .in('inspection_id', inspectionIds)
          .eq('channel', 'WHATSAPP')
          .order('created_at', { ascending: false }),
      ])

      if (locationResult.error) {
        setMessage(locationResult.error.message)
        setLoading(false)
        return
      }

      if (notificationResult.error) {
        setMessage(notificationResult.error.message)
        setLoading(false)
        return
      }

      locations = locationResult.data || []
      notifications = notificationResult.data || []
    }

    const nextRows = (agencies || []).map((agency) => {
      const inspection = (inspections || []).find(
        (item) => item.agency_id === agency.id
      )

      if (!inspection) return blankAgency(agency)

      return {
        agency,
        inspectionId: inspection.id,
        faultyCount: inspection.faulty_count || 0,
        locations: locations
          .filter((item) => item.inspection_id === inspection.id)
          .map((item) => item.location_text),
        remarks: inspection.remarks || '',
        saved: true,
        whatsappSent:
          notifications.find(
            (item) => item.inspection_id === inspection.id
          )?.delivery_status === 'SENT',
        whatsappPending:
          notifications.find(
            (item) => item.inspection_id === inspection.id
          )?.delivery_status === 'PENDING',
        whatsappFailed:
          notifications.find(
            (item) => item.inspection_id === inspection.id
          )?.delivery_status === 'FAILED',
        whatsappManualOpened: false,
        issueAges: Object.fromEntries(
          openIssues
            .filter((issue) => issue.agency_id === agency.id)
            .map((issue) => [
              issue.location_key,
              calculateIssueDays(issue.first_reported_date, today),
            ])
        ),
      }
    })

    setRows(nextRows)
    setLoading(false)
  }

  const updateRow = (agencyId, updater) => {
    setRows((current) =>
      current.map((row) =>
        row.agency.id === agencyId
          ? {
              ...updater(row),
              saved: false,
              whatsappSent: false,
              whatsappPending: false,
              whatsappFailed: false,
              whatsappManualOpened: false,
            }
          : row
      )
    )
  }

  const updateAgencyContact = (agencyId, field, value) => {
    setRows((current) =>
      current.map((row) =>
        row.agency.id === agencyId
          ? {
              ...row,
              agency: {
                ...row.agency,
                [field]: value,
              },
            }
          : row
      )
    )
  }

  const setFaultyCount = (agencyId, count) => {
    const safeCount = Math.max(0, Math.min(200, count))

    updateRow(agencyId, (row) => {
      const locations = [...row.locations]

      while (locations.length < safeCount) locations.push('')
      while (locations.length > safeCount) locations.pop()

      return {
        ...row,
        faultyCount: safeCount,
        locations,
      }
    })
  }

  const updateLocation = (agencyId, index, value) => {
    updateRow(agencyId, (row) => {
      const locations = [...row.locations]
      locations[index] = value
      return { ...row, locations }
    })
  }

  const validateContact = (row) => {
    const mobile = normalizeIndiaMobile(row.agency.mobile_no)

    if (!row.agency.contact_name?.trim()) {
      setMessage(`Please enter the contact person name for ${row.agency.agency_name}.`)
      return null
    }

    if (mobile.length !== 12 || !mobile.startsWith('91')) {
      setMessage(
        `Please enter a valid 10-digit Indian mobile number for ${row.agency.agency_name}.`
      )
      return null
    }

    return mobile
  }

  const saveContact = async (row) => {
    const mobile = validateContact(row)
    if (!mobile) return false

    setSavingContactId(row.agency.id)
    setMessage('')

    const { error } = await supabase
      .from('society_service_agencies')
      .update({
        contact_name: row.agency.contact_name.trim(),
        mobile_no: mobile,
        whatsapp_no: mobile,
        sms_no: mobile,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.agency.id)

    setSavingContactId(null)

    if (error) {
      setMessage(error.message)
      return false
    }

    updateAgencyContact(row.agency.id, 'mobile_no', mobile)
    updateAgencyContact(row.agency.id, 'whatsapp_no', mobile)
    updateAgencyContact(row.agency.id, 'sms_no', mobile)
    setMessage(`${row.agency.agency_name} contact saved.`)
    return true
  }

  const saveAgency = async (row) => {
    const incompleteLocation = row.locations.some(
      (location) => !location.trim()
    )

    if (row.faultyCount > 0 && incompleteLocation) {
      setMessage(`Please enter all ${row.agency.agency_name} fault locations.`)
      return
    }

    setSavingAgencyId(row.agency.id)
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()

    const { data: inspection, error } = await supabase
      .from('street_light_agency_daily_inspections')
      .upsert(
        {
          inspection_date: today,
          agency_id: row.agency.id,
          faulty_count: row.faultyCount,
          remarks: row.remarks.trim() || null,
          inspected_by: userData?.user?.id || null,
          saved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'inspection_date,agency_id' }
      )
      .select('id')
      .single()

    if (error) {
      setMessage(error.message)
      setSavingAgencyId(null)
      return
    }

    const { error: deleteError } = await supabase
      .from('street_light_fault_locations')
      .delete()
      .eq('inspection_id', inspection.id)

    if (deleteError) {
      setMessage(deleteError.message)
      setSavingAgencyId(null)
      return
    }

    const openIssues = await getOpenIssues(row.agency.id)
    const currentLocations = row.locations.map((location) => ({
      location_text: location.trim(),
      location_key: normalizeLocationKey(location),
    }))
    const currentKeys = new Set(
      currentLocations.map((item) => item.location_key)
    )
    const issueIdByLocation = new Map()

    for (const issue of openIssues) {
      if (currentKeys.has(issue.location_key)) {
        const currentLocation = currentLocations.find(
          (item) => item.location_key === issue.location_key
        )

        const { error: issueUpdateError } = await supabase
          .from('street_light_issues')
          .update({
            location_text: currentLocation?.location_text || issue.location_text,
            last_seen_date: today,
            updated_at: new Date().toISOString(),
          })
          .eq('id', issue.id)

        if (issueUpdateError) {
          setMessage(issueUpdateError.message)
          setSavingAgencyId(null)
          return
        }

        issueIdByLocation.set(issue.location_key, issue.id)
      } else {
        const { error: resolveError } = await supabase
          .from('street_light_issues')
          .update({
            status: 'RESOLVED',
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', issue.id)

        if (resolveError) {
          setMessage(resolveError.message)
          setSavingAgencyId(null)
          return
        }
      }
    }

    for (const location of currentLocations) {
      if (issueIdByLocation.has(location.location_key)) continue

      const { data: newIssue, error: newIssueError } = await supabase
        .from('street_light_issues')
        .insert({
          agency_id: row.agency.id,
          location_key: location.location_key,
          location_text: location.location_text,
          first_reported_date: today,
          last_seen_date: today,
          status: 'OPEN',
        })
        .select('id')
        .single()

      if (newIssueError) {
        setMessage(newIssueError.message)
        setSavingAgencyId(null)
        return
      }

      issueIdByLocation.set(location.location_key, newIssue.id)
    }

    if (row.faultyCount > 0) {
      const { error: locationError } = await supabase
        .from('street_light_fault_locations')
        .insert(
          currentLocations.map((location, index) => ({
            inspection_id: inspection.id,
            sequence_no: index + 1,
            location_text: location.location_text,
            issue_id: issueIdByLocation.get(location.location_key) || null,
            status: 'OPEN',
          }))
        )

      if (locationError) {
        setMessage(locationError.message)
        setSavingAgencyId(null)
        return
      }
    }

    setRows((current) =>
      current.map((item) =>
        item.agency.id === row.agency.id
          ? {
              ...item,
              inspectionId: inspection.id,
              saved: true,
              whatsappSent: false,
              whatsappPending: false,
              whatsappFailed: false,
              whatsappManualOpened: false,
              issueAges: Object.fromEntries(
                currentLocations.map((location) => {
                  const existing = openIssues.find(
                    (issue) => issue.location_key === location.location_key
                  )
                  return [
                    location.location_key,
                    existing
                      ? calculateIssueDays(existing.first_reported_date, today)
                      : 1,
                  ]
                })
              ),
            }
          : item
      )
    )

    setMessage(`${row.agency.agency_name} street-light inspection saved.`)
    setSavingAgencyId(null)
  }

  const parseWhatsAppFailureReason = (providerResponse) => {
    if (!providerResponse) return 'WhatsApp delivery failed.'

    try {
      const payload =
        typeof providerResponse === 'string'
          ? JSON.parse(providerResponse)
          : providerResponse

      return (
        payload?.errors?.[0]?.error_data?.details ||
        payload?.errors?.[0]?.message ||
        payload?.errors?.[0]?.title ||
        'WhatsApp delivery failed.'
      )
    } catch {
      return 'WhatsApp delivery failed.'
    }
  }

  const openManualWhatsApp = async (row, mobile) => {
    try {
      const openIssues = await getOpenIssues(row.agency.id)
      const complaintMessage = buildComplaintMessage(
        row,
        today,
        openIssues,
        escalation
      )

      const whatsappUrl =
        `https://wa.me/${mobile}?text=${encodeURIComponent(complaintMessage)}`

      setRows((current) =>
        current.map((item) =>
          item.agency.id === row.agency.id
            ? {
                ...item,
                whatsappSent: false,
                whatsappPending: false,
                whatsappFailed: false,
                whatsappManualOpened: true,
              }
            : item
        )
      )

      setMessage(
        'Background WhatsApp is unavailable outside the 24-hour window. WhatsApp is opening with the complaint ready to send manually.'
      )

      window.location.href = whatsappUrl
    } catch (error) {
      console.error('Unable to open manual WhatsApp fallback:', error)
      setMessage(
        error?.message ||
          'Unable to prepare the WhatsApp complaint for manual sending.'
      )
    }
  }

  const pollWhatsAppDeliveryStatus = async (row, mobile) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      const { data, error } = await supabase
        .from('street_light_notifications')
        .select('delivery_status,provider_response,created_at')
        .eq('inspection_id', row.inspectionId)
        .eq('channel', 'WHATSAPP')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Unable to refresh WhatsApp delivery status:', error)
        return
      }

      if (!data) continue

      if (data.delivery_status === 'SENT') {
        setRows((current) =>
          current.map((item) =>
            item.agency.id === row.agency.id
              ? {
                  ...item,
                  whatsappSent: true,
                  whatsappPending: false,
                  whatsappFailed: false,
                }
              : item
          )
        )
        setMessage('WhatsApp delivered successfully.')
        return
      }

      if (data.delivery_status === 'FAILED') {
        const reason = parseWhatsAppFailureReason(data.provider_response)

        setRows((current) =>
          current.map((item) =>
            item.agency.id === row.agency.id
              ? {
                  ...item,
                  whatsappSent: false,
                  whatsappPending: false,
                  whatsappFailed: true,
                  whatsappManualOpened: false,
                }
              : item
          )
        )

        console.warn('Background WhatsApp delivery failed:', reason)
        await openManualWhatsApp(row, mobile)
        return
      }
    }

    setMessage(
      'WhatsApp submitted to Meta. Delivery confirmation is still pending.'
    )
  }

  const sendWhatsAppComplaint = async (row) => {
    if (!row.saved || !row.inspectionId) {
      setMessage('Please save the street-light inspection before sending the complaint.')
      return
    }

    if (row.faultyCount <= 0) {
      setMessage('There are no faulty street lights to report.')
      return
    }

    const mobile = validateContact(row)
    if (!mobile) return

    const contactSaved = await saveContact({
      ...row,
      agency: { ...row.agency, mobile_no: mobile },
    })
    if (!contactSaved) return

    setSendingAgencyId(row.agency.id)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSendingAgencyId(null)
      setMessage('Login session expired. Please sign in again.')
      return
    }

    try {
      const response = await fetch(
        `${COMPLAINT_WORKER_URL}/api/street-lights/notify-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            inspection_id: row.inspectionId,
          }),
        }
      )

      let result = null

      try {
        result = await response.json()
      } catch {
        result = null
      }

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || `WhatsApp service returned ${response.status}.`
        )
      }

      setRows((current) =>
        current.map((item) =>
          item.agency.id === row.agency.id
            ? {
                ...item,
                whatsappSent: false,
                whatsappPending: true,
                whatsappFailed: false,
                whatsappManualOpened: false,
              }
            : item
        )
      )

      setMessage(
        `WhatsApp submitted to Meta for ${row.agency.contact_name} (${mobile}). Delivery confirmation is pending.`
      )

      await pollWhatsAppDeliveryStatus(row, mobile)
    } catch (error) {
      console.error('Background WhatsApp send failed:', error)
      await openManualWhatsApp(row, mobile)
    } finally {
      setSendingAgencyId(null)
    }
  }

  const sendSmsComplaint = async (row) => {
    if (!row.saved || !row.inspectionId) {
      setMessage('Please save the street-light inspection before sending the complaint.')
      return
    }

    if (row.faultyCount <= 0) {
      setMessage('There are no faulty street lights to report.')
      return
    }

    const mobile = validateContact(row)
    if (!mobile) return

    const contactSaved = await saveContact({
      ...row,
      agency: { ...row.agency, mobile_no: mobile },
    })
    if (!contactSaved) return

    setSendingSmsAgencyId(row.agency.id)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSendingSmsAgencyId(null)
      setMessage('Login session expired. Please sign in again.')
      return
    }

    try {
      const response = await fetch(
        `${COMPLAINT_WORKER_URL}/api/street-lights/notify-sms`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            inspection_id: row.inspectionId,
          }),
        }
      )

      let result = null

      try {
        result = await response.json()
      } catch {
        result = null
      }

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || `SMS service returned ${response.status}.`
        )
      }

      setMessage(
        `SMS complaint sent to ${row.agency.contact_name} (${mobile}).`
      )
    } catch (error) {
      console.error('Background SMS send failed:', error)
      setMessage(
        error?.message ||
          'Unable to send SMS complaint in background.'
      )
    } finally {
      setSendingSmsAgencyId(null)
    }
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading street-light inspection…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Street Lights</h1>
          <p>{config?.module_name || 'Society Inspection'} • {today}</p>
        </div>
      </header>

      <main className="street-light-content">
        <div className="street-light-intro">
          Record faulty street lights separately for each maintenance agency
          and notify the concerned contact directly.
        </div>

        {rows.map((row) => (
          <section className="agency-card" key={row.agency.id}>
            <div className="agency-card-heading">
              <div>
                <span>MAINTENANCE AGENCY</span>
                <h2>{row.agency.agency_name}</h2>
              </div>

              <span className={`agency-save-status ${row.saved ? 'saved' : ''}`}>
                {row.saved ? '✓ Inspection Saved' : 'Not saved'}
              </span>
            </div>

            <div className="agency-contact-card">
              <div className="agency-contact-title">
                <strong>👤 Agency Contact</strong>
                <small>Used for complaint notification</small>
              </div>

              <label>
                Person Name
                <input
                  value={row.agency.contact_name || ''}
                  onChange={(event) =>
                    updateAgencyContact(
                      row.agency.id,
                      'contact_name',
                      event.target.value
                    )
                  }
                  placeholder="Contact person name"
                />
              </label>

              <label>
                Mobile Number
                <input
                  type="tel"
                  inputMode="tel"
                  value={row.agency.mobile_no || ''}
                  onChange={(event) =>
                    updateAgencyContact(
                      row.agency.id,
                      'mobile_no',
                      event.target.value
                    )
                  }
                  placeholder="10-digit mobile number"
                />
              </label>

              <button
                type="button"
                className="agency-contact-save"
                disabled={savingContactId === row.agency.id}
                onClick={() => saveContact(row)}
              >
                {savingContactId === row.agency.id
                  ? 'Saving Contact…'
                  : 'Save Contact'}
              </button>
            </div>

            <div className="fault-counter-label">Faulty Street Lights</div>

            <div className="fault-counter">
              <button
                type="button"
                onClick={() => setFaultyCount(row.agency.id, row.faultyCount - 1)}
              >
                −
              </button>
              <strong>{row.faultyCount}</strong>
              <button
                type="button"
                onClick={() => setFaultyCount(row.agency.id, row.faultyCount + 1)}
              >
                +
              </button>
            </div>

            {row.faultyCount === 0 ? (
              <div className="all-working-button">
                ✅ All Working
              </div>
            ) : (
              <div className="fault-location-list">
                <h3>Fault Locations</h3>

                {row.locations.map((location, index) => (
                  <label key={index} className="fault-location-field">
                    <span>Fault {index + 1}</span>
                    <input
                      list="street-light-location-suggestions"
                      value={location}
                      onChange={(event) =>
                        updateLocation(row.agency.id, index, event.target.value)
                      }
                      placeholder="e.g. In front of Tower 3"
                    />
                    {row.issueAges?.[normalizeLocationKey(location)] && (
                      <small className="fault-open-days">
                        ⏱ {row.issueAges[normalizeLocationKey(location)]} दिन से खराब
                      </small>
                    )}
                  </label>
                ))}
              </div>
            )}

            <label className="agency-remarks">
              Remarks (optional)
              <textarea
                rows="2"
                value={row.remarks}
                onChange={(event) =>
                  updateRow(row.agency.id, (current) => ({
                    ...current,
                    remarks: event.target.value,
                  }))
                }
                placeholder="Any additional observation"
              />
            </label>

            <button
              type="button"
              className="society-primary-button"
              disabled={savingAgencyId === row.agency.id}
              onClick={() => saveAgency(row)}
            >
              {savingAgencyId === row.agency.id
                ? 'Saving…'
                : `Save ${row.agency.agency_name} Inspection`}
            </button>

            {row.faultyCount > 0 && (
              <div className="agency-notify-section">
                <div className="agency-notify-heading">
                  <strong>📣 Send Complaint</strong>
                  <small>
                    {row.saved
                      ? 'Notify the configured agency contact'
                      : 'Save inspection first'}
                  </small>
                </div>

                <div className="agency-notify-actions">
                  <button
                    type="button"
                    className="whatsapp-complaint-button"
                    disabled={
                      !row.saved ||
                      sendingAgencyId === row.agency.id
                    }
                    onClick={() => sendWhatsAppComplaint(row)}
                  >
                    {sendingAgencyId === row.agency.id
                      ? 'Sending…'
                      : row.whatsappSent
                      ? '✓ WhatsApp Delivered'
                      : row.whatsappPending
                      ? '⏳ WhatsApp Submitted'
                      : row.whatsappManualOpened
                      ? '↗ WhatsApp Opened'
                      : row.whatsappFailed
                      ? '↗ Open WhatsApp Manually'
                      : '💬 Send WhatsApp'}
                  </button>

                  <button
                    type="button"
                    className="sms-complaint-button"
                    disabled={
                      !row.saved ||
                      sendingSmsAgencyId === row.agency.id
                    }
                    onClick={() => sendSmsComplaint(row)}
                  >
                    {sendingSmsAgencyId === row.agency.id
                      ? 'Sending SMS…'
                      : '✉️ Send SMS'}
                  </button>
                </div>
              </div>
            )}
          </section>
        ))}

        <datalist id="street-light-location-suggestions">
          {LOCATION_SUGGESTIONS.map((location) => (
            <option key={location} value={location} />
          ))}
        </datalist>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
