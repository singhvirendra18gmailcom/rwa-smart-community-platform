import { useEffect, useMemo, useState } from 'react'
import TowerInspection from './TowerInspection'
import StreetLightInspection from './StreetLightInspection'
import SocietyInspectionSettings from './SocietyInspectionSettings'
import ServiceAgencies from './ServiceAgencies'
import InspectionActionSummary from './InspectionActionSummary'
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
  if (status === 'SENT') return 'Complaint sent'
  if (status === 'WHATSAPP_OPENED') return 'WhatsApp opened'
  return 'Complaint pending'
}

export default function SocietyInspection({ onBack }) {
  const today = useMemo(() => getIndiaDate(), [])
  const [screen, setScreen] = useState('home')
  const [inspectionTarget, setInspectionTarget] = useState(null)

  const [boardLoading, setBoardLoading] = useState(true)
  const [boardMessage, setBoardMessage] = useState('')
  const [savingGarbage, setSavingGarbage] = useState(null)
  const [board, setBoard] = useState({
    towers: [],
    parks: [],
    towerInspections: [],
    parkInspections: [],
    society: null,
    serviceComplaints: [],
    agencies: [],
    streetInspections: [],
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
        .select('service_type,status,issue_count,issue_summary')
        .eq('complaint_date', today),
      supabase
        .from('society_service_agencies')
        .select('id,agency_name,service_type')
        .eq('active', true),
      supabase
        .from('street_light_agency_daily_inspections')
        .select('id,agency_id,faulty_count,saved_at')
        .eq('inspection_date', today),
    ])

    const error =
      towerResult.error ||
      parkResult.error ||
      towerInspectionResult.error ||
      parkInspectionResult.error ||
      societyResult.error ||
      complaintResult.error ||
      agencyResult.error ||
      streetInspectionResult.error

    if (error) {
      setBoardMessage(error.message)
      setBoardLoading(false)
      return
    }

    const streetInspections = streetInspectionResult.data || []
    const streetIds = streetInspections.map((item) => item.id)
    let streetNotifications = []

    if (streetIds.length > 0) {
      const notificationResult = await supabase
        .from('street_light_notifications')
        .select('id,inspection_id,agency_id,delivery_status,created_at')
        .in('inspection_id', streetIds)
        .eq('channel', 'WHATSAPP')
        .order('created_at', { ascending: false })

      if (notificationResult.error) {
        setBoardMessage(notificationResult.error.message)
        setBoardLoading(false)
        return
      }

      streetNotifications = notificationResult.data || []
    }

    setBoard({
      towers: towerResult.data || [],
      parks: parkResult.data || [],
      towerInspections: towerInspectionResult.data || [],
      parkInspections: parkInspectionResult.data || [],
      society: societyResult.data || null,
      serviceComplaints: complaintResult.data || [],
      agencies: agencyResult.data || [],
      streetInspections,
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

  const getTowerInspection = (towerId) =>
    board.towerInspections.find(
      (inspection) => Number(inspection.tower_id) === Number(towerId)
    )

  const getParkInspection = (parkId) =>
    board.parkInspections.find(
      (inspection) => String(inspection.park_id) === String(parkId)
    )

  const cameraIssues = board.towerInspections.filter((inspection) => {
    const camera =
      inspection.camera_working ??
      inspection.camera_led_working
    return inspection.saved_at && camera === false
  })

  const ledIssues = board.towerInspections.filter((inspection) => {
    const led =
      inspection.led_screen_working ??
      inspection.camera_led_working
    return inspection.saved_at && led === false
  })

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

  const streetComplaintPending = board.streetInspections.some((inspection) => {
    if (!inspection.saved_at || Number(inspection.faulty_count || 0) === 0) {
      return false
    }

    const latest = board.streetNotifications.find(
      (notification) =>
        Number(notification.agency_id) === Number(inspection.agency_id)
    )

    return latest?.delivery_status !== 'SENT'
  })

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
          onContinue={() => setScreen('actions')}
        />
      </div>
    )
  }

  if (screen === 'street-lights') {
    return (
      <div style={themeStyle}>
        <StreetLightInspection
          config={config}
          onBack={returnHome}
          onContinue={() => setScreen('final-summary')}
        />
      </div>
    )
  }

  if (screen === 'actions') {
    return (
      <div style={themeStyle}>
        <InspectionActionSummary
          onBack={returnHome}
          onStreetLights={() => setScreen('street-lights')}
          onFinalSummary={() => setScreen('final-summary')}
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
              <button
                type="button"
                className="operations-action-row"
                onClick={() => setScreen('actions')}
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
                <span className="operations-action-arrow">⌄</span>
              </button>

              <button
                type="button"
                className="operations-action-row"
                onClick={() => setScreen('street-lights')}
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
                <span className="operations-action-arrow">⌄</span>
              </button>
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
