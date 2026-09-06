import { useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from './supabase'
import './TowerInspection.css'

const MAX_GPS_ACCURACY_M = 50
const INSPECTION_VALIDITY_MINUTES = 10

const DEFAULT_STREET_LIGHTS = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
]

const STREET_LIGHT_POSITIONS = [
  'Top Left',
  'Top Right',
  'Right Upper',
  'Right Lower',
  'Bottom Right',
  'Bottom Left',
  'Left Lower',
  'Left Upper',
]

const REPORT_FOOTER =
  'Powered by the RWA Pocket-A in-house App — a step towards smarter, transparent & technology-driven RWA management.'

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function formatDate(dateString) {
  if (!dateString) return ''

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00+05:30`))
}

function formatTime(dateString) {
  if (!dateString) return ''

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateString))
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const earthRadiusM = 6371000
  const toRadians = (value) => (value * Math.PI) / 180

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )

  return earthRadiusM * c
}

function extractQrToken(decodedText) {
  if (!decodedText) return null

  const value = decodedText.trim()

  if (value.startsWith('RWA-TOWER:')) {
    return value.substring('RWA-TOWER:'.length).trim()
  }

  if (value.startsWith('RWA-PARK:')) {
    return value.substring('RWA-PARK:'.length).trim()
  }

  try {
    const url = new URL(value)

    const towerToken = url.searchParams.get('tower')
    if (towerToken) return towerToken.trim()

    const parkToken = url.searchParams.get('park')
    if (parkToken) return parkToken.trim()
  } catch {
    // Plain text QR.
  }

  return value
}

function normaliseStreetLights(value) {
  if (Array.isArray(value) && value.length === 8) {
    return value.map((item) => item !== false)
  }

  return [...DEFAULT_STREET_LIGHTS]
}

function getStreetLightFailures(status) {
  return normaliseStreetLights(status)
    .map((working, index) => ({
      working,
      index,
      label: STREET_LIGHT_POSITIONS[index],
    }))
    .filter((light) => !light.working)
}

function inspectionHasIssue(type, inspection) {
  if (!inspection) return false

  if (type === 'park') {
    return (
      inspection.sweeping_done === false ||
      inspection.grass_properly_cut === false ||
      inspection.benches_well_placed === false ||
      inspection.swings_not_broken === false ||
      inspection.watering_needed === true ||
      inspection.street_lights_all_lit === false ||
      inspection.other_issue === true
    )
  }

  const camera =
    inspection.camera_working ??
    inspection.camera_led_working

  const led =
    inspection.led_screen_working ??
    inspection.camera_led_working

  const streetFailureCount =
    getStreetLightFailures(
      inspection.street_light_status
    ).length

  return (
    inspection.sweeping_done === false ||
    camera === false ||
    led === false ||
    inspection.water_leakage === true ||
    streetFailureCount > 0 ||
    inspection.other_issue === true ||
    (
      inspection.lights_working_count !== null &&
      inspection.lights_working_count < 9
    )
  )
}

function InspectionToggle({
  icon,
  label,
  positiveText,
  negativeText,
  value,
  onChange,
}) {
  return (
    <div className="inspection-item">

      <div className="inspection-item-heading">
        <span className="inspection-item-icon">
          {icon}
        </span>

        <strong>{label}</strong>
      </div>

      <div className="inspection-toggle-row">

        <button
          type="button"
          className={`inspection-option inspection-option-good ${
            value === true ? 'selected' : ''
          }`}
          onClick={() => onChange(true)}
        >
          ✅ {positiveText}
        </button>

        <button
          type="button"
          className={`inspection-option inspection-option-bad ${
            value === false ? 'selected' : ''
          }`}
          onClick={() => onChange(false)}
        >
          ❌ {negativeText}
        </button>

      </div>

    </div>
  )
}

function StreetLightMap({
  locationName,
  status,
  readOnly = false,
  onToggle,
}) {
  const lights = normaliseStreetLights(status)

  const failedCount =
    lights.filter((working) => !working).length

  return (
    <div className="street-light-section">

      <div className="street-light-heading">

        <div>
          <strong>💡 Nearby Street Lights</strong>
          <p>Approximate positions</p>
        </div>

        <span
          className={`street-light-count ${
            failedCount > 0
              ? 'street-light-count-bad'
              : 'street-light-count-good'
          }`}
        >
          {failedCount === 0
            ? '✅ All OK'
            : `⚠ ${failedCount} not working`}
        </span>

      </div>

      {!readOnly && (
        <div className="street-light-help">
          Tap the approximate position where a light is not working.
        </div>
      )}

      <div className="street-light-map">

        {lights.map((working, index) => (
          <button
            key={index}
            type="button"
            disabled={readOnly}
            className={`street-light-dot street-light-dot-${
              index + 1
            } ${
              working
                ? 'working'
                : 'not-working'
            }`}
            onClick={() => onToggle?.(index)}
          />
        ))}

        <div className="street-light-tower">
          <span>🏢</span>
          <strong>{locationName}</strong>
        </div>

      </div>

    </div>
  )
}

function InspectionLocationRow({
  location,
  inspection,
  onScan,
  onReport,
  onShare,
}) {
  const completed = Boolean(inspection?.saved_at)

  const issue =
    completed &&
    inspectionHasIssue(location.type, inspection)

  return (
    <div
      className={`inspection-location-row ${
        completed
          ? issue
            ? 'location-attention'
            : 'location-complete'
          : 'location-pending'
      }`}
    >

      <div className="inspection-location-main">

        <div className="inspection-location-icon">
          {location.type === 'park' ? '🌳' : '🏢'}
        </div>

        <div className="inspection-location-info">

          <strong>{location.name}</strong>

          <span
            className={`inspection-location-status ${
              completed
                ? issue
                  ? 'attention'
                  : 'done'
                : 'pending'
            }`}
          >
            {!completed
              ? '⏳ Pending'
              : issue
              ? '⚠️ Attention Required'
              : '✅ Done'}
          </span>

        </div>

      </div>

      <div className="inspection-location-actions">

        {!completed && (
          <button
            type="button"
            className="location-scan-button"
            onClick={() => onScan(location)}
          >
            📷 Scan QR
          </button>
        )}

        {completed && (
          <>
            <button
              type="button"
              className="location-rescan-button"
              onClick={() => onScan(location)}
            >
              📷 Scan Again
            </button>

            <button
              type="button"
              className="location-report-button"
              onClick={() => onReport(location)}
            >
              📄 Report
            </button>

            {location.type === 'tower' && (
              <button
                type="button"
                className="location-share-button"
                onClick={() =>
                  onShare(location, inspection)
                }
              >
                📲 Share
              </button>
            )}
          </>
        )}

      </div>

    </div>
  )
}

function TowerInspection({ onBack }) {
  const today =
    useMemo(() => getIndiaDate(), [])

  const scannerRef = useRef(null)
  const scanLockedRef = useRef(false)

  const [screen, setScreen] = useState('list')

  const [towers, setTowers] = useState([])
  const [parks, setParks] = useState([])

  const [
    towerInspections,
    setTowerInspections,
  ] = useState([])

  const [
    parkInspections,
    setParkInspections,
  ] = useState([])

  const [
    societyGarbageDisposed,
    setSocietyGarbageDisposed,
  ] = useState(null)

  const [
    societySaving,
    setSocietySaving,
  ] = useState(false)

  const [
    societySaved,
    setSocietySaved,
  ] = useState(false)

  const [loading, setLoading] = useState(true)

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState(null)

  const [
    scannerActive,
    setScannerActive,
  ] = useState(false)

  const [
    scannerStarting,
    setScannerStarting,
  ] = useState(false)

  const [
    gpsLoading,
    setGpsLoading,
  ] = useState(false)

  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  const [
    gpsFailureReason,
    setGpsFailureReason,
  ] = useState('')

  const [
    qrScannedAt,
    setQrScannedAt,
  ] = useState(null)

  const [
    scanLatitude,
    setScanLatitude,
  ] = useState(null)

  const [
    scanLongitude,
    setScanLongitude,
  ] = useState(null)

  const [
    gpsAccuracy,
    setGpsAccuracy,
  ] = useState(null)

  const [
    distanceFromLocation,
    setDistanceFromLocation,
  ] = useState(null)

  const [
    sweepingDone,
    setSweepingDone,
  ] = useState(null)

  const [
    moppingDone,
    setMoppingDone,
  ] = useState(null)

  const [
    cameraWorking,
    setCameraWorking,
  ] = useState(null)

  const [
    ledScreenWorking,
    setLedScreenWorking,
  ] = useState(null)

  const [
    lightsWorkingCount,
    setLightsWorkingCount,
  ] = useState(null)

  const [
    waterLeakage,
    setWaterLeakage,
  ] = useState(null)

  const [
    streetLightStatus,
    setStreetLightStatus,
  ] = useState([
    ...DEFAULT_STREET_LIGHTS,
  ])

  const [
    grassProperlyCut,
    setGrassProperlyCut,
  ] = useState(null)

  const [
    benchesWellPlaced,
    setBenchesWellPlaced,
  ] = useState(null)

  const [
    swingsNotBroken,
    setSwingsNotBroken,
  ] = useState(null)

  const [
    wateringNeeded,
    setWateringNeeded,
  ] = useState(null)

  const [
    parkStreetLightsAllLit,
    setParkStreetLightsAllLit,
  ] = useState(null)

  const [
    parkStreetLightsNotLitCount,
    setParkStreetLightsNotLitCount,
  ] = useState(0)

  const [
    otherIssue,
    setOtherIssue,
  ] = useState(false)

  const [
    otherIssueDetails,
    setOtherIssueDetails,
  ] = useState('')

  const [
    remarks,
    setRemarks,
  ] = useState('')

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    saved,
    setSaved,
  ] = useState(false)

  const [
    savedAt,
    setSavedAt,
  ] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    if (
      !scannerActive ||
      screen !== 'scanner'
    ) {
      return
    }

    let cancelled = false

    async function openScanner() {
      try {
        setScannerStarting(true)
        setError('')
        scanLockedRef.current = false

        const scanner =
          new Html5Qrcode('tower-qr-reader')

        scannerRef.current = scanner

        await scanner.start(
          {
            facingMode: 'environment',
          },
          {
            fps: 10,
            qrbox: {
              width: 240,
              height: 240,
            },
          },
          handleQrScanned,
          () => {}
        )

        if (cancelled) {
          await stopScanner()
        }
      } catch (err) {
        console.error(err)

        setError(
          'Unable to open camera. Please allow camera permission and try again.'
        )

        setScannerActive(false)
      } finally {
        setScannerStarting(false)
      }
    }

    const timer =
      window.setTimeout(openScanner, 100)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [scannerActive, screen])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  function mapTower(tower) {
    return {
      id: tower.id,
      type: 'tower',
      name: tower.tower_name,
      qr_token: tower.qr_token,
      latitude: tower.latitude,
      longitude: tower.longitude,
      allowed_radius_m:
        tower.allowed_radius_m,
      display_order:
        tower.display_order,
    }
  }

  function mapPark(park) {
    return {
      id: park.id,
      type: 'park',
      name: park.park_name,
      qr_token: park.qr_token,
      latitude: park.latitude,
      longitude: park.longitude,
      allowed_radius_m:
        park.allowed_radius_m,
      display_order:
        park.display_order,
    }
  }

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {
      const [
        towerResponse,
        parkResponse,
        societyResponse,
      ] = await Promise.all([
        supabase
          .from('towers')
          .select('*')
          .eq('active', true)
          .order('display_order', {
            ascending: true,
          }),

        supabase
          .from('parks')
          .select('*')
          .eq('active', true)
          .order('display_order', {
            ascending: true,
          }),

        supabase
          .from('society_daily_inspections')
          .select('*')
          .eq('inspection_date', today)
          .maybeSingle(),
      ])

      if (towerResponse.error) {
        throw towerResponse.error
      }

      if (parkResponse.error) {
        throw parkResponse.error
      }

      if (societyResponse.error) {
        throw societyResponse.error
      }

      const towerData =
        towerResponse.data || []

      const parkData =
        parkResponse.data || []

      setTowers(towerData)
      setParks(parkData)

      setSocietyGarbageDisposed(
        societyResponse.data?.garbage_disposed ??
          null
      )

      setSocietySaved(
        Boolean(
          societyResponse.data?.saved_at
        )
      )

      const towerIds =
        towerData.map((tower) => tower.id)

      const parkIds =
        parkData.map((park) => park.id)

      if (towerIds.length > 0) {
        const {
          data,
          error: inspectionError,
        } = await supabase
          .from('tower_daily_inspections')
          .select('*')
          .eq('inspection_date', today)
          .in('tower_id', towerIds)

        if (inspectionError) {
          throw inspectionError
        }

        setTowerInspections(data || [])
      } else {
        setTowerInspections([])
      }

      if (parkIds.length > 0) {
        const {
          data,
          error: parkError,
        } = await supabase
          .from('park_daily_inspections')
          .select('*')
          .eq('inspection_date', today)
          .in('park_id', parkIds)

        if (parkError) {
          throw parkError
        }

        setParkInspections(data || [])
      } else {
        setParkInspections([])
      }
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to load inspection data.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current

    if (!scanner) return

    try {
      if (scanner.isScanning) {
        await scanner.stop()
      }
    } catch (err) {
      console.warn(
        'Scanner stop warning:',
        err
      )
    }

    try {
      scanner.clear()
    } catch {
      // Already cleared.
    }

    scannerRef.current = null
  }

  function getInspection(location) {
    if (!location) return null

    if (location.type === 'park') {
      return parkInspections.find(
        (inspection) =>
          inspection.park_id === location.id
      )
    }

    return towerInspections.find(
      (inspection) =>
        inspection.tower_id === location.id
    )
  }

  function resetForm() {
    setSweepingDone(null)
    setMoppingDone(null)
    setCameraWorking(null)
    setLedScreenWorking(null)
    setLightsWorkingCount(null)
    setWaterLeakage(null)

    setStreetLightStatus([
      ...DEFAULT_STREET_LIGHTS,
    ])

    setGrassProperlyCut(null)
    setBenchesWellPlaced(null)
    setSwingsNotBroken(null)
    setWateringNeeded(null)

    setParkStreetLightsAllLit(null)
    setParkStreetLightsNotLitCount(0)

    setOtherIssue(false)
    setOtherIssueDetails('')
    setRemarks('')

    setSaved(false)
    setSavedAt(null)

    setInfoMessage('')
  }

  function setTowerDefaultValues() {
    setSweepingDone(true)
    setMoppingDone(true)
    setCameraWorking(true)
    setLedScreenWorking(true)
    setLightsWorkingCount(9)
    setWaterLeakage(false)

    setStreetLightStatus([
      ...DEFAULT_STREET_LIGHTS,
    ])

    setOtherIssue(false)
    setOtherIssueDetails('')
    setRemarks('')
  }

  function populateForm(
    location,
    inspection
  ) {
    resetForm()

    if (!inspection) {
      if (location.type === 'tower') {
        setTowerDefaultValues()
      }

      return
    }

    setSweepingDone(
      inspection.sweeping_done
    )

    if (location.type === 'tower') {
      setMoppingDone(
        inspection.mopping_done
      )

      setCameraWorking(
        inspection.camera_working ??
          inspection.camera_led_working ??
          null
      )

      setLedScreenWorking(
        inspection.led_screen_working ??
          inspection.camera_led_working ??
          null
      )

      setLightsWorkingCount(
        inspection.lights_working_count
      )

      setWaterLeakage(
        inspection.water_leakage ?? false
      )

      setStreetLightStatus(
        normaliseStreetLights(
          inspection.street_light_status
        )
      )
    } else {
      setGrassProperlyCut(
        inspection.grass_properly_cut
      )

      setBenchesWellPlaced(
        inspection.benches_well_placed
      )

      setSwingsNotBroken(
        inspection.swings_not_broken
      )

      setWateringNeeded(
        inspection.watering_needed
      )

      setParkStreetLightsAllLit(
        inspection.street_lights_all_lit
      )

      setParkStreetLightsNotLitCount(
        inspection.street_lights_not_lit_count ||
          0
      )
    }

    setOtherIssue(
      inspection.other_issue ?? false
    )

    setOtherIssueDetails(
      inspection.other_issue_details || ''
    )

    setRemarks(
      inspection.remarks || ''
    )

    setSaved(
      Boolean(inspection.saved_at)
    )

    setSavedAt(
      inspection.saved_at
    )
  }

  async function startLocationScan(location) {
    await stopScanner()

    setSelectedLocation(location)
    resetForm()

    setQrScannedAt(null)
    setScanLatitude(null)
    setScanLongitude(null)
    setGpsAccuracy(null)
    setDistanceFromLocation(null)
    setGpsFailureReason('')
    setError('')

    setScreen('scanner')
    setScannerActive(true)
  }

  async function handleQrScanned(
    decodedText
  ) {
    if (scanLockedRef.current) return

    scanLockedRef.current = true

    const token =
      extractQrToken(decodedText)

    const allLocationsForScan = [
      ...towers.map(mapTower),
      ...parks.map(mapPark),
    ]

    const scannedLocation =
      allLocationsForScan.find(
        (location) =>
          location.qr_token === token
      )

    if (!scannedLocation) {
      setError(
        'This is not a valid RWA Pocket-A inspection QR code.'
      )

      window.setTimeout(() => {
        scanLockedRef.current = false
      }, 1200)

      return
    }

    if (
      scannedLocation.type !==
        selectedLocation.type ||
      scannedLocation.id !==
        selectedLocation.id
    ) {
      setError(
        `Wrong QR code. You selected ${selectedLocation.name}, but scanned ${scannedLocation.name}.`
      )

      window.setTimeout(() => {
        scanLockedRef.current = false
      }, 1500)

      return
    }

    await stopScanner()

    setScannerActive(false)
    setError('')

    const scanTime =
      new Date().toISOString()

    setQrScannedAt(scanTime)

    const existingInspection =
      getInspection(selectedLocation)

    populateForm(
      selectedLocation,
      existingInspection
    )

    setScreen('verification')

    verifyGps(selectedLocation)
  }

  function verifyGps(location) {
    if (!location) return

    setGpsLoading(true)
    setGpsFailureReason('')
    setError('')

    if (!navigator.geolocation) {
      setGpsFailureReason(
        'GPS is not supported by this device/browser.'
      )

      setGpsLoading(false)
      return
    }

    if (
      location.latitude == null ||
      location.longitude == null
    ) {
      setGpsFailureReason(
        `GPS coordinates are not configured for ${location.name}.`
      )

      setGpsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude =
          position.coords.latitude

        const longitude =
          position.coords.longitude

        const accuracy =
          position.coords.accuracy

        const distance =
          calculateDistance(
            latitude,
            longitude,
            Number(location.latitude),
            Number(location.longitude)
          )

        setScanLatitude(latitude)
        setScanLongitude(longitude)
        setGpsAccuracy(accuracy)
        setDistanceFromLocation(distance)

        if (
          accuracy >
          MAX_GPS_ACCURACY_M
        ) {
          setGpsFailureReason(
            `GPS accuracy is currently ±${Math.round(
              accuracy
            )} m. Please move to an open area and try again.`
          )

          setGpsLoading(false)
          return
        }

        if (
          distance >
          Number(location.allowed_radius_m)
        ) {
          setGpsFailureReason(
            `You are approximately ${Math.round(
              distance
            )} m away from ${location.name}. Allowed distance is ${location.allowed_radius_m} m.`
          )

          setGpsLoading(false)
          return
        }

        setGpsFailureReason('')
        setGpsLoading(false)
        setScreen('form')
      },

      (geoError) => {
        console.error(geoError)

        let message =
          'Unable to obtain your current GPS location.'

        if (
          geoError.code ===
          geoError.PERMISSION_DENIED
        ) {
          message =
            'Location permission is blocked. Please allow location access and try again.'
        }

        if (
          geoError.code ===
          geoError.POSITION_UNAVAILABLE
        ) {
          message =
            'GPS location is currently unavailable. Please move to an open area and try again.'
        }

        if (
          geoError.code ===
          geoError.TIMEOUT
        ) {
          message =
            'GPS location request timed out. Please try again.'
        }

        setGpsFailureReason(message)
        setGpsLoading(false)
      },

      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )
  }

  function isScanStillValid() {
    if (!qrScannedAt) return false

    const scanTime =
      new Date(qrScannedAt).getTime()

    const minutes =
      (Date.now() - scanTime) /
      1000 /
      60

    return (
      minutes <=
      INSPECTION_VALIDITY_MINUTES
    )
  }

  const isPark =
    selectedLocation?.type === 'park'

  const towerChecklistComplete =
    sweepingDone !== null &&
    moppingDone !== null &&
    cameraWorking !== null &&
    ledScreenWorking !== null &&
    lightsWorkingCount !== null &&
    waterLeakage !== null

  const parkChecklistComplete =
    sweepingDone !== null &&
    grassProperlyCut !== null &&
    benchesWellPlaced !== null &&
    swingsNotBroken !== null &&
    wateringNeeded !== null &&
    parkStreetLightsAllLit !== null &&
    (
      parkStreetLightsAllLit === true ||
      parkStreetLightsNotLitCount > 0
    )

  const checklistComplete =
    isPark
      ? parkChecklistComplete
      : towerChecklistComplete

  const towerStreetFailures =
    getStreetLightFailures(
      streetLightStatus
    )

  const hasIssue =
    isPark
      ? (
          sweepingDone === false ||
          grassProperlyCut === false ||
          benchesWellPlaced === false ||
          swingsNotBroken === false ||
          wateringNeeded === true ||
          parkStreetLightsAllLit === false ||
          otherIssue === true
        )
      : (
          sweepingDone === false ||
          cameraWorking === false ||
          ledScreenWorking === false ||
          waterLeakage === true ||
          towerStreetFailures.length > 0 ||
          otherIssue === true ||
          (
            lightsWorkingCount !== null &&
            lightsWorkingCount < 9
          )
        )

  function markChanged() {
    setSaved(false)
    setInfoMessage('')
  }

  function toggleStreetLight(index) {
    markChanged()

    setStreetLightStatus(
      (current) =>
        current.map(
          (working, currentIndex) =>
            currentIndex === index
              ? !working
              : working
        )
    )
  }

  function decreaseLights() {
    markChanged()

    setLightsWorkingCount(
      (current) => {
        if (current === null) {
          return 8
        }

        return Math.max(
          0,
          current - 1
        )
      }
    )
  }

  function increaseLights() {
    markChanged()

    setLightsWorkingCount(
      (current) => {
        if (current === null) {
          return 9
        }

        return Math.min(
          9,
          current + 1
        )
      }
    )
  }

  function decreaseParkStreetLights() {
    markChanged()

    setParkStreetLightsNotLitCount(
      (current) =>
        Math.max(
          1,
          current - 1
        )
    )
  }

  function increaseParkStreetLights() {
    markChanged()

    setParkStreetLightsNotLitCount(
      (current) => current + 1
    )
  }

  async function saveSocietyGarbage() {
    if (
      societyGarbageDisposed === null
    ) {
      setError(
        'Please select Yes or No for Garbage Disposal.'
      )

      return
    }

    setSocietySaving(true)
    setError('')
    setInfoMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          'Login session expired.'
        )
      }

      const now =
        new Date().toISOString()

      const {
        error: saveError,
      } = await supabase
        .from('society_daily_inspections')
        .upsert(
          {
            inspection_date: today,
            garbage_disposed:
              societyGarbageDisposed,
            inspected_by: user.id,
            saved_at: now,
            updated_at: now,
          },
          {
            onConflict:
              'inspection_date',
          }
        )

      if (saveError) {
        throw saveError
      }

      setSocietySaved(true)

      setInfoMessage(
        'Society garbage disposal status saved.'
      )
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to save garbage disposal status.'
      )
    } finally {
      setSocietySaving(false)
    }
  }

  async function saveInspection() {
    setError('')
    setInfoMessage('')

    if (!isScanStillValid()) {
      setError(
        'QR/GPS verification has expired. Please scan the QR again.'
      )

      return
    }

    if (!checklistComplete) {
      setError(
        'Please complete all required inspection items.'
      )

      return
    }

    if (
      otherIssue &&
      !otherIssueDetails.trim()
    ) {
      setError(
        'Please describe the Other Issue.'
      )

      return
    }

    setSaving(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          'Your login session has expired.'
        )
      }

      const now =
        new Date().toISOString()

      const commonData = {
        inspection_date: today,
        sweeping_done:
          sweepingDone,
        other_issue:
          otherIssue,
        other_issue_details:
          otherIssue
            ? otherIssueDetails.trim()
            : null,
        remarks:
          remarks.trim() || null,
        inspected_by:
          user.id,
        qr_scanned_at:
          qrScannedAt,
        scan_latitude:
          scanLatitude,
        scan_longitude:
          scanLongitude,
        gps_accuracy_m:
          gpsAccuracy,
        gps_verified: true,
        saved_at: now,
        updated_at: now,
      }

      if (isPark) {
        const {
          data,
          error: saveError,
        } = await supabase
          .from('park_daily_inspections')
          .upsert(
            {
              ...commonData,

              park_id:
                selectedLocation.id,

              grass_properly_cut:
                grassProperlyCut,

              benches_well_placed:
                benchesWellPlaced,

              swings_not_broken:
                swingsNotBroken,

              watering_needed:
                wateringNeeded,

              street_lights_all_lit:
                parkStreetLightsAllLit,

              street_lights_not_lit_count:
                parkStreetLightsAllLit
                  ? 0
                  : parkStreetLightsNotLitCount,

              distance_from_park_m:
                distanceFromLocation,
            },
            {
              onConflict:
                'inspection_date,park_id',
            }
          )
          .select()
          .single()

        if (saveError) {
          throw saveError
        }

        setParkInspections(
          (current) => [
            ...current.filter(
              (inspection) =>
                inspection.park_id !==
                selectedLocation.id
            ),
            data,
          ]
        )
      } else {
        const {
          data,
          error: saveError,
        } = await supabase
          .from('tower_daily_inspections')
          .upsert(
            {
              ...commonData,

              tower_id:
                selectedLocation.id,

              mopping_done:
                moppingDone,

              camera_working:
                cameraWorking,

              led_screen_working:
                ledScreenWorking,

              lights_working_count:
                lightsWorkingCount,

              water_leakage:
                waterLeakage,

              street_light_status:
                streetLightStatus,

              distance_from_tower_m:
                distanceFromLocation,
            },
            {
              onConflict:
                'inspection_date,tower_id',
            }
          )
          .select()
          .single()

        if (saveError) {
          throw saveError
        }

        setTowerInspections(
          (current) => [
            ...current.filter(
              (inspection) =>
                inspection.tower_id !==
                selectedLocation.id
            ),
            data,
          ]
        )
      }

      setSaved(true)
      setSavedAt(now)

      setInfoMessage(
        'Inspection saved successfully.'
      )
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to save inspection.'
      )
    } finally {
      setSaving(false)
    }
  }

  function buildAttentionLines(
    location,
    inspection
  ) {
    const lines = []

    if (location.type === 'park') {
      if (
        inspection.sweeping_done === false
      ) {
        lines.push(
          'Sweeping not done'
        )
      }

      if (
        inspection.grass_properly_cut === false
      ) {
        lines.push(
          'Grass needs cutting'
        )
      }

      if (
        inspection.benches_well_placed === false
      ) {
        lines.push(
          'Benches need attention'
        )
      }

      if (
        inspection.swings_not_broken === false
      ) {
        lines.push(
          'Swing broken'
        )
      }

      if (
        inspection.watering_needed === true
      ) {
        lines.push(
          'Watering required'
        )
      }

      if (
        inspection.street_lights_all_lit === false
      ) {
        lines.push(
          `${
            inspection.street_lights_not_lit_count ||
            0
          } street light(s) not lit`
        )
      }
    } else {
      const camera =
        inspection.camera_working ??
        inspection.camera_led_working

      const led =
        inspection.led_screen_working ??
        inspection.camera_led_working

      if (camera === false) {
        lines.push(
          'Camera not working'
        )
      }

      if (led === false) {
        lines.push(
          'LED Screen not working'
        )
      }

      if (
        inspection.water_leakage === true
      ) {
        lines.push(
          'Water leakage observed'
        )
      }

      const streetIssues =
        getStreetLightFailures(
          inspection.street_light_status
        )

      if (streetIssues.length > 0) {
        lines.push(
          `${streetIssues.length} street light(s) not working`
        )
      }

      if (
        inspection.lights_working_count !== null &&
        inspection.lights_working_count < 9
      ) {
        lines.push(
          `${
            9 -
            inspection.lights_working_count
          } tower light(s) not working`
        )
      }

      if (
        inspection.sweeping_done === false
      ) {
        lines.push(
          'Sweeping not done'
        )
      }
    }

    if (
      inspection.other_issue === true
    ) {
      lines.push(
        inspection.other_issue_details ||
          'Other issue'
      )
    }

    return lines
  }

  function padText(
    text,
    length = 16
  ) {
    const value =
      String(text)

    if (
      value.length >= length
    ) {
      return `${value} `
    }

    return value.padEnd(
      length,
      ' '
    )
  }

  function buildTowerShareMessage(
    location,
    inspection
  ) {
    const attentionLines =
      buildAttentionLines(
        location,
        inspection
      )

    const streetFailures =
      getStreetLightFailures(
        inspection.street_light_status
      )

    const camera =
      inspection.camera_working ??
      inspection.camera_led_working

    const led =
      inspection.led_screen_working ??
      inspection.camera_led_working

    const attentionText =
      attentionLines.length > 0
        ? attentionLines
            .map(
              (line) =>
                `• ${line}`
            )
            .join('\n')
        : 'No issues reported'

    const rows = [
      [
        'Sweeping',
        inspection.sweeping_done
          ? 'Done'
          : 'Not Done',
      ],
      [
        'Mopping',
        inspection.mopping_done
          ? 'Done'
          : 'Not Done',
      ],
      [
        'Camera',
        camera
          ? 'Working'
          : 'Not Working',
      ],
      [
        'LED Screen',
        led
          ? 'Working'
          : 'Not Working',
      ],
      [
        'Tower Lights',
        `${inspection.lights_working_count}/9 Working`,
      ],
      [
        'Water Leakage',
        inspection.water_leakage
          ? 'Yes'
          : 'No',
      ],
      [
        'Street Lights',
        streetFailures.length === 0
          ? '8/8 Working'
          : `${
              8 -
              streetFailures.length
            }/8 Working`,
      ],
    ]

    const tableText =
      rows
        .map(
          ([item, status]) =>
            `${padText(item)}${status}`
        )
        .join('\n')

    const remarksText =
      inspection.remarks
        ? `\nRemarks: ${inspection.remarks}`
        : ''

    return `RWA POCKET-A
${location.name.toUpperCase()} DAILY INSPECTION
${formatDate(today)}

ATTENTION REQUIRED
-----------------------
${attentionText}
-----------------------

INSPECTION STATUS
Item            Status
-----------------------
${tableText}
-----------------------${remarksText}

QR + GPS Verified
${REPORT_FOOTER}

Supervisor
RWA Pocket-A`
  }

  async function shareText(message) {
    if (navigator.share) {
      try {
        await navigator.share({
          text: message,
        })

        return
      } catch (err) {
        if (
          err?.name === 'AbortError'
        ) {
          return
        }
      }
    }

    try {
      await navigator.clipboard.writeText(
        message
      )

      setInfoMessage(
        'Report copied. Open WhatsApp and paste it.'
      )
    } catch {
      setError(
        'Unable to share or copy report.'
      )
    }
  }

  function shareReport(
    location,
    inspection
  ) {
    if (
      !inspection ||
      location.type !== 'tower'
    ) {
      return
    }

    shareText(
      buildTowerShareMessage(
        location,
        inspection
      )
    )
  }

  function openReport(location) {
    const inspection =
      getInspection(location)

    if (!inspection) return

    setSelectedLocation(location)

    populateForm(
      location,
      inspection
    )

    setQrScannedAt(
      inspection.qr_scanned_at
    )

    setGpsAccuracy(
      inspection.gps_accuracy_m
    )

    setDistanceFromLocation(
      location.type === 'park'
        ? inspection.distance_from_park_m
        : inspection.distance_from_tower_m
    )

    setScreen('report')
  }

  async function returnToList() {
    await stopScanner()

    setScannerActive(false)
    setSelectedLocation(null)

    resetForm()

    setError('')
    setInfoMessage('')

    setScreen('list')
  }

  const towerLocations =
    towers.map(mapTower)

  const parkLocations =
    parks.map(mapPark)

  const allLocations = [
    ...towerLocations,
    ...parkLocations,
  ]

  const completedCount =
    allLocations.filter(
      (location) =>
        Boolean(
          getInspection(location)?.saved_at
        )
    ).length

  const issueCount =
    allLocations.filter(
      (location) => {
        const inspection =
          getInspection(location)

        return (
          Boolean(
            inspection?.saved_at
          ) &&
          inspectionHasIssue(
            location.type,
            inspection
          )
        )
      }
    ).length

  const pendingCount =
    Math.max(
      0,
      allLocations.length -
        completedCount
    )

  function buildSummaryData() {
    const cameraIssues = []
    const ledIssues = []
    const streetLightIssues = []

    towerLocations.forEach(
      (location) => {
        const inspection =
          getInspection(location)

        if (!inspection?.saved_at) {
          return
        }

        const camera =
          inspection.camera_working ??
          inspection.camera_led_working

        const led =
          inspection.led_screen_working ??
          inspection.camera_led_working

        if (camera === false) {
          cameraIssues.push(
            location.name
          )
        }

        if (led === false) {
          ledIssues.push(
            location.name
          )
        }

        const failures =
          getStreetLightFailures(
            inspection.street_light_status
          )

        if (failures.length > 0) {
          streetLightIssues.push(
            `${location.name.replace(
              'Tower ',
              'T'
            )} - ${failures.length} Not Working`
          )
        }
      }
    )

    parkLocations.forEach(
      (location) => {
        const inspection =
          getInspection(location)

        if (!inspection?.saved_at) {
          return
        }

        if (
          inspection.street_lights_all_lit ===
          false
        ) {
          streetLightIssues.push(
            `${location.name.replace(
              'Park ',
              'P'
            )} - ${
              inspection.street_lights_not_lit_count ||
              0
            } Not Lit`
          )
        }
      }
    )

    return {
      cameraIssues,
      ledIssues,
      streetLightIssues,
    }
  }

  function getCameraSummaryText(
    summary
  ) {
    if (
      summary.cameraIssues.length > 0
    ) {
      return (
        summary.cameraIssues
          .map(
            (name) =>
              name.replace(
                'Tower ',
                'T'
              )
          )
          .join(', ') +
        ' Not Working'
      )
    }

    const completedTowers =
      towerLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    if (
      completedTowers <
      towerLocations.length
    ) {
      return `No issue (${completedTowers}/${towerLocations.length} checked)`
    }

    return 'All Working'
  }

  function getLedSummaryText(
    summary
  ) {
    if (
      summary.ledIssues.length > 0
    ) {
      return (
        summary.ledIssues
          .map(
            (name) =>
              name.replace(
                'Tower ',
                'T'
              )
          )
          .join(', ') +
        ' Not Working'
      )
    }

    const completedTowers =
      towerLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    if (
      completedTowers <
      towerLocations.length
    ) {
      return `No issue (${completedTowers}/${towerLocations.length} checked)`
    }

    return 'All Working'
  }

  function getGarbageSummaryText() {
    if (
      societyGarbageDisposed === null
    ) {
      return 'Pending'
    }

    return societyGarbageDisposed
      ? 'Yes'
      : 'No'
  }

  function buildSummaryMessage() {
    const summary =
      buildSummaryData()

    const completedTowers =
      towerLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    const completedParks =
      parkLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    const allInspectionsComplete =
      completedTowers ===
        towerLocations.length &&
      completedParks ===
        parkLocations.length

    const streetLightText =
      summary.streetLightIssues.length > 0
        ? summary.streetLightIssues
            .map(
              (item, index) =>
                index === 0
                  ? item
                  : `${' '.repeat(14)}${item}`
            )
            .join('\n')
        : allInspectionsComplete
        ? 'All Working'
        : `No issue (${completedCount}/${allLocations.length} checked)`

    const overallStatusText =
      allInspectionsComplete
        ? 'Rest everything else is OK.'
        : 'Remaining inspected items are OK.'

    return `RWA POCKET-A
DAILY INSPECTION SUMMARY
${formatDate(today)}

ATTENTION REQUIRED
Item          Status
-----------------------
Camera        ${getCameraSummaryText(summary)}
LED           ${getLedSummaryText(summary)}
Street Lights ${streetLightText}
Garbage       ${getGarbageSummaryText()}
-----------------------

${overallStatusText}

INSPECTION PROGRESS
Type          Done
-----------------------
Towers        ${completedTowers}/${towerLocations.length}
Parks         ${completedParks}/${parkLocations.length}
-----------------------

${REPORT_FOOTER}

Supervisor
RWA Pocket-A`
  }

  function openSummary() {
    setScreen('summary')
  }

  function shareSummary() {
    shareText(
      buildSummaryMessage()
    )
  }

  if (screen === 'list') {
    return (
      <div className="tower-inspection-page">

        <header className="list-page-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={onBack}
          >
            ←
          </button>

          <div className="list-header-title">

            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              Tower Inspection
            </h1>

            <p>
              {formatDate(today)}
            </p>

          </div>

        </header>

        <main className="inspection-list-content">

          <div className="inspection-summary">

            <div className="summary-card summary-done">
              <span>✅</span>
              <strong>
                {completedCount}
              </strong>
              <small>Done</small>
            </div>

            <div className="summary-card summary-pending">
              <span>⏳</span>
              <strong>
                {pendingCount}
              </strong>
              <small>Pending</small>
            </div>

            <div className="summary-card summary-issues">
              <span>⚠️</span>
              <strong>
                {issueCount}
              </strong>
              <small>Issues</small>
            </div>

          </div>

          <div className="society-garbage-card">

            <div className="society-garbage-heading">
              <div>
                <strong>
                  🗑️ Garbage Disposal from Society
                </strong>

                <small>
                  Daily society-wide status
                </small>
              </div>

              {societySaved && (
                <span>
                  ✅ Saved
                </span>
              )}
            </div>

            <div className="society-garbage-options">

              <button
                type="button"
                className={`society-garbage-option good ${
                  societyGarbageDisposed === true
                    ? 'selected'
                    : ''
                }`}
                onClick={() => {
                  setSocietyGarbageDisposed(
                    true
                  )

                  setSocietySaved(false)
                }}
              >
                ✅ Yes
              </button>

              <button
                type="button"
                className={`society-garbage-option bad ${
                  societyGarbageDisposed === false
                    ? 'selected'
                    : ''
                }`}
                onClick={() => {
                  setSocietyGarbageDisposed(
                    false
                  )

                  setSocietySaved(false)
                }}
              >
                ❌ No
              </button>

            </div>

            <button
              type="button"
              className="society-garbage-save"
              disabled={
                societySaving ||
                societyGarbageDisposed === null ||
                societySaved
              }
              onClick={
                saveSocietyGarbage
              }
            >
              {societySaving
                ? 'Saving...'
                : societySaved
                ? '✅ Saved'
                : 'Save Garbage Status'}
            </button>

          </div>

          {loading && (
            <div className="inspection-message-card">
              Loading inspection locations...
            </div>
          )}

          {error && (
            <div className="inspection-error-box">
              {error}
            </div>
          )}

          {!loading && (
            <>
              <div className="inspection-list-section-title">
                Towers
              </div>

              <div className="inspection-location-list">

                {towerLocations.map(
                  (location) => (
                    <InspectionLocationRow
                      key={location.id}
                      location={location}
                      inspection={getInspection(
                        location
                      )}
                      onScan={
                        startLocationScan
                      }
                      onReport={
                        openReport
                      }
                      onShare={
                        shareReport
                      }
                    />
                  )
                )}

              </div>

              <div className="inspection-list-section-title park-section-title">
                Parks
              </div>

              <div className="inspection-location-list">

                {parkLocations.map(
                  (location) => (
                    <InspectionLocationRow
                      key={location.id}
                      location={location}
                      inspection={getInspection(
                        location
                      )}
                      onScan={
                        startLocationScan
                      }
                      onReport={
                        openReport
                      }
                      onShare={
                        shareReport
                      }
                    />
                  )
                )}

              </div>

              <div className="daily-summary-actions">

                <button
                  type="button"
                  className="view-summary-button"
                  onClick={
                    openSummary
                  }
                >
                  📋 View Daily Summary
                </button>

                <button
                  type="button"
                  className="share-summary-button"
                  onClick={
                    shareSummary
                  }
                >
                  📲 Share Summary
                </button>

              </div>
            </>
          )}

          {infoMessage && (
            <div className="inspection-success-box">
              {infoMessage}
            </div>
          )}

        </main>

      </div>
    )
  }

  if (screen === 'scanner') {
    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={
              returnToList
            }
          >
            ←
          </button>

          <div>
            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              {selectedLocation?.name}
            </h1>

            <p>Scan QR</p>
          </div>

        </header>

        <main className="inspection-content">

          <div className="selected-tower-card">

            <strong>
              {isPark
                ? '🌳'
                : '🏢'}{' '}
              {selectedLocation?.name}
            </strong>

            <p>
              Scan the QR installed at this location.
            </p>

          </div>

          <div className="scanner-card">

            <div
              id="tower-qr-reader"
              className="tower-qr-reader"
            />

            {scannerStarting && (
              <div className="scanner-status">
                Opening camera...
              </div>
            )}

            {error && (
              <div className="inspection-error-box">
                {error}
              </div>
            )}

          </div>

          <button
            type="button"
            className="view-summary-button"
            style={{
              width: '100%',
              marginTop: '14px',
            }}
            onClick={
              returnToList
            }
          >
            ← Back to Inspection List
          </button>

        </main>

      </div>
    )
  }

  if (
    screen === 'verification'
  ) {
    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={
              returnToList
            }
          >
            ←
          </button>

          <div>
            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              {selectedLocation?.name}
            </h1>

            <p>
              Location Verification
            </p>
          </div>

        </header>

        <main className="inspection-content">

          {gpsLoading ? (
            <div className="location-card">

              <div className="inspection-big-icon">
                📍
              </div>

              <h2>
                Verifying Location...
              </h2>

              <p>
                Checking your current GPS position.
              </p>

            </div>
          ) : (
            <div className="location-card">

              <div className="inspection-big-icon">
                ❌
              </div>

              <h2>
                Location Not Verified
              </h2>

              <p>
                {gpsFailureReason}
              </p>

              {distanceFromLocation !==
                null && (
                <div className="failed-distance">

                  <span>
                    Current Distance
                  </span>

                  <strong>
                    {Math.round(
                      distanceFromLocation
                    )}{' '}
                    m
                  </strong>

                </div>
              )}

              <button
                type="button"
                className="retry-location-button"
                onClick={() =>
                  verifyGps(
                    selectedLocation
                  )
                }
              >
                📍 Verify Again
              </button>

            </div>
          )}

          <button
            type="button"
            className="view-summary-button"
            style={{
              width: '100%',
              marginTop: '14px',
            }}
            onClick={
              returnToList
            }
          >
            ← Back to Inspection List
          </button>

        </main>

      </div>
    )
  }

  if (screen === 'form') {
    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={
              returnToList
            }
          >
            ←
          </button>

          <div>
            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              {selectedLocation?.name}
            </h1>

            <p>
              Daily Inspection
            </p>
          </div>

        </header>

        <main className="inspection-content">

          <div className="verification-success-card">

            <span>✅</span>

            <div>
              <strong>
                Visit Verified
              </strong>

              <small>
                QR + GPS verified
                {distanceFromLocation !==
                  null &&
                  ` • ${Math.round(
                    distanceFromLocation
                  )} m`}
              </small>
            </div>

          </div>

          <InspectionToggle
            icon="🧹"
            label="Sweeping"
            positiveText="Done"
            negativeText="Not Done"
            value={sweepingDone}
            onChange={(value) => {
              markChanged()
              setSweepingDone(value)
            }}
          />

          {!isPark && (
            <>
              <InspectionToggle
                icon="🧽"
                label="Mopping"
                positiveText="Done"
                negativeText="Not Done Today"
                value={moppingDone}
                onChange={(value) => {
                  markChanged()
                  setMoppingDone(value)
                }}
              />

              <InspectionToggle
                icon="📷"
                label="Camera"
                positiveText="Working"
                negativeText="Not Working"
                value={cameraWorking}
                onChange={(value) => {
                  markChanged()
                  setCameraWorking(value)
                }}
              />

              <InspectionToggle
                icon="📺"
                label="LED Screen"
                positiveText="Working"
                negativeText="Not Working"
                value={ledScreenWorking}
                onChange={(value) => {
                  markChanged()
                  setLedScreenWorking(value)
                }}
              />

              <div className="inspection-item">

                <div className="inspection-item-heading">
                  <span className="inspection-item-icon">
                    💡
                  </span>

                  <strong>
                    Tower Lights
                  </strong>
                </div>

                <div className="lights-counter">

                  <button
                    type="button"
                    onClick={
                      decreaseLights
                    }
                  >
                    −
                  </button>

                  <div>
                    <strong>
                      {lightsWorkingCount === null
                        ? '—'
                        : lightsWorkingCount}
                    </strong>

                    <span>
                      / 9 Working
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={
                      increaseLights
                    }
                  >
                    +
                  </button>

                </div>

              </div>

              <InspectionToggle
                icon="💧"
                label="Water Leakage"
                positiveText="No Leakage"
                negativeText="Leakage Found"
                value={
                  waterLeakage === null
                    ? null
                    : !waterLeakage
                }
                onChange={(noLeakage) => {
                  markChanged()
                  setWaterLeakage(!noLeakage)
                }}
              />

              <StreetLightMap
                locationName={
                  selectedLocation?.name
                }
                status={
                  streetLightStatus
                }
                onToggle={
                  toggleStreetLight
                }
              />
            </>
          )}

          {isPark && (
            <>
              <InspectionToggle
                icon="🌱"
                label="Grass Cutting"
                positiveText="Properly Cut"
                negativeText="Needs Cutting"
                value={
                  grassProperlyCut
                }
                onChange={(value) => {
                  markChanged()
                  setGrassProperlyCut(value)
                }}
              />

              <InspectionToggle
                icon="🪑"
                label="Benches"
                positiveText="Well Placed"
                negativeText="Needs Attention"
                value={
                  benchesWellPlaced
                }
                onChange={(value) => {
                  markChanged()
                  setBenchesWellPlaced(value)
                }}
              />

              <InspectionToggle
                icon="🛝"
                label="Swings"
                positiveText="Good"
                negativeText="Broken"
                value={
                  swingsNotBroken
                }
                onChange={(value) => {
                  markChanged()
                  setSwingsNotBroken(value)
                }}
              />

              <InspectionToggle
                icon="💧"
                label="Watering"
                positiveText="Not Needed"
                negativeText="Needed"
                value={
                  wateringNeeded === null
                    ? null
                    : !wateringNeeded
                }
                onChange={(notNeeded) => {
                  markChanged()
                  setWateringNeeded(!notNeeded)
                }}
              />

              <InspectionToggle
                icon="💡"
                label="Street Lights"
                positiveText="All Lit"
                negativeText="Some Not Lit"
                value={
                  parkStreetLightsAllLit
                }
                onChange={(value) => {
                  markChanged()

                  setParkStreetLightsAllLit(
                    value
                  )

                  if (value) {
                    setParkStreetLightsNotLitCount(
                      0
                    )
                  } else {
                    setParkStreetLightsNotLitCount(
                      (current) =>
                        current > 0
                          ? current
                          : 1
                    )
                  }
                }}
              />

              {parkStreetLightsAllLit ===
                false && (
                <div className="inspection-item">

                  <div className="inspection-item-heading">
                    <span className="inspection-item-icon">
                      💡
                    </span>

                    <strong>
                      Street Lights Not Lit
                    </strong>
                  </div>

                  <div className="lights-counter">

                    <button
                      type="button"
                      onClick={
                        decreaseParkStreetLights
                      }
                    >
                      −
                    </button>

                    <div>
                      <strong>
                        {
                          parkStreetLightsNotLitCount
                        }
                      </strong>

                      <span>
                        Not Lit
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={
                        increaseParkStreetLights
                      }
                    >
                      +
                    </button>

                  </div>

                </div>
              )}
            </>
          )}

          <div className="inspection-item">

            <div className="inspection-item-heading">
              <span className="inspection-item-icon">
                ⚠️
              </span>

              <strong>
                Any Other Issue
              </strong>
            </div>

            <div className="inspection-toggle-row">

              <button
                type="button"
                className={`inspection-option inspection-option-good ${
                  !otherIssue
                    ? 'selected'
                    : ''
                }`}
                onClick={() => {
                  markChanged()
                  setOtherIssue(false)
                  setOtherIssueDetails('')
                }}
              >
                ✅ No
              </button>

              <button
                type="button"
                className={`inspection-option inspection-option-bad ${
                  otherIssue
                    ? 'selected'
                    : ''
                }`}
                onClick={() => {
                  markChanged()
                  setOtherIssue(true)
                }}
              >
                ⚠️ Yes
              </button>

            </div>

            {otherIssue && (
              <textarea
                className="inspection-textarea"
                placeholder="Describe the issue..."
                value={
                  otherIssueDetails
                }
                onChange={(event) => {
                  markChanged()

                  setOtherIssueDetails(
                    event.target.value
                  )
                }}
              />
            )}

          </div>

          <div className="inspection-item">

            <div className="inspection-item-heading">
              <span className="inspection-item-icon">
                📝
              </span>

              <strong>
                Remarks
              </strong>
            </div>

            <textarea
              className="inspection-textarea"
              placeholder="Optional remarks..."
              value={remarks}
              onChange={(event) => {
                markChanged()

                setRemarks(
                  event.target.value
                )
              }}
            />

          </div>

          {hasIssue && (
            <div className="attention-preview">

              <strong>
                ⚠️ Attention Required
              </strong>

              <p>
                One or more issues have been marked.
              </p>

            </div>
          )}

          {error && (
            <div className="inspection-error-box">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="inspection-success-box">
              {infoMessage}
            </div>
          )}

          <button
            type="button"
            className="save-inspection-button"
            disabled={
              saving ||
              !checklistComplete
            }
            onClick={
              saveInspection
            }
          >
            {saving
              ? 'Saving...'
              : saved
              ? '✅ Saved'
              : '💾 Save Inspection'}
          </button>

          {savedAt && (
            <div className="saved-time">
              Last saved:{' '}
              {formatTime(savedAt)}
            </div>
          )}

          {saved && !isPark && (
            <button
              type="button"
              className="share-inspection-button"
              onClick={() => {
                const inspection =
                  getInspection(
                    selectedLocation
                  )

                if (inspection) {
                  shareReport(
                    selectedLocation,
                    inspection
                  )
                }
              }}
            >
              📲 Share Tower Report
            </button>
          )}

          <button
            type="button"
            className="view-summary-button"
            style={{
              width: '100%',
              marginTop: '12px',
            }}
            onClick={
              returnToList
            }
          >
            ← Back to Inspection List
          </button>

        </main>

      </div>
    )
  }

  if (screen === 'report') {
    const inspection =
      getInspection(selectedLocation)

    const attentionLines =
      inspection
        ? buildAttentionLines(
            selectedLocation,
            inspection
          )
        : []

    const streetFailures =
      !isPark && inspection
        ? getStreetLightFailures(
            inspection.street_light_status
          )
        : []

    const reportCamera =
      inspection?.camera_working ??
      inspection?.camera_led_working

    const reportLed =
      inspection?.led_screen_working ??
      inspection?.camera_led_working

    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={
              returnToList
            }
          >
            ←
          </button>

          <div>
            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              {selectedLocation?.name}
            </h1>

            <p>
              {formatDate(today)}
            </p>
          </div>

        </header>

        <main className="inspection-content">

          <div
            className={`compact-report-status ${
              attentionLines.length > 0
                ? 'issue'
                : 'good'
            }`}
          >
            {attentionLines.length > 0
              ? '⚠️ ATTENTION REQUIRED'
              : '✅ SATISFACTORY'}
          </div>

          {attentionLines.length > 0 && (
            <div className="compact-attention-card">

              {attentionLines.map(
                (line, index) => (
                  <div key={index}>
                    • {line}
                  </div>
                )
              )}

            </div>
          )}

          <div className="compact-report-card">

            <div className="compact-report-row">
              <span>Sweeping</span>

              <strong>
                {inspection?.sweeping_done
                  ? 'Done'
                  : 'Not Done'}
              </strong>
            </div>

            {!isPark && (
              <>
                <div className="compact-report-row">
                  <span>Mopping</span>

                  <strong>
                    {inspection?.mopping_done
                      ? 'Done'
                      : 'Not Done'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>Camera</span>

                  <strong>
                    {reportCamera
                      ? 'Working'
                      : 'Not Working'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>LED</span>

                  <strong>
                    {reportLed
                      ? 'Working'
                      : 'Not Working'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Tower Lights
                  </span>

                  <strong>
                    {
                      inspection?.lights_working_count
                    }
                    /9
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Water Leakage
                  </span>

                  <strong>
                    {inspection?.water_leakage
                      ? 'Yes'
                      : 'No'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Street Lights
                  </span>

                  <strong>
                    {streetFailures.length === 0
                      ? 'All Working'
                      : `${streetFailures.length} Not Working`}
                  </strong>
                </div>
              </>
            )}

            {isPark && (
              <>
                <div className="compact-report-row">
                  <span>
                    Grass Cutting
                  </span>

                  <strong>
                    {inspection?.grass_properly_cut
                      ? 'Properly Cut'
                      : 'Needs Cutting'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Benches
                  </span>

                  <strong>
                    {inspection?.benches_well_placed
                      ? 'Well Placed'
                      : 'Needs Attention'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Swings
                  </span>

                  <strong>
                    {inspection?.swings_not_broken
                      ? 'Good'
                      : 'Broken'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Watering
                  </span>

                  <strong>
                    {inspection?.watering_needed
                      ? 'Needed'
                      : 'Not Needed'}
                  </strong>
                </div>

                <div className="compact-report-row">
                  <span>
                    Street Lights
                  </span>

                  <strong>
                    {inspection?.street_lights_all_lit
                      ? 'All Lit'
                      : `${
                          inspection?.street_lights_not_lit_count ||
                          0
                        } Not Lit`}
                  </strong>
                </div>
              </>
            )}

          </div>

          {remarks.trim() && (
            <div className="compact-report-note">
              Remarks: {remarks}
            </div>
          )}

          <div className="compact-verification-line">
            QR + GPS Verified
            {distanceFromLocation !== null &&
              ` • ${Math.round(
                distanceFromLocation
              )} m`}
          </div>

          {!isPark && (
            <button
              type="button"
              className="share-inspection-button"
              onClick={() =>
                shareReport(
                  selectedLocation,
                  inspection
                )
              }
            >
              📲 Share Tower Report
            </button>
          )}

          <button
            type="button"
            className="view-summary-button"
            style={{
              width: '100%',
              marginTop: '10px',
            }}
            onClick={
              returnToList
            }
          >
            ← Back to Inspection List
          </button>

        </main>

      </div>
    )
  }

  if (screen === 'summary') {
    const summary =
      buildSummaryData()

    const completedTowers =
      towerLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    const completedParks =
      parkLocations.filter(
        (location) =>
          Boolean(
            getInspection(location)?.saved_at
          )
      ).length

    const criticalAttention =
      summary.cameraIssues.length > 0 ||
      summary.ledIssues.length > 0 ||
      summary.streetLightIssues.length > 0 ||
      societyGarbageDisposed === false

    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={
              returnToList
            }
          >
            ←
          </button>

          <div>
            <div className="inspection-brand">
              RWA POCKET-A
            </div>

            <h1>
              Daily Summary
            </h1>

            <p>
              {formatDate(today)}
            </p>
          </div>

        </header>

        <main className="inspection-content">

          <div
            className={`summary-attention-header ${
              criticalAttention
                ? 'issue'
                : 'good'
            }`}
          >
            ATTENTION REQUIRED / KEY STATUS
          </div>

          <div className="summary-attention-card">

            <div className="summary-attention-section">
              <strong>
                Camera
              </strong>

              <span>
                {getCameraSummaryText(
                  summary
                )}
              </span>
            </div>

            <div className="summary-attention-section">
              <strong>
                LED
              </strong>

              <span>
                {getLedSummaryText(
                  summary
                )}
              </span>
            </div>

            <div className="summary-attention-section">
              <strong>
                Street Lights
              </strong>

              {summary.streetLightIssues.length > 0 ? (
                summary.streetLightIssues.map(
                  (item, index) => (
                    <span key={index}>
                      {item}
                    </span>
                  )
                )
              ) : (
                <span>
                  All Working
                </span>
              )}
            </div>

            <div className="summary-attention-section">
              <strong>
                Garbage Disposal from Society
              </strong>

              <span>
                {getGarbageSummaryText()}
              </span>
            </div>

          </div>

          <div className="summary-status-card">

            <h2>
              Towers
            </h2>

            <div className="summary-location-grid">

              {towerLocations.map(
                (location) => {
                  const inspection =
                    getInspection(
                      location
                    )

                  return (
                    <div
                      key={location.id}
                      className="summary-location-chip"
                    >
                      <span>
                        {location.name.replace(
                          'Tower ',
                          'T'
                        )}
                      </span>

                      <strong>
                        {!inspection?.saved_at
                          ? '⏳'
                          : inspectionHasIssue(
                              'tower',
                              inspection
                            )
                          ? '⚠️'
                          : '✅'}
                      </strong>
                    </div>
                  )
                }
              )}

            </div>

            <div className="summary-progress-line">
              Towers inspected:{' '}
              <strong>
                {completedTowers}/
                {towerLocations.length}
              </strong>
            </div>

          </div>

          <div className="summary-status-card">

            <h2>
              Parks
            </h2>

            <div className="summary-location-grid park-summary-grid">

              {parkLocations.map(
                (location) => {
                  const inspection =
                    getInspection(
                      location
                    )

                  return (
                    <div
                      key={location.id}
                      className="summary-location-chip"
                    >
                      <span>
                        {location.name}
                      </span>

                      <strong>
                        {!inspection?.saved_at
                          ? '⏳'
                          : inspectionHasIssue(
                              'park',
                              inspection
                            )
                          ? '⚠️'
                          : '✅'}
                      </strong>
                    </div>
                  )
                }
              )}

            </div>

            <div className="summary-progress-line">
              Parks inspected:{' '}
              <strong>
                {completedParks}/
                {parkLocations.length}
              </strong>
            </div>

          </div>

          <div className="summary-legend">
            ✅ Satisfactory &nbsp;
            ⚠️ Attention &nbsp;
            ⏳ Pending
          </div>

          <button
            type="button"
            className="share-summary-button"
            style={{
              width: '100%',
            }}
            onClick={
              shareSummary
            }
          >
            📲 Share Summary with RWA Members
          </button>

          <button
            type="button"
            className="view-summary-button"
            style={{
              width: '100%',
              marginTop: '10px',
            }}
            onClick={
              returnToList
            }
          >
            ← Back to Inspection List
          </button>

        </main>

      </div>
    )
  }

  return null
}

export default TowerInspection