import { useEffect, useMemo, useState } from 'react'
import TowerInspection from './TowerInspection'
import SocietyInspectionSettings from './SocietyInspectionSettings'
import ServiceAgencies from './ServiceAgencies'
import SocietyInspectionSummary from './SocietyInspectionSummary'
import { supabase } from './supabase'
import { getInspectionTheme, useInspectionConfig } from './inspectionConfig'
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

function getIndiaDateOffset(days) {
  const target = new Date(Date.now() + days * 86400000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target)

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

const STREET_LIGHT_LOCATIONS = [
  'Entry Lane',
  'Exit Lane',
  'Lane 1',
  'Lane 2',
]

function towerHasIssue(inspection) {
  if (!inspection?.saved_at) return false

  const camera =
    inspection.camera_working ??
    inspection.camera_led_working

  const led =
    inspection.led_screen_working ??
    inspection.camera_led_working

  return Boolean(
    inspection.sweeping_done === false ||
    inspection.mopping_done === false ||
    camera === false ||
    led === false ||
    inspection.water_leakage === true ||
    inspection.other_issue === true ||
    (
      inspection.lights_working_count !== null &&
      inspection.lights_working_count < 9
    )
  )
}

function parkHasIssue(inspection) {
  if (!inspection?.saved_at) return false

  return Boolean(
    inspection.sweeping_done === false ||
    inspection.grass_properly_cut === false ||
    inspection.benches_well_placed === false ||
    inspection.swings_not_broken === false ||
    inspection.watering_needed === true ||
    inspection.other_issue === true
  )
}

function complaintStatusText(status, required) {
  if (!required) return 'No complaint required'
  if (status === 'DONE') return 'Done'
  if (status === 'SENT') return 'Complaint sent'
  if (status === 'WHATSAPP_OPENED') return 'WhatsApp opened'
  return 'Complaint pending'
}

export default function SocietyInspection({ onBack }) {
  const today = useMemo(() => getIndiaDate(), [])
  const yesterday = useMemo(() => getIndiaDateOffset(-1), [])
  const [screen, setScreen] = useState('home')
  const [inspectionTarget, setInspectionTarget] = useState(null)

  const [boardLoading, setBoardLoading] = useState(true)
  const [boardMessage, setBoardMessage] = useState('')
  const [savingGarbage, setSavingGarbage] = useState(null)
  const [cameraLedExpanded, setCameraLedExpanded] = useState(false)
  const [streetExpanded, setStreetExpanded] = useState(false)
  const [streetCounts, setStreetCounts] = useState({})
  const [savingStreet, setSavingStreet] = useState(false)
  const [savingComplaint, setSavingComplaint] = useState(null)
  const [board, setBoard] = useState({
    towers: [],
    parks: [],
    towerInspections: [],
    parkInspections: [],
    society: null,
    serviceComplaints: [],
    yesterdayComplaints: [],
    agencies: [],
    serviceCategories: [],
    settings: null,
    streetInspections: [],
    yesterdayStreetInspections: [],
    streetLocations: [],
    yesterdayStreetLocations: [],
    streetNotifications: [],
  })

  const { config, setConfig, loading } = useInspectionConfig()
  const theme = getInspectionTheme(config.theme_key)

  const themeStyle = {
    '--inspection-primary': theme.primary,
    '--inspection-dark': theme.dark,
    '--inspection-soft': theme.soft,
  }

  useEffect(() => {
    loadBoard()
  }, [])

  const loadBoard = async () => {
    setBoardLoading(true)
    setBoardMessage('')

    const [
      towerResult,
      parkResult,
      towerInspectionResult,
      parkInspectionResult,
      societyResult,
      complaintResult,
      agencyResult,
      categoryResult,
      settingsResult,
      streetInspectionResult,
    ] = await Promise.all([
      supabase
        .from('towers')
        .select('id,tower_name,display_order')
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('parks')
        .select('id,park_name,display_order')
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('tower_daily_inspections')
        .select('*')
        .eq('inspection_date', today),
      supabase
        .from('park_daily_inspections')
        .select('*')
        .eq('inspection_date', today),
      supabase
        .from('society_daily_inspections')
        .select('garbage_collected,garbage_disposed,saved_at')
        .eq('inspection_date', today)
        .maybeSingle(),
      supabase
        .from('society_service_complaints')
        .select('*')
        .in('complaint_date', [today, yesterday]),
      supabase
        .from('society_service_agencies')
        .select('id,agency_name,service_type,contact_name,mobile_no')
        .eq('active', true),
      supabase
        .from('society_service_categories')
        .select('service_type,rwa_name,rwa_mobile')
        .in('service_type', ['CAMERA_AMC', 'LED_AMC', 'STREET_LIGHT']),
      supabase
        .from('society_inspection_settings')
        .select('supervisor_contact_name,supervisor_contact_mobile')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('street_light_agency_daily_inspections')
        .select(
          'id,inspection_date,agency_id,faulty_count,saved_at,complaint_status,complaint_opened_at,complaint_sent_at,resolved_at'
        )
        .in('inspection_date', [today, yesterday]),
    ])

    const error =
      towerResult.error ||
      parkResult.error ||
      towerInspectionResult.error ||
      parkInspectionResult.error ||
      societyResult.error ||
      complaintResult.error ||
      agencyResult.error ||
      categoryResult.error ||
      settingsResult.error ||
      streetInspectionResult.error

    if (error) {
      setBoardMessage(error.message)
      setBoardLoading(false)
      return
    }

    const allStreetInspections = streetInspectionResult.data || []
    const streetInspections = allStreetInspections.filter(
      (item) => item.inspection_date === today
    )
    const yesterdayStreetInspections = allStreetInspections.filter(
      (item) =>
        item.inspection_date === yesterday &&
        Number(item.faulty_count || 0) > 0 &&
        item.complaint_status !== 'DONE'
    )

    const streetIds = allStreetInspections.map((item) => item.id)
    let streetNotifications = []
    let streetLocationRows = []

    if (streetIds.length > 0) {
      const [notificationResult, locationResult] = await Promise.all([
        supabase
          .from('street_light_notifications')
          .select('id,inspection_id,agency_id,delivery_status,created_at')
          .in('inspection_id', streetIds)
          .eq('channel', 'WHATSAPP')
          .order('created_at', { ascending: false }),
        supabase
          .from('street_light_fault_locations')
          .select('inspection_id,location_text,faulty_count,sequence_no')
          .in('inspection_id', streetIds)
          .order('sequence_no'),
      ])

      if (notificationResult.error || locationResult.error) {
        setBoardMessage(
          notificationResult.error?.message ||
          locationResult.error?.message
        )
        setBoardLoading(false)
        return
      }

      streetNotifications = notificationResult.data || []
      streetLocationRows = locationResult.data || []
    }

    const todayStreetIds = new Set(
      streetInspections.map((item) => Number(item.id))
    )
    const yesterdayStreetIds = new Set(
      yesterdayStreetInspections.map((item) => Number(item.id))
    )

    const streetLocations = streetLocationRows.filter(
      (row) => todayStreetIds.has(Number(row.inspection_id))
    )
    const yesterdayStreetLocations = streetLocationRows.filter(
      (row) => yesterdayStreetIds.has(Number(row.inspection_id))
    )

    const nextStreetCounts = {}
    streetInspections.forEach((inspection) => {
      streetLocations
        .filter(
          (row) => Number(row.inspection_id) === Number(inspection.id)
        )
        .forEach((row) => {
          nextStreetCounts[
            `${row.location_text}|${inspection.agency_id}`
          ] = Number(row.faulty_count || 1)
        })
    })
    setStreetCounts(nextStreetCounts)

    setBoard({
      towers: towerResult.data || [],
      parks: parkResult.data || [],
      towerInspections: towerInspectionResult.data || [],
      parkInspections: parkInspectionResult.data || [],
      society: societyResult.data || null,
      serviceComplaints: (complaintResult.data || []).filter(
        (item) => item.complaint_date === today
      ),
      yesterdayComplaints: (complaintResult.data || []).filter(
        (item) =>
          item.complaint_date === yesterday &&
          !['DONE', 'NOT_REQUIRED'].includes(item.status) &&
          ['CAMERA_AMC', 'LED_AMC'].includes(item.service_type)
      ),
      agencies: agencyResult.data || [],
      serviceCategories: categoryResult.data || [],
      settings: settingsResult.data || null,
      streetInspections,
      yesterdayStreetInspections,
      streetLocations,
      yesterdayStreetLocations,
      streetNotifications,
    })

    setBoardLoading(false)
  }

  const returnHome = async () => {
    setInspectionTarget(null)
    setScreen('home')
    await loadBoard()
  }

  const openInspection = (type, id) => {
    setInspectionTarget({ type, id })
    setScreen('tower-park')
  }

  const saveGarbageStatus = async (field, value) => {
    setSavingGarbage(field)
    setBoardMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Login session expired.')
      }

      const now = new Date().toISOString()

      const { data, error } = await supabase
        .from('society_daily_inspections')
        .upsert(
          {
            inspection_date: today,
            [field]: value,
            inspected_by: user.id,
            saved_at: now,
            updated_at: now,
          },
          { onConflict: 'inspection_date' }
        )
        .select('garbage_collected,garbage_disposed,saved_at')
        .single()

      if (error) throw error

      setBoard((current) => ({
        ...current,
        society: data,
      }))
    } catch (error) {
      console.error(error)
      setBoardMessage(
        error?.message || 'Unable to save garbage status.'
      )
    } finally {
      setSavingGarbage(null)
    }
  }

  const getAgency = (serviceType) =>
    board.agencies.find(
      (agency) => agency.service_type === serviceType
    )

  const getCategory = (serviceType) =>
    board.serviceCategories.find(
      (category) => category.service_type === serviceType
    )

  const getIssueTowerNames = (serviceType) => {
    return board.towerInspections
      .filter((inspection) => {
        if (!inspection.saved_at) return false

        if (serviceType === 'CAMERA_AMC') {
          const camera =
            inspection.camera_working ??
            inspection.camera_led_working
          return camera === false
        }

        const led =
          inspection.led_screen_working ??
          inspection.camera_led_working
        return led === false
      })
      .map((inspection) => {
        const tower = board.towers.find(
          (item) => Number(item.id) === Number(inspection.tower_id)
        )
        return tower?.tower_name || `Tower ${inspection.tower_id}`
      })
  }

  const buildServiceComplaintMessage = (
    complaintDate,
    serviceType,
    issueSummary,
    issueCount,
    agency
  ) => {
    const category = getCategory(serviceType)
    const isCamera = serviceType === 'CAMERA_AMC'
    const itemLabel = isCamera ? 'कैमरा' : 'LED स्क्रीन'

    const supervisor = [
      board.settings?.supervisor_contact_name,
      board.settings?.supervisor_contact_mobile,
    ].filter(Boolean).join(' - ') || '—'

    const rwa = [
      category?.rwa_name,
      category?.rwa_mobile,
    ].filter(Boolean).join(' - ') || '—'

    return `दिनांक: ${formatDate(complaintDate)}
सेवा में ${agency?.agency_name || (isCamera ? 'Camera AMC' : 'LED AMC')},

पॉकेट-A, सेक्टर-105 के दैनिक निरीक्षण में ${issueCount} ${itemLabel} में समस्या पाई गई है।

स्थान: ${issueSummary}

कृपया आवश्यक जांच एवं मरम्मत जल्द से जल्द करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
  }

  const openServiceComplaint = async (
    serviceType,
    existingComplaint = null
  ) => {
    const agency =
      board.agencies.find(
        (item) =>
          Number(item.id) === Number(existingComplaint?.agency_id)
      ) || getAgency(serviceType)

    if (!agency) {
      setBoardMessage(
        serviceType === 'CAMERA_AMC'
          ? 'Camera AMC agency is not configured.'
          : 'LED AMC agency is not configured.'
      )
      return
    }

    const mobile = normalizeMobile(
      existingComplaint?.recipient_mobile || agency.mobile_no
    )

    if (mobile.length !== 12 || !mobile.startsWith('91')) {
      setBoardMessage(
        `Please configure a valid mobile number for ${agency.agency_name}.`
      )
      return
    }

    const issueTowerNames = existingComplaint
      ? String(existingComplaint.issue_summary || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : getIssueTowerNames(serviceType)

    if (issueTowerNames.length === 0) {
      setBoardMessage('No issue is currently recorded for this service.')
      return
    }

    const complaintDate = existingComplaint?.complaint_date || today
    const issueSummary = issueTowerNames.join(', ')
    const complaintMessage = buildServiceComplaintMessage(
      complaintDate,
      serviceType,
      issueSummary,
      issueTowerNames.length,
      agency
    )

    setSavingComplaint(
      `${complaintDate}-${serviceType}-whatsapp`
    )
    setBoardMessage('')

    const payload = {
      complaint_date: complaintDate,
      service_type: serviceType,
      agency_id: agency.id,
      issue_count: issueTowerNames.length,
      issue_summary: issueSummary,
      status: 'WHATSAPP_OPENED',
      recipient_name: agency.contact_name || agency.agency_name,
      recipient_mobile: mobile,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('society_service_complaints')
      .upsert(payload, {
        onConflict: 'complaint_date,service_type',
      })

    setSavingComplaint(null)

    if (error) {
      setBoardMessage(error.message)
      return
    }

    await loadBoard()

    window.location.href =
      `https://wa.me/${mobile}?text=${encodeURIComponent(complaintMessage)}`
  }

  const updateComplaintStatus = async (
    complaint,
    status
  ) => {
    setSavingComplaint(
      `${complaint.complaint_date}-${complaint.service_type}-${status}`
    )
    setBoardMessage('')

    const now = new Date().toISOString()
    const update = {
      status,
      updated_at: now,
    }

    if (status === 'SENT') {
      update.sent_at = now
    }

    if (status === 'DONE') {
      update.resolved_at = now
    }

    const { error } = await supabase
      .from('society_service_complaints')
      .update(update)
      .eq('id', complaint.id)

    setSavingComplaint(null)

    if (error) {
      setBoardMessage(error.message)
      return
    }

    await loadBoard()
  }

  const streetAgencies = board.agencies.filter(
    (agency) => agency.service_type === 'STREET_LIGHT'
  )

  const getStreetCount = (location, agencyId) =>
    Number(streetCounts[`${location}|${agencyId}`] || 0)

  const changeStreetCount = (location, agencyId, delta) => {
    const key = `${location}|${agencyId}`
    setStreetCounts((current) => ({
      ...current,
      [key]: Math.max(
        0,
        Math.min(50, Number(current[key] || 0) + delta)
      ),
    }))
  }

  const saveStreetLightMatrix = async () => {
    setSavingStreet(true)
    setBoardMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Login session expired.')

      const now = new Date().toISOString()

      for (const agency of streetAgencies) {
        const rows = STREET_LIGHT_LOCATIONS.map((location) => ({
          location,
          count: getStreetCount(location, agency.id),
        })).filter((item) => item.count > 0)

        const total = rows.reduce(
          (sum, item) => sum + item.count,
          0
        )

        const existing = board.streetInspections.find(
          (item) => Number(item.agency_id) === Number(agency.id)
        )

        const nextComplaintStatus =
          total === 0
            ? 'NOT_REQUIRED'
            : existing?.complaint_status &&
              existing.complaint_status !== 'NOT_REQUIRED'
            ? existing.complaint_status
            : 'PENDING'

        const { data: inspection, error: inspectionError } =
          await supabase
            .from('street_light_agency_daily_inspections')
            .upsert(
              {
                inspection_date: today,
                agency_id: agency.id,
                faulty_count: total,
                remarks: null,
                inspected_by: user.id,
                saved_at: now,
                complaint_status: nextComplaintStatus,
                updated_at: now,
              },
              { onConflict: 'inspection_date,agency_id' }
            )
            .select('id')
            .single()

        if (inspectionError) throw inspectionError

        const { error: deleteError } = await supabase
          .from('street_light_fault_locations')
          .delete()
          .eq('inspection_id', inspection.id)

        if (deleteError) throw deleteError

        if (rows.length > 0) {
          const { error: insertError } = await supabase
            .from('street_light_fault_locations')
            .insert(
              rows.map((item, index) => ({
                inspection_id: inspection.id,
                sequence_no: index + 1,
                location_text: item.location,
                faulty_count: item.count,
                status: 'OPEN',
              }))
            )

          if (insertError) throw insertError
        }
      }

      setBoardMessage('Street-light counts saved.')
      await loadBoard()
    } catch (error) {
      console.error(error)
      setBoardMessage(
        error?.message || 'Unable to save street-light counts.'
      )
    } finally {
      setSavingStreet(false)
    }
  }

  const getStreetRowsForInspection = (inspection, sourceRows) =>
    sourceRows.filter(
      (row) => Number(row.inspection_id) === Number(inspection.id)
    )

  const buildStreetComplaintMessage = (
    inspection,
    agency,
    sourceRows
  ) => {
    const rows = getStreetRowsForInspection(
      inspection,
      sourceRows
    )

    const detail = rows
      .map(
        (row) =>
          `${row.location_text}: ${row.faulty_count} faulty`
      )
      .join(', ')

    const category = board.serviceCategories.find(
      (item) => item.service_type === 'STREET_LIGHT'
    )

    const supervisor = [
      board.settings?.supervisor_contact_name,
      board.settings?.supervisor_contact_mobile,
    ].filter(Boolean).join(' - ') || '—'

    const rwa = [
      category?.rwa_name,
      category?.rwa_mobile,
    ].filter(Boolean).join(' - ') || '—'

    return `दिनांक: ${formatDate(inspection.inspection_date)}
सेवा में ${agency.agency_name},

पॉकेट-A, सेक्टर-105 में ${inspection.faulty_count} स्ट्रीट लाइट खराब पाई गई हैं।

स्थानवार विवरण: ${detail}

कृपया आवश्यक जांच एवं मरम्मत जल्द से जल्द करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: ${supervisor}
RWA Executive: ${rwa}

धन्यवाद
RWA Pocket-A`
  }

  const openStreetComplaint = async (
    inspection,
    sourceRows
  ) => {
    const agency = board.agencies.find(
      (item) => Number(item.id) === Number(inspection.agency_id)
    )

    if (!agency) {
      setBoardMessage('Street-light agency is not configured.')
      return
    }

    const mobile = normalizeMobile(agency.mobile_no)
    if (mobile.length !== 12 || !mobile.startsWith('91')) {
      setBoardMessage(
        `Please configure a valid mobile number for ${agency.agency_name}.`
      )
      return
    }

    const message = buildStreetComplaintMessage(
      inspection,
      agency,
      sourceRows
    )

    const now = new Date().toISOString()
    setSavingComplaint(
      `street-${inspection.id}-whatsapp`
    )
    setBoardMessage('')

    const { error: updateError } = await supabase
      .from('street_light_agency_daily_inspections')
      .update({
        complaint_status: 'WHATSAPP_OPENED',
        complaint_opened_at: now,
        resolved_at: null,
        updated_at: now,
      })
      .eq('id', inspection.id)

    if (updateError) {
      setSavingComplaint(null)
      setBoardMessage(updateError.message)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase
      .from('street_light_notifications')
      .insert({
        inspection_id: inspection.id,
        agency_id: agency.id,
        channel: 'WHATSAPP',
        recipient_name: agency.contact_name || agency.agency_name,
        recipient_mobile: mobile,
        message_text: message,
        delivery_status: 'COMPOSER_OPENED',
        sent_by: user?.id || null,
      })

    setSavingComplaint(null)
    await loadBoard()

    window.location.href =
      `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`
  }

  const updateStreetComplaintStatus = async (
    inspection,
    status
  ) => {
    const now = new Date().toISOString()
    setSavingComplaint(
      `street-${inspection.id}-${status}`
    )
    setBoardMessage('')

    const payload = {
      complaint_status: status,
      updated_at: now,
    }

    if (status === 'SENT') {
      payload.complaint_sent_at = now
    }

    if (status === 'DONE') {
      payload.resolved_at = now
    }

    const { error } = await supabase
      .from('street_light_agency_daily_inspections')
      .update(payload)
      .eq('id', inspection.id)

    if (error) {
      setSavingComplaint(null)
      setBoardMessage(error.message)
      return
    }

    if (status === 'SENT') {
      const latestNotification = board.streetNotifications.find(
        (item) =>
          Number(item.inspection_id) === Number(inspection.id)
      )

      if (latestNotification?.id) {
        await supabase
          .from('street_light_notifications')
          .update({
            delivery_status: 'SENT',
            sent_at: now,
          })
          .eq('id', latestNotification.id)
      }
    }

    setSavingComplaint(null)
    await loadBoard()
  }

  const getTowerInspection = (towerId) =>
    board.towerInspections.find(
      (inspection) => Number(inspection.tower_id) === Number(towerId)
    )

  const getParkInspection = (parkId) =>
    board.parkInspections.find(
      (inspection) => String(inspection.park_id) === String(parkId)
    )

  const cameraIssues = getIssueTowerNames('CAMERA_AMC')
  const ledIssues = getIssueTowerNames('LED_AMC')

  const cameraComplaint = board.serviceComplaints.find(
    (item) => item.service_type === 'CAMERA_AMC'
  )

  const ledComplaint = board.serviceComplaints.find(
    (item) => item.service_type === 'LED_AMC'
  )

  const totalStreetFaults = board.streetInspections.reduce(
    (total, item) => total + Number(item.faulty_count || 0),
    0
  )

  const streetComplaintPending = board.streetInspections.some(
    (inspection) =>
      Number(inspection.faulty_count || 0) > 0 &&
      !['SENT', 'DONE'].includes(inspection.complaint_status)
  )

  const completedTowers = board.towerInspections.filter(
    (inspection) => inspection.saved_at
  ).length

  const completedParks = board.parkInspections.filter(
    (inspection) => inspection.saved_at
  ).length

  if (screen === 'tower-park') {
    return (
      <div style={themeStyle}>
        <TowerInspection
          initialLocation={inspectionTarget}
          onBack={returnHome}
          onContinue={returnHome}
        />
      </div>
    )
  }

  if (screen === 'final-summary') {
    return (
      <div style={themeStyle}>
        <SocietyInspectionSummary
          onBack={returnHome}
        />
      </div>
    )
  }

  if (screen === 'agencies') {
    return (
      <div style={themeStyle}>
        <ServiceAgencies
          onBack={returnHome}
        />
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div style={themeStyle}>
        <SocietyInspectionSettings
          config={config}
          onSaved={setConfig}
          onBack={returnHome}
        />
      </div>
    )
  }

  return (
    <div className="society-operations-board" style={themeStyle}>
      <header className="society-operations-header">
        <button
          type="button"
          className="society-hub-back"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>

        <div className="society-operations-title">
          <div className="society-hub-brand">RWA POCKET-A</div>
          <h1>{loading ? 'Society Inspection' : config.module_name}</h1>
          <p>
            {completedTowers}/{board.towers.length} Towers •{' '}
            {completedParks}/{board.parks.length} Parks
          </p>
        </div>

        <div className="society-operations-header-actions">
          <button
            type="button"
            onClick={() => setScreen('agencies')}
            aria-label="Service agencies and contacts"
            title="Service Agencies & Contacts"
          >
            👥
          </button>
          <button
            type="button"
            onClick={() => setScreen('settings')}
            aria-label="Module settings"
            title="Module Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="society-operations-content">
        {boardLoading && (
          <div className="society-loading">
            Loading today's inspection board…
          </div>
        )}

        {!boardLoading && (
          <>
            <section className="operations-section">
              <div className="operations-section-heading">
                <strong>Towers</strong>
                <span>{completedTowers}/{board.towers.length} inspected</span>
              </div>

              <div className="operations-tower-grid">
                {board.towers.map((tower) => {
                  const inspection = getTowerInspection(tower.id)
                  const completed = Boolean(inspection?.saved_at)
                  const issue = towerHasIssue(inspection)

                  return (
                    <button
                      type="button"
                      key={tower.id}
                      className={`operations-location-tile ${
                        !completed
                          ? 'pending'
                          : issue
                          ? 'attention'
                          : 'done'
                      }`}
                      onClick={() => openInspection('tower', tower.id)}
                    >
                      <strong>
                        {tower.tower_name.replace('Tower ', 'Tower-')}
                      </strong>
                      <span>
                        {!completed
                          ? 'Scan QR'
                          : issue
                          ? 'Attention'
                          : 'Done'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="operations-section">
              <div className="operations-section-heading">
                <strong>Parks</strong>
                <span>{completedParks}/{board.parks.length} inspected</span>
              </div>

              <div className="operations-park-grid">
                {board.parks.map((park) => {
                  const inspection = getParkInspection(park.id)
                  const completed = Boolean(inspection?.saved_at)
                  const issue = parkHasIssue(inspection)

                  return (
                    <button
                      type="button"
                      key={park.id}
                      className={`operations-location-tile operations-park-tile ${
                        !completed
                          ? 'pending'
                          : issue
                          ? 'attention'
                          : 'done'
                      }`}
                      onClick={() => openInspection('park', park.id)}
                    >
                      <strong>
                        {park.park_name.replace('Park ', 'Park-')}
                      </strong>
                      <span>
                        {!completed
                          ? 'Scan QR'
                          : issue
                          ? 'Attention'
                          : 'Done'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="operations-garbage-grid">
              {[
                {
                  field: 'garbage_collected',
                  label: 'Garbage Collected',
                  value: board.society?.garbage_collected,
                },
                {
                  field: 'garbage_disposed',
                  label: 'Garbage Disposed',
                  value: board.society?.garbage_disposed,
                },
              ].map((item) => (
                <div className="operations-garbage-card" key={item.field}>
                  <strong>{item.label}</strong>
                  <span
                    className={
                      item.value === true
                        ? 'yes'
                        : item.value === false
                        ? 'no'
                        : 'pending'
                    }
                  >
                    {item.value === true
                      ? '✓ Yes'
                      : item.value === false
                      ? '✕ No'
                      : 'Pending'}
                  </span>

                  <div>
                    <button
                      type="button"
                      className={item.value === true ? 'selected yes' : ''}
                      disabled={savingGarbage === item.field}
                      onClick={() => saveGarbageStatus(item.field, true)}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={item.value === false ? 'selected no' : ''}
                      disabled={savingGarbage === item.field}
                      onClick={() => saveGarbageStatus(item.field, false)}
                    >
                      No
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="operations-action-stack">
              <div className="operations-inline-section">
                <button
                  type="button"
                  className="operations-action-row"
                  onClick={() =>
                    setCameraLedExpanded((current) => !current)
                  }
                  aria-expanded={cameraLedExpanded}
                >
                  <span className="operations-action-main">
                    <strong>Camera and LED Screen Complaints</strong>
                    <small>
                      Camera: {cameraIssues.length} issue{cameraIssues.length === 1 ? '' : 's'} •{' '}
                      {complaintStatusText(
                        cameraComplaint?.status,
                        cameraIssues.length > 0
                      )}
                      {'  '}| LED: {ledIssues.length} issue{ledIssues.length === 1 ? '' : 's'} •{' '}
                      {complaintStatusText(
                        ledComplaint?.status,
                        ledIssues.length > 0
                      )}
                    </small>
                  </span>
                  <span
                    className={`operations-action-arrow ${
                      cameraLedExpanded ? 'expanded' : ''
                    }`}
                  >
                    ⌄
                  </span>
                </button>

                {cameraLedExpanded && (
                  <div className="operations-inline-panel">
                    <div className="operations-inline-heading">
                      <strong>Today</strong>
                      <small>
                        Auto-populated from completed tower inspections
                      </small>
                    </div>

                    {[
                      {
                        serviceType: 'CAMERA_AMC',
                        label: 'Camera',
                        icon: '📷',
                        issues: cameraIssues,
                        complaint: cameraComplaint,
                      },
                      {
                        serviceType: 'LED_AMC',
                        label: 'LED Screen',
                        icon: '🖥️',
                        issues: ledIssues,
                        complaint: ledComplaint,
                      },
                    ].map((item) => (
                      <div
                        className="operations-complaint-card"
                        key={item.serviceType}
                      >
                        <div className="operations-complaint-card-top">
                          <div>
                            <strong>
                              {item.icon} {item.label}
                            </strong>
                            <span>
                              {item.issues.length === 0
                                ? 'All inspected towers are working'
                                : item.issues.join(', ')}
                            </span>
                          </div>
                          <b>
                            {complaintStatusText(
                              item.complaint?.status,
                              item.issues.length > 0
                            )}
                          </b>
                        </div>

                        {item.issues.length > 0 && (
                          <div className="operations-complaint-actions">
                            <button
                              type="button"
                              className="operations-whatsapp-button"
                              disabled={
                                savingComplaint ===
                                `${today}-${item.serviceType}-whatsapp`
                              }
                              onClick={() =>
                                openServiceComplaint(item.serviceType)
                              }
                            >
                              ↗ {item.complaint ? 'Resend WhatsApp' : 'Send WhatsApp'}
                            </button>

                            {item.complaint?.status === 'WHATSAPP_OPENED' && (
                              <button
                                type="button"
                                className="operations-mark-sent-button"
                                disabled={
                                  savingComplaint ===
                                  `${today}-${item.serviceType}-SENT`
                                }
                                onClick={() =>
                                  updateComplaintStatus(
                                    item.complaint,
                                    'SENT'
                                  )
                                }
                              >
                                ✓ Mark Sent
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {board.yesterdayComplaints.length > 0 && (
                      <>
                        <div className="operations-inline-heading yesterday">
                          <strong>Yesterday Pending Follow-up</strong>
                          <small>{formatDate(yesterday)}</small>
                        </div>

                        {board.yesterdayComplaints.map((complaint) => {
                          const label =
                            complaint.service_type === 'CAMERA_AMC'
                              ? 'Camera'
                              : 'LED Screen'

                          return (
                            <div
                              className="operations-complaint-card previous"
                              key={complaint.id}
                            >
                              <div className="operations-complaint-card-top">
                                <div>
                                  <strong>
                                    {complaint.service_type === 'CAMERA_AMC'
                                      ? '📷'
                                      : '🖥️'}{' '}
                                    {label}
                                  </strong>
                                  <span>
                                    {complaint.issue_summary || 'Issue reported'}
                                  </span>
                                </div>
                                <b>
                                  {complaintStatusText(
                                    complaint.status,
                                    true
                                  )}
                                </b>
                              </div>

                              <div className="operations-complaint-actions">
                                <button
                                  type="button"
                                  className="operations-whatsapp-button secondary"
                                  disabled={
                                    savingComplaint ===
                                    `${complaint.complaint_date}-${complaint.service_type}-whatsapp`
                                  }
                                  onClick={() =>
                                    openServiceComplaint(
                                      complaint.service_type,
                                      complaint
                                    )
                                  }
                                >
                                  ↗ Resend WhatsApp
                                </button>

                                <button
                                  type="button"
                                  className="operations-done-button"
                                  disabled={
                                    savingComplaint ===
                                    `${complaint.complaint_date}-${complaint.service_type}-DONE`
                                  }
                                  onClick={() =>
                                    updateComplaintStatus(
                                      complaint,
                                      'DONE'
                                    )
                                  }
                                >
                                  ✓ Mark Done
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}

                    {board.yesterdayComplaints.length === 0 && (
                      <div className="operations-no-previous">
                        No unresolved Camera/LED complaint from yesterday.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="operations-inline-section">
                <button
                  type="button"
                  className="operations-action-row"
                  onClick={() =>
                    setStreetExpanded((current) => !current)
                  }
                  aria-expanded={streetExpanded}
                >
                  <span className="operations-action-main">
                    <strong>Street Lights Complaints</strong>
                    <small>
                      {totalStreetFaults} faulty light{totalStreetFaults === 1 ? '' : 's'}
                      {' • '}
                      {totalStreetFaults === 0
                        ? 'No complaint required'
                        : streetComplaintPending
                        ? 'Complaint pending'
                        : 'Complaints sent'}
                    </small>
                  </span>
                  <span
                    className={`operations-action-arrow ${
                      streetExpanded ? 'expanded' : ''
                    }`}
                  >
                    ⌄
                  </span>
                </button>

                {streetExpanded && (
                  <div className="operations-inline-panel">
                    <div className="operations-inline-heading">
                      <strong>Today • Lane-wise Faults</strong>
                      <small>Use − / + to set faulty light count</small>
                    </div>

                    <div className="street-inline-matrix">
                      <div className="street-inline-matrix-head">
                        <span>Location</span>
                        {streetAgencies.map((agency) => (
                          <strong key={agency.id}>
                            {agency.agency_name}
                          </strong>
                        ))}
                      </div>

                      {STREET_LIGHT_LOCATIONS.map((location) => (
                        <div
                          className="street-inline-matrix-row"
                          key={location}
                        >
                          <strong>{location}</strong>

                          {streetAgencies.map((agency) => {
                            const count = getStreetCount(
                              location,
                              agency.id
                            )

                            return (
                              <div
                                className="street-inline-counter"
                                key={agency.id}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    changeStreetCount(
                                      location,
                                      agency.id,
                                      -1
                                    )
                                  }
                                  disabled={count === 0}
                                >
                                  −
                                </button>
                                <span>{count}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    changeStreetCount(
                                      location,
                                      agency.id,
                                      1
                                    )
                                  }
                                >
                                  +
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="street-inline-save-button"
                      disabled={savingStreet}
                      onClick={saveStreetLightMatrix}
                    >
                      {savingStreet
                        ? 'Saving…'
                        : 'Save Street Light Counts'}
                    </button>

                    {board.streetInspections
                      .filter(
                        (inspection) =>
                          Number(inspection.faulty_count || 0) > 0
                      )
                      .map((inspection) => {
                        const agency = board.agencies.find(
                          (item) =>
                            Number(item.id) ===
                            Number(inspection.agency_id)
                        )

                        const rows = getStreetRowsForInspection(
                          inspection,
                          board.streetLocations
                        )

                        return (
                          <div
                            className="operations-complaint-card"
                            key={inspection.id}
                          >
                            <div className="operations-complaint-card-top">
                              <div>
                                <strong>
                                  💡 {agency?.agency_name || 'Street Light Agency'}
                                </strong>
                                <span>
                                  {rows
                                    .map(
                                      (row) =>
                                        `${row.location_text}: ${row.faulty_count}`
                                    )
                                    .join(' • ')}
                                </span>
                              </div>
                              <b>
                                {complaintStatusText(
                                  inspection.complaint_status,
                                  true
                                )}
                              </b>
                            </div>

                            <div className="operations-complaint-actions">
                              <button
                                type="button"
                                className="operations-whatsapp-button"
                                disabled={
                                  savingComplaint ===
                                  `street-${inspection.id}-whatsapp`
                                }
                                onClick={() =>
                                  openStreetComplaint(
                                    inspection,
                                    board.streetLocations
                                  )
                                }
                              >
                                ↗ {['NOT_REQUIRED', 'PENDING'].includes(
                                  inspection.complaint_status
                                )
                                  ? 'Send WhatsApp'
                                  : 'Resend WhatsApp'}
                              </button>

                              {inspection.complaint_status ===
                                'WHATSAPP_OPENED' && (
                                <button
                                  type="button"
                                  className="operations-mark-sent-button"
                                  disabled={
                                    savingComplaint ===
                                    `street-${inspection.id}-SENT`
                                  }
                                  onClick={() =>
                                    updateStreetComplaintStatus(
                                      inspection,
                                      'SENT'
                                    )
                                  }
                                >
                                  ✓ Mark Sent
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                    <div className="operations-inline-heading yesterday">
                      <strong>Yesterday Pending Follow-up</strong>
                      <small>{formatDate(yesterday)}</small>
                    </div>

                    {board.yesterdayStreetInspections.length === 0 && (
                      <div className="operations-no-previous">
                        No unresolved street-light complaint from yesterday.
                      </div>
                    )}

                    {board.yesterdayStreetInspections.map(
                      (inspection) => {
                        const agency = board.agencies.find(
                          (item) =>
                            Number(item.id) ===
                            Number(inspection.agency_id)
                        )

                        const rows = getStreetRowsForInspection(
                          inspection,
                          board.yesterdayStreetLocations
                        )

                        return (
                          <div
                            className="operations-complaint-card previous"
                            key={inspection.id}
                          >
                            <div className="operations-complaint-card-top">
                              <div>
                                <strong>
                                  💡 {agency?.agency_name || 'Street Light Agency'}
                                </strong>
                                <span>
                                  {rows
                                    .map(
                                      (row) =>
                                        `${row.location_text}: ${row.faulty_count}`
                                    )
                                    .join(' • ')}
                                </span>
                              </div>
                              <b>
                                {complaintStatusText(
                                  inspection.complaint_status,
                                  true
                                )}
                              </b>
                            </div>

                            <div className="operations-complaint-actions">
                              <button
                                type="button"
                                className="operations-whatsapp-button secondary"
                                disabled={
                                  savingComplaint ===
                                  `street-${inspection.id}-whatsapp`
                                }
                                onClick={() =>
                                  openStreetComplaint(
                                    inspection,
                                    board.yesterdayStreetLocations
                                  )
                                }
                              >
                                ↗ Resend WhatsApp
                              </button>

                              <button
                                type="button"
                                className="operations-done-button"
                                disabled={
                                  savingComplaint ===
                                  `street-${inspection.id}-DONE`
                                }
                                onClick={() =>
                                  updateStreetComplaintStatus(
                                    inspection,
                                    'DONE'
                                  )
                                }
                              >
                                ✓ Mark Done
                              </button>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </section>

            <button
              type="button"
              className="operations-final-report-button"
              onClick={() => setScreen('final-summary')}
            >
              Generate and Share Summary Report
            </button>
          </>
        )}

        {boardMessage && (
          <div className="street-light-message">
            {boardMessage}
          </div>
        )}
      </main>
    </div>
  )
}
