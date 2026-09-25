import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

const LOCATION_SUGGESTIONS = [
  'Lane 1',
  'Lane 2',
  'Lane 3',
  'Lane 4',
  'Lane 5',
  'Lane 6',
  'Park 1',
  'Park 2',
  'Gate 1',
  'Gate 2',
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

function createFault(agencyId = '') {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    location: '',
    agencyId: agencyId ? String(agencyId) : '',
    issueDays: 1,
  }
}

function notificationLabel(status) {
  if (status === 'SENT') return '✅ Marked Sent'
  if (status === 'COMPOSER_OPENED') return '↗ WhatsApp Opened'
  if (status === 'FAILED') return '⚠️ Failed'
  return '⏳ Complaint Pending'
}

export default function StreetLightInspection({
  config,
  onBack,
  onContinue,
}) {
  const today = useMemo(() => getIndiaDate(), [])
  const [agencies, setAgencies] = useState([])
  const [faults, setFaults] = useState([])
  const [inspectionByAgency, setInspectionByAgency] = useState({})
  const [notificationByAgency, setNotificationByAgency] = useState({})
  const [escalation, setEscalation] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sendingAgencyId, setSendingAgencyId] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setMessage('')

    const [agencyResult, categoryResult, settingsResult] = await Promise.all([
      supabase
        .from('society_service_agencies')
        .select(
          'id,agency_name,agency_code,contact_name,mobile_no,display_order,active'
        )
        .eq('service_type', 'STREET_LIGHT')
        .eq('active', true)
        .order('display_order')
        .order('agency_name'),
      supabase
        .from('society_service_categories')
        .select('rwa_name,rwa_mobile')
        .eq('service_type', 'STREET_LIGHT')
        .maybeSingle(),
      supabase
        .from('society_inspection_settings')
        .select('supervisor_contact_name,supervisor_contact_mobile')
        .eq('id', 1)
        .maybeSingle(),
    ])

    const baseError =
      agencyResult.error ||
      categoryResult.error ||
      settingsResult.error

    if (baseError) {
      setMessage(baseError.message)
      setLoading(false)
      return
    }

    const agencyData = agencyResult.data || []
    setAgencies(agencyData)
    setEscalation({
      supervisor_name: settingsResult.data?.supervisor_contact_name || null,
      supervisor_mobile: settingsResult.data?.supervisor_contact_mobile || null,
      rwa_name: categoryResult.data?.rwa_name || null,
      rwa_mobile: categoryResult.data?.rwa_mobile || null,
    })

    const agencyIds = agencyData.map((agency) => agency.id)

    if (agencyIds.length === 0) {
      setFaults([])
      setLoading(false)
      return
    }

    const { data: inspections, error: inspectionError } = await supabase
      .from('street_light_agency_daily_inspections')
      .select('id,agency_id,faulty_count,remarks,saved_at')
      .eq('inspection_date', today)
      .in('agency_id', agencyIds)

    if (inspectionError) {
      setMessage(inspectionError.message)
      setLoading(false)
      return
    }

    const inspectionMap = Object.fromEntries(
      (inspections || []).map((item) => [String(item.agency_id), item])
    )
    setInspectionByAgency(inspectionMap)

    const inspectionIds = (inspections || []).map((item) => item.id)
    let locationRows = []
    let notificationRows = []

    if (inspectionIds.length > 0) {
      const [locationResult, notificationResult] = await Promise.all([
        supabase
          .from('street_light_fault_locations')
          .select('inspection_id,sequence_no,location_text,issue_id')
          .in('inspection_id', inspectionIds)
          .order('sequence_no'),
        supabase
          .from('street_light_notifications')
          .select('id,inspection_id,agency_id,delivery_status,created_at')
          .in('inspection_id', inspectionIds)
          .eq('channel', 'WHATSAPP')
          .order('created_at', { ascending: false }),
      ])

      if (locationResult.error || notificationResult.error) {
        setMessage(
          locationResult.error?.message || notificationResult.error?.message
        )
        setLoading(false)
        return
      }

      locationRows = locationResult.data || []
      notificationRows = notificationResult.data || []
    }

    const openIssueResult = await supabase
      .from('street_light_issues')
      .select(
        'id,agency_id,location_key,location_text,first_reported_date,status'
      )
      .in('agency_id', agencyIds)
      .eq('status', 'OPEN')

    if (openIssueResult.error) {
      setMessage(openIssueResult.error.message)
      setLoading(false)
      return
    }

    const issueById = new Map(
      (openIssueResult.data || []).map((issue) => [Number(issue.id), issue])
    )

    const existingFaults = []
    ;(inspections || []).forEach((inspection) => {
      locationRows
        .filter((row) => row.inspection_id === inspection.id)
        .forEach((row) => {
          const issue = issueById.get(Number(row.issue_id))
          existingFaults.push({
            key: `existing-${inspection.id}-${row.sequence_no}`,
            location: row.location_text,
            agencyId: String(inspection.agency_id),
            issueDays: issue
              ? calculateIssueDays(issue.first_reported_date, today)
              : 1,
          })
        })
    })

    const latestNotification = {}
    notificationRows.forEach((item) => {
      const key = String(item.agency_id)
      if (!latestNotification[key]) latestNotification[key] = item
    })

    setFaults(existingFaults)
    setNotificationByAgency(latestNotification)
    setSaved((inspections || []).length > 0)
    setLoading(false)
  }

  const updateFaultCount = (count) => {
    const safeCount = Math.max(0, Math.min(100, Number(count) || 0))
    const defaultAgencyId = agencies[0]?.id ? String(agencies[0].id) : ''

    setFaults((current) => {
      if (safeCount === current.length) return current

      if (safeCount < current.length) {
        return current.slice(0, safeCount)
      }

      const additions = Array.from(
        { length: safeCount - current.length },
        () => createFault(defaultAgencyId)
      )

      return [...current, ...additions]
    })

    setSaved(false)
  }

  const updateFault = (key, field, value) => {
    setFaults((current) =>
      current.map((fault) =>
        fault.key === key
          ? {
              ...fault,
              [field]: value,
              ...(field === 'location' ? { issueDays: 1 } : {}),
            }
          : fault
      )
    )
    setSaved(false)
  }

  const groupedFaults = useMemo(() => {
    const groups = {}

    agencies.forEach((agency) => {
      groups[String(agency.id)] = faults.filter(
        (fault) => String(fault.agencyId) === String(agency.id)
      )
    })

    return groups
  }, [agencies, faults])

  const saveInspection = async () => {
    const incomplete = faults.find(
      (fault) =>
        !String(fault.location || '').trim() ||
        !String(fault.agencyId || '').trim()
    )

    if (incomplete) {
      setMessage('Please enter location and select UPPCL/TATA for every fault.')
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user?.id) {
      setMessage('Login session expired. Please sign in again.')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const nextInspectionMap = {}

      for (const agency of agencies) {
        const agencyId = String(agency.id)
        const agencyFaults = groupedFaults[agencyId] || []
        const now = new Date().toISOString()

        const { data: inspection, error: inspectionError } = await supabase
          .from('street_light_agency_daily_inspections')
          .upsert(
            {
              inspection_date: today,
              agency_id: agency.id,
              faulty_count: agencyFaults.length,
              remarks: null,
              inspected_by: session.user.id,
              saved_at: now,
              updated_at: now,
            },
            { onConflict: 'inspection_date,agency_id' }
          )
          .select('id,agency_id,faulty_count,remarks,saved_at')
          .single()

        if (inspectionError) throw inspectionError

        nextInspectionMap[agencyId] = inspection

        const { error: deleteError } = await supabase
          .from('street_light_fault_locations')
          .delete()
          .eq('inspection_id', inspection.id)

        if (deleteError) throw deleteError

        const { data: openIssues, error: issueLoadError } = await supabase
          .from('street_light_issues')
          .select(
            'id,location_key,location_text,first_reported_date,last_seen_date,status'
          )
          .eq('agency_id', agency.id)
          .eq('status', 'OPEN')

        if (issueLoadError) throw issueLoadError

        const currentByKey = new Map(
          agencyFaults.map((fault) => [
            normalizeLocationKey(fault.location),
            fault,
          ])
        )

        const issueIdByKey = new Map()

        for (const issue of openIssues || []) {
          if (currentByKey.has(issue.location_key)) {
            const fault = currentByKey.get(issue.location_key)

            const { error } = await supabase
              .from('street_light_issues')
              .update({
                location_text: String(fault.location).trim(),
                last_seen_date: today,
                updated_at: now,
              })
              .eq('id', issue.id)

            if (error) throw error
            issueIdByKey.set(issue.location_key, issue.id)
          } else {
            const { error } = await supabase
              .from('street_light_issues')
              .update({
                status: 'RESOLVED',
                resolved_at: now,
                updated_at: now,
              })
              .eq('id', issue.id)

            if (error) throw error
          }
        }

        for (const fault of agencyFaults) {
          const key = normalizeLocationKey(fault.location)
          if (issueIdByKey.has(key)) continue

          const { data: newIssue, error } = await supabase
            .from('street_light_issues')
            .insert({
              agency_id: agency.id,
              location_key: key,
              location_text: String(fault.location).trim(),
              first_reported_date: today,
              last_seen_date: today,
              status: 'OPEN',
              updated_at: now,
            })
            .select('id')
            .single()

          if (error) throw error
          issueIdByKey.set(key, newIssue.id)
        }

        if (agencyFaults.length > 0) {
          const { error: locationInsertError } = await supabase
            .from('street_light_fault_locations')
            .insert(
              agencyFaults.map((fault, index) => {
                const key = normalizeLocationKey(fault.location)
                return {
                  inspection_id: inspection.id,
                  sequence_no: index + 1,
                  location_text: String(fault.location).trim(),
                  status: 'OPEN',
                  issue_id: issueIdByKey.get(key) || null,
                }
              })
            )

          if (locationInsertError) throw locationInsertError
        }
      }

      setInspectionByAgency(nextInspectionMap)
      setSaved(true)
      setMessage('Street-light faults saved successfully.')
      await loadData()
    } catch (error) {
      console.error(error)
      setMessage(error?.message || 'Unable to save street-light faults.')
    } finally {
      setSaving(false)
    }
  }

  const buildComplaintMessage = (agency, agencyFaults) => {
    const supervisor = [
      escalation?.supervisor_name,
      escalation?.supervisor_mobile,
    ].filter(Boolean).join(' - ') || '—'

    const rwa = [
      escalation?.rwa_name,
      escalation?.rwa_mobile,
    ].filter(Boolean).join(' - ') || '—'

    const locations = agencyFaults
      .map((fault) => String(fault.location || '').trim())
      .filter(Boolean)
      .join(', ')

    return `दिनांक: ${formatDate(today)}
सेवा में ${agency.agency_name},

पॉकेट-A, सेक्टर-105 में ${agencyFaults.length} स्ट्रीट लाइट खराब पाई गई हैं।

स्थान: ${locations}

कृपया आवश्यक जांच एवं मरम्मत जल्द से जल्द करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
  }

  const openComplaint = async (agency) => {
    const agencyId = String(agency.id)
    const agencyFaults = groupedFaults[agencyId] || []
    const inspection = inspectionByAgency[agencyId]

    if (!saved || !inspection) {
      setMessage('Please save the street-light faults before sending complaints.')
      return
    }

    if (agencyFaults.length === 0) return

    const mobile = normalizeMobile(agency.mobile_no)
    if (mobile.length !== 12 || !mobile.startsWith('91')) {
      setMessage(
        `Please configure a valid mobile number for ${agency.agency_name}.`
      )
      return
    }

    const complaintMessage = buildComplaintMessage(agency, agencyFaults)

    setSendingAgencyId(agency.id)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { data, error } = await supabase
      .from('street_light_notifications')
      .insert({
        inspection_id: inspection.id,
        agency_id: agency.id,
        channel: 'WHATSAPP',
        recipient_name: agency.contact_name || agency.agency_name,
        recipient_mobile: mobile,
        message_text: complaintMessage,
        delivery_status: 'COMPOSER_OPENED',
        sent_by: session?.user?.id || null,
      })
      .select(
        'id,inspection_id,agency_id,delivery_status,created_at'
      )
      .single()

    setSendingAgencyId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setNotificationByAgency((current) => ({
      ...current,
      [agencyId]: data,
    }))

    window.location.href =
      `https://wa.me/${mobile}?text=${encodeURIComponent(complaintMessage)}`
  }

  const markComplaintSent = async (agency) => {
    const agencyId = String(agency.id)
    const notification = notificationByAgency[agencyId]

    if (!notification?.id) {
      setMessage('Open the WhatsApp complaint first.')
      return
    }

    setSendingAgencyId(agency.id)

    const { data, error } = await supabase
      .from('street_light_notifications')
      .update({
        delivery_status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .eq('id', notification.id)
      .select('id,inspection_id,agency_id,delivery_status,created_at')
      .single()

    setSendingAgencyId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setNotificationByAgency((current) => ({
      ...current,
      [agencyId]: data,
    }))
    setMessage(`${agency.agency_name} complaint marked as sent.`)
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading street-light faults…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Street Light Faults</h1>
          <p>{formatDate(today)} • Record faulty lights only</p>
        </div>
      </header>

      <main className="street-light-content">
        <div className="street-light-intro">
          Enter only the faulty street lights. For every fault, capture the
          lane/park location and select whether it belongs to UPPCL or TATA.
        </div>

        <section className="street-fault-counter-card">
          <div>
            <span>FAULTY STREET LIGHTS</span>
            <strong>{faults.length}</strong>
          </div>

          <div className="street-fault-counter-actions">
            <button
              type="button"
              onClick={() => updateFaultCount(faults.length - 1)}
              disabled={faults.length === 0}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => updateFaultCount(faults.length + 1)}
            >
              +
            </button>
          </div>
        </section>

        {faults.length === 0 && (
          <div className="street-all-working-card">
            ✅ No faulty street light reported today
          </div>
        )}

        <div className="street-fault-list">
          {faults.map((fault, index) => (
            <section className="street-fault-card" key={fault.key}>
              <div className="street-fault-card-title">
                <strong>Fault {index + 1}</strong>
                {fault.issueDays > 1 && (
                  <span>⏱ {fault.issueDays} दिन से खराब</span>
                )}
              </div>

              <label>
                Location
                <input
                  list="street-location-suggestions"
                  value={fault.location}
                  onChange={(event) =>
                    updateFault(fault.key, 'location', event.target.value)
                  }
                  placeholder="Lane no. or Park no."
                />
              </label>

              <div className="street-agency-choice">
                <span>Agency</span>
                <div>
                  {agencies.map((agency) => (
                    <button
                      key={agency.id}
                      type="button"
                      className={
                        String(fault.agencyId) === String(agency.id)
                          ? 'selected'
                          : ''
                      }
                      onClick={() =>
                        updateFault(
                          fault.key,
                          'agencyId',
                          String(agency.id)
                        )
                      }
                    >
                      {agency.agency_name}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>

        <datalist id="street-location-suggestions">
          {LOCATION_SUGGESTIONS.map((location) => (
            <option key={location} value={location} />
          ))}
        </datalist>

        <button
          type="button"
          className="society-primary-button street-save-all-button"
          disabled={saving}
          onClick={saveInspection}
        >
          {saving
            ? 'Saving…'
            : saved
            ? '✓ Update Street Light Faults'
            : 'Save Street Light Faults'}
        </button>

        {saved && (
          <section className="street-complaint-summary">
            <h2>Agency Complaints</h2>

            {agencies.map((agency) => {
              const agencyId = String(agency.id)
              const agencyFaults = groupedFaults[agencyId] || []
              const notification = notificationByAgency[agencyId]

              if (agencyFaults.length === 0) return null

              return (
                <div className="street-agency-complaint-card" key={agency.id}>
                  <div>
                    <strong>{agency.agency_name}</strong>
                    <span>
                      {agencyFaults.length} fault
                      {agencyFaults.length === 1 ? '' : 's'} •{' '}
                      {agencyFaults
                        .map((fault) => fault.location)
                        .join(', ')}
                    </span>
                  </div>

                  <div className="inspection-complaint-status">
                    {notificationLabel(notification?.delivery_status)}
                  </div>

                  <div className="inspection-action-buttons">
                    <button
                      type="button"
                      className="society-primary-button"
                      disabled={sendingAgencyId === agency.id}
                      onClick={() => openComplaint(agency)}
                    >
                      ↗ Open WhatsApp Complaint
                    </button>

                    {notification?.delivery_status === 'COMPOSER_OPENED' && (
                      <button
                        type="button"
                        className="inspection-mark-sent-button"
                        disabled={sendingAgencyId === agency.id}
                        onClick={() => markComplaintSent(agency)}
                      >
                        ✓ Mark Complaint Sent
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {message && <div className="street-light-message">{message}</div>}

        <button
          type="button"
          className="view-summary-button"
          style={{ width: '100%', marginTop: '14px' }}
          onClick={onContinue}
        >
          Continue to Final Summary Report →
        </button>
      </main>
    </div>
  )
}
