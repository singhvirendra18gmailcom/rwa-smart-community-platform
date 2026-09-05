import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { Html5Qrcode } from 'html5-qrcode'

import { supabase } from './supabase'
import './TowerInspection.css'

const MAX_GPS_ACCURACY_M = 50
const INSPECTION_VALIDITY_MINUTES = 10

const WA = {
  building: '\u{1F3E2}',
  sweeping: '\u{1F9F9}',
  mopping: '\u{1F9FD}',
  camera: '\u{1F4F7}',
  led: '\u{1F4FA}',
  light: '\u{1F4A1}',
  location: '\u{1F4CD}',
  person: '\u{1F464}',
  home: '\u{1F3D8}\uFE0F',
  park: '\u{1F333}',
  water: '\u{1F4A7}',
  garbage: '\u{1F5D1}\uFE0F',
  check: '\u2705',
  cross: '\u274C',
  warning: '\u26A0\uFE0F',
  neutral: '\u2796',
}

const EMPTY_DAILY_SUMMARY = {
  park1_sweeping_done: null,
  park1_grass_mowed: null,
  park1_area_clear: null,

  park2_sweeping_done: null,
  park2_grass_mowed: null,
  park2_area_clear: null,

  water_leakage_found: null,
  water_leakage_locations: '',

  garbage_collected: null,
  garbage_disposed: null,

  street_lights_all_working: null,
  street_lights_not_working_count: 0,
}

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year =
    parts.find(
      (part) =>
        part.type === 'year'
    )?.value

  const month =
    parts.find(
      (part) =>
        part.type === 'month'
    )?.value

  const day =
    parts.find(
      (part) =>
        part.type === 'day'
    )?.value

  return `${year}-${month}-${day}`
}

function formatDate(dateString) {
  if (!dateString) {
    return ''
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  ).format(
    new Date(
      `${dateString}T12:00:00+05:30`
    )
  )
}

function formatTime(dateString) {
  if (!dateString) {
    return ''
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }
  ).format(
    new Date(dateString)
  )
}

function calculateDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadiusM = 6371000

  const toRadians =
    (value) =>
      (value * Math.PI) / 180

  const dLat =
    toRadians(
      lat2 - lat1
    )

  const dLon =
    toRadians(
      lon2 - lon1
    )

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(
      toRadians(lat1)
    ) *
      Math.cos(
        toRadians(lat2)
      ) *
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

function extractQrToken(
  decodedText
) {
  if (!decodedText) {
    return null
  }

  const value =
    decodedText.trim()

  if (
    value.startsWith(
      'RWA-TOWER:'
    )
  ) {
    return value
      .substring(
        'RWA-TOWER:'.length
      )
      .trim()
  }

  try {
    const url =
      new URL(value)

    const token =
      url.searchParams.get(
        'tower'
      )

    if (token) {
      return token.trim()
    }
  } catch {
    // QR is not a URL.
  }

  return value
}

function inspectionHasIssue(
  inspection
) {
  if (!inspection) {
    return false
  }

  return (
    inspection.sweeping_done ===
      false ||
    (
      inspection.camera_working ??
      inspection.camera_led_working
    ) === false ||
    (
      inspection.led_screen_working ??
      inspection.camera_led_working
    ) === false ||
    (
      inspection.lights_working_count !==
        null &&
      inspection.lights_working_count <
        9
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

        <strong>
          {label}
        </strong>

      </div>

      <div className="inspection-toggle-row">

        <button
          type="button"
          className={`inspection-option inspection-option-good ${
            value === true
              ? 'selected'
              : ''
          }`}
          onClick={() =>
            onChange(true)
          }
        >
          ✅ {positiveText}
        </button>

        <button
          type="button"
          className={`inspection-option inspection-option-bad ${
            value === false
              ? 'selected'
              : ''
          }`}
          onClick={() =>
            onChange(false)
          }
        >
          ❌ {negativeText}
        </button>

      </div>

    </div>
  )
}

function TowerInspection({
  onBack,
}) {
  const today =
    useMemo(
      () => getIndiaDate(),
      []
    )

  const scannerRef =
    useRef(null)

  const scanLockedRef =
    useRef(false)

  const [
    screen,
    setScreen
  ] =
    useState('list')

  const [
    towers,
    setTowers
  ] =
    useState([])

  const [
    inspections,
    setInspections
  ] =
    useState([])

  const [
    loading,
    setLoading
  ] =
    useState(true)

  const [
    selectedTower,
    setSelectedTower,
  ] =
    useState(null)

  const [
    scannerActive,
    setScannerActive
  ] =
    useState(false)

  const [
    scannerStarting,
    setScannerStarting,
  ] =
    useState(false)

  const [
    gpsLoading,
    setGpsLoading
  ] =
    useState(false)

  const [
    error,
    setError
  ] =
    useState('')

  const [
    infoMessage,
    setInfoMessage
  ] =
    useState('')

  const [
    dashboardMessage,
    setDashboardMessage,
  ] =
    useState('')

  const [
    gpsFailureReason,
    setGpsFailureReason,
  ] =
    useState('')

  const [
    qrScannedAt,
    setQrScannedAt
  ] =
    useState(null)

  const [
    scanLatitude,
    setScanLatitude
  ] =
    useState(null)

  const [
    scanLongitude,
    setScanLongitude
  ] =
    useState(null)

  const [
    gpsAccuracy,
    setGpsAccuracy
  ] =
    useState(null)

  const [
    distanceFromTower,
    setDistanceFromTower,
  ] =
    useState(null)

  const [
    sweepingDone,
    setSweepingDone
  ] =
    useState(null)

  const [
    moppingDone,
    setMoppingDone
  ] =
    useState(null)

  const [
    cameraWorking,
    setCameraWorking
  ] =
    useState(null)

  const [
    ledScreenWorking,
    setLedScreenWorking
  ] =
    useState(null)

  const [
    lightsWorkingCount,
    setLightsWorkingCount,
  ] =
    useState(null)

  const [
    remarks,
    setRemarks
  ] =
    useState('')

  const [
    saving,
    setSaving
  ] =
    useState(false)

  const [
    saved,
    setSaved
  ] =
    useState(false)

  const [
    savedAt,
    setSavedAt
  ] =
    useState(null)

  const [
    dailySummary,
    setDailySummary
  ] =
    useState({
      ...EMPTY_DAILY_SUMMARY,
    })

  const [
    dailySummaryRecord,
    setDailySummaryRecord
  ] =
    useState(null)

  const [
    dailySummarySaved,
    setDailySummarySaved
  ] =
    useState(false)

  const [
    dailySummarySaving,
    setDailySummarySaving
  ] =
    useState(false)

  useEffect(() => {
    loadTowerDashboard()
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

        scanLockedRef.current =
          false

        const scanner =
          new Html5Qrcode(
            'tower-qr-reader'
          )

        scannerRef.current =
          scanner

        await scanner.start(
          {
            facingMode:
              'environment',
          },
          {
            fps: 10,
            qrbox: {
              width: 240,
              height: 240,
            },
          },
          handleQrScanned,
          () => {
            // Normal scan miss.
          }
        )

        if (cancelled) {
          await stopScanner()
        }
      } catch (err) {
        console.error(err)

        setError(
          'Unable to open camera. Please allow camera permission and try again.'
        )

        setScannerActive(
          false
        )
      } finally {
        setScannerStarting(
          false
        )
      }
    }

    const timer =
      window.setTimeout(
        openScanner,
        100
      )

    return () => {
      cancelled = true

      window.clearTimeout(
        timer
      )
    }
  }, [
    scannerActive,
    screen
  ])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  async function loadTowerDashboard() {
    setLoading(true)
    setError('')

    try {
      const {
        data: towerData,
        error: towerError,
      } =
        await supabase
          .from('towers')
          .select(`
            id,
            tower_name,
            display_order,
            qr_token,
            latitude,
            longitude,
            allowed_radius_m,
            whatsapp_group_name,
            active
          `)
          .eq(
            'active',
            true
          )
          .order(
            'display_order',
            {
              ascending: true,
            }
          )

      if (towerError) {
        throw towerError
      }

      const activeTowers =
        towerData || []

      setTowers(
        activeTowers
      )

      if (
        activeTowers.length >
        0
      ) {
        const towerIds =
          activeTowers.map(
            (tower) =>
              tower.id
          )

        const {
          data: inspectionData,
          error: inspectionError,
        } =
          await supabase
            .from(
              'tower_daily_inspections'
            )
            .select('*')
            .eq(
              'inspection_date',
              today
            )
            .in(
              'tower_id',
              towerIds
            )

        if (
          inspectionError
        ) {
          throw inspectionError
        }

        setInspections(
          inspectionData || []
        )
      } else {
        setInspections([])
      }

      const {
        data: summaryData,
        error: summaryError,
      } =
        await supabase
          .from(
            'daily_rwa_summaries'
          )
          .select('*')
          .eq(
            'summary_date',
            today
          )
          .maybeSingle()

      if (summaryError) {
        throw summaryError
      }

      if (summaryData) {
        setDailySummaryRecord(
          summaryData
        )

        setDailySummary({
          park1_sweeping_done:
            summaryData.park1_sweeping_done,

          park1_grass_mowed:
            summaryData.park1_grass_mowed,

          park1_area_clear:
            summaryData.park1_area_clear,

          park2_sweeping_done:
            summaryData.park2_sweeping_done,

          park2_grass_mowed:
            summaryData.park2_grass_mowed,

          park2_area_clear:
            summaryData.park2_area_clear,

          water_leakage_found:
            summaryData.water_leakage_found,

          water_leakage_locations:
            summaryData.water_leakage_locations ||
            '',

          garbage_collected:
            summaryData.garbage_collected,

          garbage_disposed:
            summaryData.garbage_disposed,

          street_lights_all_working:
            summaryData.street_lights_all_working,

          street_lights_not_working_count:
            summaryData.street_lights_not_working_count ??
            0,
        })

        setDailySummarySaved(
          Boolean(
            summaryData.saved_at
          )
        )
      } else {
        setDailySummaryRecord(
          null
        )

        setDailySummary({
          ...EMPTY_DAILY_SUMMARY,
        })

        setDailySummarySaved(
          false
        )
      }

    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to load tower inspection status.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function stopScanner() {
    const scanner =
      scannerRef.current

    if (!scanner) {
      return
    }

    try {
      if (
        scanner.isScanning
      ) {
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

    scannerRef.current =
      null
  }

  function getInspectionForTower(
    towerId
  ) {
    return inspections.find(
      (inspection) =>
        inspection.tower_id ===
        towerId
    )
  }

  function getTowerName(
    towerId
  ) {
    return (
      towers.find(
        (tower) =>
          tower.id === towerId
      )?.tower_name ||
      'Unknown Tower'
    )
  }

  function resetForm() {
    setSweepingDone(null)
    setMoppingDone(null)
    setCameraWorking(null)
    setLedScreenWorking(null)
    setLightsWorkingCount(null)
    setRemarks('')
    setSaved(false)
    setSavedAt(null)
    setInfoMessage('')
  }

  function populateForm(
    inspection
  ) {
    resetForm()

    if (!inspection) {
      return
    }

    setSweepingDone(
      inspection.sweeping_done
    )

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

    setRemarks(
      inspection.remarks || ''
    )

    setSaved(
      Boolean(
        inspection.saved_at
      )
    )

    setSavedAt(
      inspection.saved_at
    )
  }

  async function startTowerScan(
    tower
  ) {
    await stopScanner()

    setDashboardMessage('')

    setSelectedTower(
      tower
    )

    resetForm()

    setQrScannedAt(null)
    setScanLatitude(null)
    setScanLongitude(null)
    setGpsAccuracy(null)
    setDistanceFromTower(null)
    setGpsFailureReason('')
    setInfoMessage('')
    setError('')

    setScreen(
      'scanner'
    )

    setScannerActive(
      true
    )
  }

  async function handleQrScanned(
    decodedText
  ) {
    if (
      scanLockedRef.current
    ) {
      return
    }

    scanLockedRef.current =
      true

    const token =
      extractQrToken(
        decodedText
      )

    if (!token) {
      setError(
        'Invalid QR code. Please scan the QR installed at this tower.'
      )

      scanLockedRef.current =
        false

      return
    }

    const scannedTower =
      towers.find(
        (tower) =>
          tower.qr_token ===
          token
      )

    if (!scannedTower) {
      setError(
        'This is not a valid RWA Pocket-A Tower QR code.'
      )

      window.setTimeout(
        () => {
          scanLockedRef.current =
            false
        },
        1200
      )

      return
    }

    if (
      scannedTower.id !==
      selectedTower.id
    ) {
      setError(
        `Wrong QR code. You selected ${selectedTower.tower_name}, but scanned ${scannedTower.tower_name}. Please scan the QR installed at ${selectedTower.tower_name}.`
      )

      window.setTimeout(
        () => {
          scanLockedRef.current =
            false
        },
        1500
      )

      return
    }

    await stopScanner()

    setScannerActive(
      false
    )

    setError('')

    const scanTime =
      new Date().toISOString()

    setQrScannedAt(
      scanTime
    )

    const existingInspection =
      getInspectionForTower(
        selectedTower.id
      )

    populateForm(
      existingInspection
    )

    setScreen(
      'verification'
    )

    verifyGps(
      selectedTower
    )
  }

  function verifyGps(
    tower
  ) {
    if (!tower) {
      return
    }

    setGpsLoading(true)
    setGpsFailureReason('')
    setError('')

    if (
      !navigator.geolocation
    ) {
      setGpsFailureReason(
        'GPS is not supported by this device or browser.'
      )

      setGpsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const supervisorLat =
          position.coords.latitude

        const supervisorLon =
          position.coords.longitude

        const accuracy =
          position.coords.accuracy

        const distance =
          calculateDistance(
            supervisorLat,
            supervisorLon,
            Number(
              tower.latitude
            ),
            Number(
              tower.longitude
            )
          )

        setScanLatitude(
          supervisorLat
        )

        setScanLongitude(
          supervisorLon
        )

        setGpsAccuracy(
          accuracy
        )

        setDistanceFromTower(
          distance
        )

        if (
          accuracy >
          MAX_GPS_ACCURACY_M
        ) {
          setGpsFailureReason(
            `GPS accuracy is currently ±${Math.round(
              accuracy
            )} m. Please move to a more open area and try again.`
          )

          setGpsLoading(false)
          return
        }

        if (
          distance >
          Number(
            tower.allowed_radius_m
          )
        ) {
          setGpsFailureReason(
            `You are approximately ${Math.round(
              distance
            )} m away from ${tower.tower_name}. Allowed distance is ${tower.allowed_radius_m} m.`
          )

          setGpsLoading(false)
          return
        }

        setGpsFailureReason('')
        setGpsLoading(false)

        setScreen(
          'form'
        )
      },

      (geoError) => {
        console.error(
          geoError
        )

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

        setGpsFailureReason(
          message
        )

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
    if (!qrScannedAt) {
      return false
    }

    const scannedAt =
      new Date(
        qrScannedAt
      ).getTime()

    const elapsedMinutes =
      (
        Date.now() -
        scannedAt
      ) /
      1000 /
      60

    return (
      elapsedMinutes <=
      INSPECTION_VALIDITY_MINUTES
    )
  }

  const checklistComplete =
    sweepingDone !== null &&
    moppingDone !== null &&
    cameraWorking !== null &&
    ledScreenWorking !== null &&
    lightsWorkingCount !== null

  const hasIssue =
    sweepingDone === false ||
    cameraWorking === false ||
    ledScreenWorking === false ||
    (
      lightsWorkingCount !==
        null &&
      lightsWorkingCount < 9
    )

  function markChanged() {
    setSaved(false)
    setInfoMessage('')
  }

  function decreaseLights() {
    markChanged()

    setLightsWorkingCount(
      (current) => {
        if (
          current === null
        ) {
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
        if (
          current === null
        ) {
          return 9
        }

        return Math.min(
          9,
          current + 1
        )
      }
    )
  }

  async function saveInspection() {
    setError('')
    setInfoMessage('')

    if (
      screen !== 'form'
    ) {
      return
    }

    if (
      !isScanStillValid()
    ) {
      setError(
        'The 10-minute tower visit session has expired. Please scan the Tower QR again.'
      )

      return
    }

    if (
      !checklistComplete
    ) {
      setError(
        'Please inspect all five items before saving.'
      )

      return
    }

    setSaving(true)

    try {
      const {
        data: {
          user
        },
      } =
        await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          'Your login session has expired.'
        )
      }

      const now =
        new Date().toISOString()

      const inspectionData = {
        inspection_date:
          today,

        tower_id:
          selectedTower.id,

        sweeping_done:
          sweepingDone,

        mopping_done:
          moppingDone,

        camera_working:
          cameraWorking,

        led_screen_working:
          ledScreenWorking,

        lights_working_count:
          lightsWorkingCount,

        remarks:
          remarks.trim() ||
          null,

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

        distance_from_tower_m:
          distanceFromTower,

        gps_verified:
          true,

        saved_at:
          now,

        updated_at:
          now,
      }

      const {
        data,
        error: saveError,
      } =
        await supabase
          .from(
            'tower_daily_inspections'
          )
          .upsert(
            inspectionData,
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

      setSaved(true)

      setSavedAt(
        data.saved_at
      )

      setInspections(
        (current) => {
          const withoutTower =
            current.filter(
              (inspection) =>
                inspection.tower_id !==
                selectedTower.id
            )

          return [
            ...withoutTower,
            data
          ]
        }
      )

      const savedTowerName =
        selectedTower.tower_name

      setDashboardMessage(
        `✅ ${savedTowerName} inspection saved successfully.`
      )

      window.setTimeout(
        () => {
          setSelectedTower(
            null
          )

          setQrScannedAt(
            null
          )

          setScanLatitude(
            null
          )

          setScanLongitude(
            null
          )

          setGpsAccuracy(
            null
          )

          setDistanceFromTower(
            null
          )

          setGpsFailureReason('')
          setError('')
          setInfoMessage('')

          setScreen(
            'list'
          )

          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
        },
        650
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

  function buildShareMessage(
    tower =
      selectedTower,
    inspection =
      null
  ) {
    const sweeping =
      inspection
        ? inspection.sweeping_done
        : sweepingDone

    const mopping =
      inspection
        ? inspection.mopping_done
        : moppingDone

    const camera =
      inspection
        ? (
            inspection.camera_working ??
            inspection.camera_led_working
          )
        : cameraWorking

    const led =
      inspection
        ? (
            inspection.led_screen_working ??
            inspection.camera_led_working
          )
        : ledScreenWorking

    const lights =
      inspection
        ? inspection.lights_working_count
        : lightsWorkingCount

    const reportRemarks =
      inspection
        ? inspection.remarks ||
          ''
        : remarks

    const reportHasIssue =
      sweeping === false ||
      camera === false ||
      led === false ||
      (
        lights !== null &&
        lights < 9
      )

    const sweepingText =
      sweeping
        ? `${WA.check} Done`
        : `${WA.cross} Not Done`

    const moppingText =
      mopping
        ? `${WA.check} Done`
        : `${WA.neutral} Not Done Today`

    const cameraText =
      camera
        ? `${WA.check} Working`
        : `${WA.cross} Not Working`

    const ledText =
      led
        ? `${WA.check} Working`
        : `${WA.cross} Not Working`

    const lightsText =
      lights === 9
        ? `${WA.check} ${lights}/9 Working`
        : `${WA.warning} ${lights}/9 Working`

    const overallStatus =
      reportHasIssue
        ? `${WA.warning} ATTENTION REQUIRED`
        : `${WA.check} SATISFACTORY`

    const remarkText =
      reportRemarks.trim()
        ? `
${WA.warning} *REMARK / ACTION REQUIRED*
*${reportRemarks.trim()}*
`
        : ''

    const table =
`Item              Status
--------------------------------
${WA.sweeping} Sweeping        ${sweepingText}
${WA.mopping} Mopping         ${moppingText}
${WA.camera} Camera          ${cameraText}
${WA.led} LED Screen      ${ledText}
${WA.light} Lights          ${lightsText}`

    return (
`${WA.building} *${tower.tower_name} - Daily Inspection*
${formatDate(today)}

\`\`\`
${table}
\`\`\`
${remarkText}
${WA.location} Visit: QR + GPS Verified

*Overall Status: ${overallStatus}*

${WA.person} Inspected by: Supervisor
${WA.home} RWA Pocket-A

_Digitally generated through the RWA-AI App._`
    )
  }

  async function shareReport(
    tower =
      selectedTower,
    inspection =
      null
  ) {
    setError('')
    setInfoMessage('')

    const report =
      inspection ||
      getInspectionForTower(
        tower.id
      )

    if (
      !report &&
      !saved
    ) {
      setError(
        'Inspection has not been saved yet.'
      )

      return
    }

    const message =
      buildShareMessage(
        tower,
        report
      )

    if (
      navigator.share
    ) {
      try {
        await navigator.share({
          text: message,
        })

        return
      } catch (err) {
        if (
          err?.name ===
          'AbortError'
        ) {
          return
        }

        console.error(
          'Native share failed:',
          err
        )
      }
    }

    try {
      await navigator.clipboard.writeText(
        message
      )

      setInfoMessage(
        'Report copied to clipboard. Open WhatsApp and paste it into the Tower group.'
      )
    } catch (err) {
      console.error(err)

      setError(
        'Unable to share or copy the report.'
      )
    }
  }

  function openReport(
    tower
  ) {
    const inspection =
      getInspectionForTower(
        tower.id
      )

    if (!inspection) {
      return
    }

    setDashboardMessage('')

    setSelectedTower(
      tower
    )

    populateForm(
      inspection
    )

    setScanLatitude(
      inspection.scan_latitude
    )

    setScanLongitude(
      inspection.scan_longitude
    )

    setGpsAccuracy(
      inspection.gps_accuracy_m
    )

    setDistanceFromTower(
      inspection.distance_from_tower_m
    )

    setQrScannedAt(
      inspection.qr_scanned_at
    )

    setError('')
    setInfoMessage('')

    setScreen(
      'report'
    )
  }

  async function returnToList() {
    await stopScanner()

    setScannerActive(
      false
    )

    setSelectedTower(
      null
    )

    setQrScannedAt(
      null
    )

    setScanLatitude(
      null
    )

    setScanLongitude(
      null
    )

    setGpsFailureReason('')

    setDistanceFromTower(
      null
    )

    setGpsAccuracy(
      null
    )

    resetForm()

    setError('')
    setInfoMessage('')

    setScreen(
      'list'
    )
  }

  const completedInspections =
    inspections.filter(
      (inspection) =>
        Boolean(
          inspection.saved_at
        )
    )

  const completedCount =
    completedInspections.length

  const issueCount =
    completedInspections.filter(
      (inspection) =>
        inspectionHasIssue(
          inspection
        )
    ).length

  const pendingTowers =
    towers.filter(
      (tower) =>
        !completedInspections.some(
          (inspection) =>
            inspection.tower_id ===
            tower.id
        )
    )

  const pendingCount =
    pendingTowers.length

  const sweepingNotDone =
    completedInspections.filter(
      (inspection) =>
        inspection.sweeping_done ===
        false
    )

  const moppingNotDone =
    completedInspections.filter(
      (inspection) =>
        inspection.mopping_done ===
        false
    )

  const cameraIssues =
    completedInspections.filter(
      (inspection) =>
        (
          inspection.camera_working ??
          inspection.camera_led_working
        ) === false
    )

  const ledIssues =
    completedInspections.filter(
      (inspection) =>
        (
          inspection.led_screen_working ??
          inspection.camera_led_working
        ) === false
    )

  const lightIssues =
    completedInspections.filter(
      (inspection) =>
        inspection.lights_working_count !==
          null &&
        inspection.lights_working_count <
          9
    )

  function inspectionNames(
    inspectionList
  ) {
    return inspectionList
      .map(
        (inspection) =>
          getTowerName(
            inspection.tower_id
          )
      )
      .join(', ')
  }

  function updateDailySummary(
    field,
    value
  ) {
    setDailySummary(
      (current) => ({
        ...current,
        [field]: value,
      })
    )

    setDailySummarySaved(
      false
    )

    setInfoMessage('')
  }

  function updateStreetLightStatus(
    allWorking
  ) {
    setDailySummary(
      (current) => ({
        ...current,

        street_lights_all_working:
          allWorking,

        street_lights_not_working_count:
          allWorking
            ? 0
            : Math.max(
                1,
                Number(
                  current.street_lights_not_working_count ||
                  0
                )
              ),
      })
    )

    setDailySummarySaved(
      false
    )

    setInfoMessage('')
  }

  function decreaseStreetLights() {
    setDailySummary(
      (current) => ({
        ...current,

        street_lights_not_working_count:
          Math.max(
            1,
            Number(
              current.street_lights_not_working_count ||
              1
            ) - 1
          ),
      })
    )

    setDailySummarySaved(
      false
    )
  }

  function increaseStreetLights() {
    setDailySummary(
      (current) => ({
        ...current,

        street_lights_not_working_count:
          Math.min(
            99,
            Number(
              current.street_lights_not_working_count ||
              0
            ) + 1
          ),
      })
    )

    setDailySummarySaved(
      false
    )
  }

  function openDailySummary() {
    setDashboardMessage('')
    setError('')
    setInfoMessage('')

    if (
      dailySummaryRecord
    ) {
      setDailySummary({
        park1_sweeping_done:
          dailySummaryRecord.park1_sweeping_done,

        park1_grass_mowed:
          dailySummaryRecord.park1_grass_mowed,

        park1_area_clear:
          dailySummaryRecord.park1_area_clear,

        park2_sweeping_done:
          dailySummaryRecord.park2_sweeping_done,

        park2_grass_mowed:
          dailySummaryRecord.park2_grass_mowed,

        park2_area_clear:
          dailySummaryRecord.park2_area_clear,

        water_leakage_found:
          dailySummaryRecord.water_leakage_found,

        water_leakage_locations:
          dailySummaryRecord.water_leakage_locations ||
          '',

        garbage_collected:
          dailySummaryRecord.garbage_collected,

        garbage_disposed:
          dailySummaryRecord.garbage_disposed,

        street_lights_all_working:
          dailySummaryRecord.street_lights_all_working,

        street_lights_not_working_count:
          dailySummaryRecord.street_lights_not_working_count ??
          0,
      })

      setDailySummarySaved(
        Boolean(
          dailySummaryRecord.saved_at
        )
      )
    }

    setScreen(
      'summary'
    )

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const streetLightsComplete =
    dailySummary
      .street_lights_all_working !==
      null &&
    (
      dailySummary
        .street_lights_all_working ===
        true ||
      Number(
        dailySummary
          .street_lights_not_working_count
      ) >= 1
    )

  const dailySummaryComplete =
    dailySummary
      .park1_sweeping_done !==
      null &&
    dailySummary
      .park1_grass_mowed !==
      null &&
    dailySummary
      .park1_area_clear !==
      null &&
    dailySummary
      .park2_sweeping_done !==
      null &&
    dailySummary
      .park2_grass_mowed !==
      null &&
    dailySummary
      .park2_area_clear !==
      null &&
    dailySummary
      .water_leakage_found !==
      null &&
    dailySummary
      .garbage_collected !==
      null &&
    dailySummary
      .garbage_disposed !==
      null &&
    streetLightsComplete &&
    (
      dailySummary
        .water_leakage_found ===
        false ||
      dailySummary
        .water_leakage_locations
        .trim()
        .length >
        0
    )

  const dailySummaryHasIssue =
    sweepingNotDone.length >
      0 ||
    cameraIssues.length >
      0 ||
    ledIssues.length >
      0 ||
    lightIssues.length >
      0 ||
    dailySummary
      .park1_sweeping_done ===
      false ||
    dailySummary
      .park1_grass_mowed ===
      false ||
    dailySummary
      .park1_area_clear ===
      false ||
    dailySummary
      .park2_sweeping_done ===
      false ||
    dailySummary
      .park2_grass_mowed ===
      false ||
    dailySummary
      .park2_area_clear ===
      false ||
    dailySummary
      .water_leakage_found ===
      true ||
    dailySummary
      .garbage_collected ===
      false ||
    dailySummary
      .garbage_disposed ===
      false ||
    dailySummary
      .street_lights_all_working ===
      false

  async function saveDailySummary() {
    setError('')
    setInfoMessage('')

    if (
      !dailySummaryComplete
    ) {
      setError(
        'Please complete Park 1, Park 2, water leakage, garbage and street light checks before saving.'
      )

      return
    }

    setDailySummarySaving(
      true
    )

    try {
      const {
        data: {
          user
        },
      } =
        await supabase.auth.getUser()

      if (!user) {
        throw new Error(
          'Your login session has expired.'
        )
      }

      const now =
        new Date().toISOString()

      const summaryData = {
        summary_date:
          today,

        park1_sweeping_done:
          dailySummary
            .park1_sweeping_done,

        park1_grass_mowed:
          dailySummary
            .park1_grass_mowed,

        park1_area_clear:
          dailySummary
            .park1_area_clear,

        park2_sweeping_done:
          dailySummary
            .park2_sweeping_done,

        park2_grass_mowed:
          dailySummary
            .park2_grass_mowed,

        park2_area_clear:
          dailySummary
            .park2_area_clear,

        water_leakage_found:
          dailySummary
            .water_leakage_found,

        water_leakage_locations:
          dailySummary
            .water_leakage_found
            ? dailySummary
                .water_leakage_locations
                .trim()
            : null,

        garbage_collected:
          dailySummary
            .garbage_collected,

        garbage_disposed:
          dailySummary
            .garbage_disposed,

        street_lights_all_working:
          dailySummary
            .street_lights_all_working,

        street_lights_not_working_count:
          dailySummary
            .street_lights_all_working
            ? 0
            : Number(
                dailySummary
                  .street_lights_not_working_count
              ),

        inspected_by:
          user.id,

        saved_at:
          now,

        updated_at:
          now,
      }

      const {
        data,
        error: saveError,
      } =
        await supabase
          .from(
            'daily_rwa_summaries'
          )
          .upsert(
            summaryData,
            {
              onConflict:
                'summary_date',
            }
          )
          .select()
          .single()

      if (saveError) {
        throw saveError
      }

      setDailySummaryRecord(
        data
      )

      setDailySummarySaved(
        true
      )

      setInfoMessage(
        pendingCount > 0
          ? `Daily summary saved. ${pendingCount} tower${pendingCount === 1 ? '' : 's'} will be shown as not included in the report.`
          : 'Daily RWA summary saved successfully.'
      )

    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to save Daily RWA Summary.'
      )
    } finally {
      setDailySummarySaving(
        false
      )
    }
  }

  function buildDailySummaryMessage() {
    const reportScopeText =
      completedCount ===
      towers.length
        ? `${WA.check} All ${towers.length} towers inspected`
        : `${WA.warning} ${completedCount}/${towers.length} towers inspected`

    const missingTowersText =
      pendingCount > 0
        ? `
${WA.warning} *NOT INCLUDED IN THIS REPORT*
${pendingTowers
  .map(
    (tower) =>
      tower.tower_name
  )
  .join(', ')}
`
        : ''

    /*
     * ATTENTION REQUIRED
     *
     * Priority:
     * 1 Camera
     * 2 LED
     * 3 Water Leakage
     * 4 Garbage
     * 5 Other
     *
     * Mopping deliberately NOT included.
     */

    const attentionLines =
      []

    /*
     * 1. CAMERA
     */

    if (
      cameraIssues.length >
      0
    ) {
      attentionLines.push(
        `${WA.camera} *Camera:* Not working - ${inspectionNames(
          cameraIssues
        )}`
      )
    }

    /*
     * 2. LED
     */

    if (
      ledIssues.length >
      0
    ) {
      attentionLines.push(
        `${WA.led} *LED:* Not working - ${inspectionNames(
          ledIssues
        )}`
      )
    }

    /*
     * 3. WATER LEAKAGE
     */

    if (
      dailySummary
        .water_leakage_found ===
      true
    ) {
      attentionLines.push(
        `${WA.water} *Water Leakage:* ${dailySummary.water_leakage_locations.trim()}`
      )
    }

    /*
     * 4. GARBAGE
     */

    const garbageProblems =
      []

    if (
      dailySummary
        .garbage_collected ===
      false
    ) {
      garbageProblems.push(
        'Not collected'
      )
    }

    if (
      dailySummary
        .garbage_disposed ===
      false
    ) {
      garbageProblems.push(
        'Not disposed'
      )
    }

    if (
      garbageProblems.length >
      0
    ) {
      attentionLines.push(
        `${WA.garbage} *Garbage:* ${garbageProblems.join(
          ', '
        )}`
      )
    }

    /*
     * 5. OTHER
     */

    const otherProblems =
      []

    /*
     * STREET LIGHTS
     */

    if (
      dailySummary
        .street_lights_all_working ===
      false
    ) {
      const count =
        Number(
          dailySummary
            .street_lights_not_working_count
        )

      otherProblems.push(
        `${WA.light} Street Lights - ${count} ${
          count === 1
            ? 'light'
            : 'lights'
        } not working`
      )
    }

    /*
     * TOWER LIGHTS
     */

    if (
      lightIssues.length >
      0
    ) {
      otherProblems.push(
        `${WA.light} Tower Lights - ${lightIssues
          .map(
            (inspection) =>
              `${getTowerName(
                inspection.tower_id
              )}: ${inspection.lights_working_count}/9 working`
          )
          .join(', ')}`
      )
    }

    /*
     * TOWER SWEEPING
     */

    if (
      sweepingNotDone.length >
      0
    ) {
      otherProblems.push(
        `${WA.sweeping} Tower Sweeping - Not done: ${inspectionNames(
          sweepingNotDone
        )}`
      )
    }

    /*
     * NOTE:
     * Mopping is intentionally NOT
     * included in Attention Required.
     */

    /*
     * PARK 1
     */

    const park1Problems =
      []

    if (
      dailySummary
        .park1_sweeping_done ===
      false
    ) {
      park1Problems.push(
        'sweeping not done'
      )
    }

    if (
      dailySummary
        .park1_grass_mowed ===
      false
    ) {
      park1Problems.push(
        'grass overgrown'
      )
    }

    if (
      dailySummary
        .park1_area_clear ===
      false
    ) {
      park1Problems.push(
        'malwa / debris / tree residue present'
      )
    }

    if (
      park1Problems.length >
      0
    ) {
      otherProblems.push(
        `${WA.park} Park 1 - ${park1Problems.join(
          ', '
        )}`
      )
    }

    /*
     * PARK 2
     */

    const park2Problems =
      []

    if (
      dailySummary
        .park2_sweeping_done ===
      false
    ) {
      park2Problems.push(
        'sweeping not done'
      )
    }

    if (
      dailySummary
        .park2_grass_mowed ===
      false
    ) {
      park2Problems.push(
        'grass overgrown'
      )
    }

    if (
      dailySummary
        .park2_area_clear ===
      false
    ) {
      park2Problems.push(
        'malwa / debris / tree residue present'
      )
    }

    if (
      park2Problems.length >
      0
    ) {
      otherProblems.push(
        `${WA.park} Park 2 - ${park2Problems.join(
          ', '
        )}`
      )
    }

    if (
      otherProblems.length >
      0
    ) {
      attentionLines.push(
        `${WA.warning} *Other:*\n${otherProblems
          .map(
            (problem) =>
              `• ${problem}`
          )
          .join('\n')}`
      )
    }

    const attentionSection =
      attentionLines.length >
      0
        ? `🚨 *ATTENTION REQUIRED*

${attentionLines.join('\n')}`
        : `${WA.check} *NO ATTENTION ITEMS IN INSPECTED AREAS*`

    /*
     * NORMAL TOWER SUMMARY
     */

    let towerSection = ''

    if (
      completedCount === 0
    ) {
      towerSection =
`${WA.warning} No tower inspections completed yet.`
    } else {
      const sweepingText =
        sweepingNotDone.length ===
        0
          ? `${WA.check} Sweeping - Done in all ${
              pendingCount > 0
                ? 'inspected towers'
                : 'towers'
            }`
          : `${WA.cross} Sweeping - Not done: ${inspectionNames(
              sweepingNotDone
            )}`

      /*
       * Mopping remains in normal
       * report, just not Attention.
       */

      const moppingText =
        moppingNotDone.length ===
        0
          ? `${WA.check} Mopping - Done in all ${
              pendingCount > 0
                ? 'inspected towers'
                : 'towers'
            }`
          : `${WA.cross} Mopping - Not done: ${inspectionNames(
              moppingNotDone
            )}`

      const cameraText =
        cameraIssues.length ===
        0
          ? `${WA.check} Cameras - Working in all ${
              pendingCount > 0
                ? 'inspected towers'
                : 'towers'
            }`
          : `${WA.warning} Camera not working - ${inspectionNames(
              cameraIssues
            )}`

      const ledText =
        ledIssues.length ===
        0
          ? `${WA.check} LED Screens - Working in all ${
              pendingCount > 0
                ? 'inspected towers'
                : 'towers'
            }`
          : `${WA.warning} LED Screen not working - ${inspectionNames(
              ledIssues
            )}`

      const lightsText =
        lightIssues.length ===
        0
          ? `${WA.check} Lights - All working in ${
              pendingCount > 0
                ? 'inspected towers'
                : 'all towers'
            }`
          : `${WA.warning} Lights - ${lightIssues
              .map(
                (inspection) =>
                  `${getTowerName(
                    inspection.tower_id
                  )}: ${inspection.lights_working_count}/9`
              )
              .join(', ')}`

      towerSection =
`${sweepingText}
${moppingText}
${cameraText}
${ledText}
${lightsText}`
    }

    const park1 =
`${dailySummary.park1_sweeping_done
  ? WA.check
  : WA.cross} Sweeping ${
  dailySummary.park1_sweeping_done
    ? 'done'
    : 'not done'
}
${dailySummary.park1_grass_mowed
  ? WA.check
  : WA.warning} Grass ${
  dailySummary.park1_grass_mowed
    ? 'properly mowed'
    : 'overgrown'
}
${dailySummary.park1_area_clear
  ? WA.check
  : WA.warning} ${
  dailySummary.park1_area_clear
    ? 'No malwa / debris / tree residue'
    : 'Malwa / debris / tree residue present'
}`

    const park2 =
`${dailySummary.park2_sweeping_done
  ? WA.check
  : WA.cross} Sweeping ${
  dailySummary.park2_sweeping_done
    ? 'done'
    : 'not done'
}
${dailySummary.park2_grass_mowed
  ? WA.check
  : WA.warning} Grass ${
  dailySummary.park2_grass_mowed
    ? 'properly mowed'
    : 'overgrown'
}
${dailySummary.park2_area_clear
  ? WA.check
  : WA.warning} ${
  dailySummary.park2_area_clear
    ? 'No malwa / debris / tree residue'
    : 'Malwa / debris / tree residue present'
}`

    const leakage =
      dailySummary
        .water_leakage_found
        ? `${WA.warning} Leakage found - ${dailySummary.water_leakage_locations.trim()}`
        : `${WA.check} No outside-wall water leakage found`

    const garbage =
`${dailySummary.garbage_collected
  ? WA.check
  : WA.cross} Garbage ${
  dailySummary.garbage_collected
    ? 'collected'
    : 'not collected'
}
${dailySummary.garbage_disposed
  ? WA.check
  : WA.cross} Garbage ${
  dailySummary.garbage_disposed
    ? 'disposed'
    : 'not disposed'
}`

    const streetLights =
      dailySummary
        .street_lights_all_working
        ? `${WA.check} All street lights working`
        : `${WA.warning} ${dailySummary.street_lights_not_working_count} ${
            Number(
              dailySummary
                .street_lights_not_working_count
            ) === 1
              ? 'street light is'
              : 'street lights are'
          } not working`

    const coverageStatus =
      pendingCount > 0
        ? `${WA.warning} PARTIAL REPORT`
        : `${WA.check} COMPLETE REPORT`

    const overallStatus =
      dailySummaryHasIssue
        ? `${WA.warning} ATTENTION REQUIRED`
        : `${WA.check} SATISFACTORY`

    return (
`${WA.home} *RWA POCKET-A*
*DAILY INSPECTION SUMMARY*
${formatDate(today)}

${attentionSection}

--------------------------------

${WA.building} *TOWER INSPECTION*
${reportScopeText}
${missingTowersText}
${towerSection}

${WA.park} *PARK 1*
${park1}

${WA.park} *PARK 2*
${park2}

${WA.water} *WATER LEAKAGE*
${leakage}

${WA.garbage} *GARBAGE*
${garbage}

${WA.light} *STREET LIGHTS*
${streetLights}

*Report Status: ${coverageStatus}*
*Overall Condition: ${overallStatus}*

${WA.person} Inspected by: Supervisor
${WA.home} RWA Pocket-A

_Digitally generated through the RWA-AI App._`
    )
  }

  async function shareDailySummary() {
    setError('')
    setInfoMessage('')

    if (
      !dailySummarySaved
    ) {
      setError(
        'Please save the Daily RWA Summary before sharing.'
      )

      return
    }

    const message =
      buildDailySummaryMessage()

    if (
      navigator.share
    ) {
      try {
        await navigator.share({
          text: message,
        })

        return
      } catch (err) {
        if (
          err?.name ===
          'AbortError'
        ) {
          return
        }

        console.error(
          'Native share failed:',
          err
        )
      }
    }

    try {
      await navigator.clipboard.writeText(
        message
      )

      setInfoMessage(
        'Daily RWA Summary copied to clipboard. Open WhatsApp and paste it into the RWA group.'
      )
    } catch (err) {
      console.error(err)

      setError(
        'Unable to share or copy the Daily RWA Summary.'
      )
    }
  }

  if (
    screen === 'list'
  ) {
    return (
      <div className="tower-inspection-page">

        <header className="inspection-header">

          <button
            type="button"
            className="inspection-header-back"
            onClick={onBack}
          >
            ←
          </button>

          <div>
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

        <main className="inspection-content">

          <div className="inspection-summary">

            <div className="summary-main">

              <span>
                Today's Progress
              </span>

              <strong>
                {completedCount} / {towers.length}
              </strong>

            </div>

            <div className="summary-stats">

              <div>
                <strong>
                  {completedCount}
                </strong>
                <span>
                  ✅ Done
                </span>
              </div>

              <div>
                <strong>
                  {pendingCount}
                </strong>
                <span>
                  ⏳ Pending
                </span>
              </div>

              <div>
                <strong>
                  {issueCount}
                </strong>
                <span>
                  ⚠ Issues
                </span>
              </div>

            </div>

          </div>

          <div className="rwa-summary-entry-card">

            <div className="rwa-summary-entry-top">

              <div className="rwa-summary-entry-icon">
                📋
              </div>

              <div>
                <strong>
                  Daily RWA Summary
                </strong>

                <span>
                  Towers + Parks + Leakage + Garbage + Street Lights
                </span>
              </div>

            </div>

            <div
              className={`rwa-summary-coverage ${
                pendingCount > 0
                  ? 'rwa-summary-coverage-partial'
                  : 'rwa-summary-coverage-complete'
              }`}
            >
              {pendingCount > 0
                ? `⚠ ${completedCount}/${towers.length} towers inspected`
                : `✅ All ${towers.length} towers inspected`}
            </div>

            {pendingCount > 0 && (
              <div className="rwa-summary-missing-preview">

                <strong>
                  Not included:
                </strong>

                <span>
                  {pendingTowers
                    .map(
                      (tower) =>
                        tower.tower_name
                    )
                    .join(', ')}
                </span>

              </div>
            )}

            <button
              type="button"
              className="open-rwa-summary-button"
              onClick={
                openDailySummary
              }
            >
              📋 Open Daily Summary
            </button>

          </div>

          {dashboardMessage && (
            <div className="inspection-success-box dashboard-success-box">
              {dashboardMessage}
            </div>
          )}

          {loading && (
            <div className="inspection-message-card">
              Loading towers...
            </div>
          )}

          {error && (
            <div className="inspection-error-box">
              {error}
            </div>
          )}

          {!loading && (
            <div className="tower-list">

              {towers.map(
                (tower) => {
                  const inspection =
                    getInspectionForTower(
                      tower.id
                    )

                  const done =
                    Boolean(
                      inspection
                        ?.saved_at
                    )

                  const issue =
                    done &&
                    inspectionHasIssue(
                      inspection
                    )

                  return (
                    <div
                      className="tower-row-card"
                      key={
                        tower.id
                      }
                    >

                      <div className="tower-row-top">

                        <div className="tower-row-name">

                          <span className="tower-row-icon">
                            🏢
                          </span>

                          <div>
                            <strong>
                              {tower.tower_name}
                            </strong>

                            {done && (
                              <small>
                                Saved{' '}
                                {formatTime(
                                  inspection.saved_at
                                )}
                              </small>
                            )}
                          </div>

                        </div>

                        <div
                          className={`tower-status ${
                            !done
                              ? 'tower-status-pending'
                              : issue
                              ? 'tower-status-issue'
                              : 'tower-status-done'
                          }`}
                        >
                          {!done
                            ? '⏳ Pending'
                            : issue
                            ? '⚠ Attention'
                            : '✅ Done'}
                        </div>

                      </div>

                      {!done ? (
                        <div className="tower-row-actions tower-row-actions-pending">

                          <button
                            type="button"
                            className="tower-scan-button"
                            onClick={() =>
                              startTowerScan(
                                tower
                              )
                            }
                          >
                            📷 Scan Tower
                          </button>

                        </div>
                      ) : (
                        <div className="tower-row-actions tower-row-actions-complete">

                          <button
                            type="button"
                            className="tower-report-button"
                            onClick={() =>
                              openReport(
                                tower
                              )
                            }
                          >
                            📄 View Report
                          </button>

                          <button
                            type="button"
                            className="tower-share-button"
                            onClick={() =>
                              shareReport(
                                tower,
                                inspection
                              )
                            }
                          >
                            📲 Share
                          </button>

                          <button
                            type="button"
                            className="tower-rescan-button"
                            onClick={() =>
                              startTowerScan(
                                tower
                              )
                            }
                          >
                            📷 Scan Again
                          </button>

                        </div>
                      )}

                    </div>
                  )
                }
              )}

            </div>
          )}

        </main>

      </div>
    )
  }

  if (
    screen === 'summary'
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
              Daily RWA Summary
            </h1>

            <p>
              {formatDate(today)}
            </p>

          </div>

        </header>

        <main className="inspection-content">

          <div
            className={`summary-coverage-card ${
              pendingCount > 0
                ? 'summary-coverage-partial'
                : 'summary-coverage-complete'
            }`}
          >

            <div>

              <small>
                Tower Inspection Coverage
              </small>

              <strong>
                {completedCount} / {towers.length}
              </strong>

            </div>

            <span>
              {pendingCount > 0
                ? '⚠ Partial'
                : '✅ Complete'}
            </span>

          </div>

          {pendingCount > 0 && (
            <div className="not-included-card">

              <strong>
                ⚠️ Not included in this report
              </strong>

              <p>
                {pendingTowers
                  .map(
                    (tower) =>
                      tower.tower_name
                  )
                  .join(', ')}
              </p>

              <small>
                Summary results below apply only to towers that have been inspected.
              </small>

            </div>
          )}

          <div className="summary-section-card">

            <div className="summary-section-title">

              <span>
                🏢
              </span>

              <div>
                <h2>
                  Tower Summary
                </h2>

                <p>
                  Generated automatically from tower inspections.
                </p>
              </div>

            </div>

            {completedCount ===
            0 ? (
              <div className="summary-no-tower-data">
                ⚠️ No tower inspections completed yet.
              </div>
            ) : (
              <div className="tower-auto-summary">

                <div
                  className={`tower-summary-line ${
                    sweepingNotDone.length >
                    0
                      ? 'summary-line-bad'
                      : 'summary-line-good'
                  }`}
                >
                  <span>
                    🧹 Sweeping
                  </span>

                  <strong>
                    {sweepingNotDone.length ===
                    0
                      ? `✅ Done in all ${
                          pendingCount >
                          0
                            ? 'inspected towers'
                            : 'towers'
                        }`
                      : `❌ Not done: ${inspectionNames(
                          sweepingNotDone
                        )}`}
                  </strong>

                </div>

                <div
                  className={`tower-summary-line ${
                    moppingNotDone.length >
                    0
                      ? 'summary-line-bad'
                      : 'summary-line-good'
                  }`}
                >
                  <span>
                    🧽 Mopping
                  </span>

                  <strong>
                    {moppingNotDone.length ===
                    0
                      ? `✅ Done in all ${
                          pendingCount >
                          0
                            ? 'inspected towers'
                            : 'towers'
                        }`
                      : `❌ Not done: ${inspectionNames(
                          moppingNotDone
                        )}`}
                  </strong>

                </div>

                <div
                  className={`tower-summary-line ${
                    cameraIssues.length >
                    0
                      ? 'summary-line-warning'
                      : 'summary-line-good'
                  }`}
                >
                  <span>
                    📷 Camera
                  </span>

                  <strong>
                    {cameraIssues.length ===
                    0
                      ? '✅ All working'
                      : `⚠️ Not working: ${inspectionNames(
                          cameraIssues
                        )}`}
                  </strong>

                </div>

                <div
                  className={`tower-summary-line ${
                    ledIssues.length >
                    0
                      ? 'summary-line-warning'
                      : 'summary-line-good'
                  }`}
                >
                  <span>
                    📺 LED Screen
                  </span>

                  <strong>
                    {ledIssues.length ===
                    0
                      ? '✅ All working'
                      : `⚠️ Not working: ${inspectionNames(
                          ledIssues
                        )}`}
                  </strong>

                </div>

                <div
                  className={`tower-summary-line ${
                    lightIssues.length >
                    0
                      ? 'summary-line-warning'
                      : 'summary-line-good'
                  }`}
                >
                  <span>
                    💡 Tower Lights
                  </span>

                  <strong>
                    {lightIssues.length ===
                    0
                      ? '✅ All working'
                      : `⚠️ ${lightIssues
                          .map(
                            (inspection) =>
                              `${getTowerName(
                                inspection.tower_id
                              )}: ${inspection.lights_working_count}/9`
                          )
                          .join(', ')}`}
                  </strong>

                </div>

              </div>
            )}

          </div>

          <div className="summary-section-card">

            <div className="summary-section-title">
              <span>
                🌳
              </span>

              <div>
                <h2>
                  Park 1
                </h2>

                <p>
                  Daily common-area inspection
                </p>
              </div>
            </div>

            <InspectionToggle
              icon="🧹"
              label="Sweeping"
              positiveText="Done"
              negativeText="Not Done"
              value={
                dailySummary
                  .park1_sweeping_done
              }
              onChange={(value) =>
                updateDailySummary(
                  'park1_sweeping_done',
                  value
                )
              }
            />

            <InspectionToggle
              icon="🌱"
              label="Grass"
              positiveText="Properly Mowed"
              negativeText="Overgrown"
              value={
                dailySummary
                  .park1_grass_mowed
              }
              onChange={(value) =>
                updateDailySummary(
                  'park1_grass_mowed',
                  value
                )
              }
            />

            <InspectionToggle
              icon="🍂"
              label="Malwa / Debris / Tree Residue"
              positiveText="Area Clear"
              negativeText="Present"
              value={
                dailySummary
                  .park1_area_clear
              }
              onChange={(value) =>
                updateDailySummary(
                  'park1_area_clear',
                  value
                )
              }
            />

          </div>

          <div className="summary-section-card">

            <div className="summary-section-title">
              <span>
                🌳
              </span>

              <div>
                <h2>
                  Park 2
                </h2>

                <p>
                  Daily common-area inspection
                </p>
              </div>
            </div>

            <InspectionToggle
              icon="🧹"
              label="Sweeping"
              positiveText="Done"
              negativeText="Not Done"
              value={
                dailySummary
                  .park2_sweeping_done
              }
              onChange={(value) =>
                updateDailySummary(
                  'park2_sweeping_done',
                  value
                )
              }
            />

            <InspectionToggle
              icon="🌱"
              label="Grass"
              positiveText="Properly Mowed"
              negativeText="Overgrown"
              value={
                dailySummary
                  .park2_grass_mowed
              }
              onChange={(value) =>
                updateDailySummary(
                  'park2_grass_mowed',
                  value
                )
              }
            />

            <InspectionToggle
              icon="🍂"
              label="Malwa / Debris / Tree Residue"
              positiveText="Area Clear"
              negativeText="Present"
              value={
                dailySummary
                  .park2_area_clear
              }
              onChange={(value) =>
                updateDailySummary(
                  'park2_area_clear',
                  value
                )
              }
            />

          </div>

          <div className="summary-section-card">

            <div className="summary-section-title">

              <span>
                💧
              </span>

              <div>
                <h2>
                  Water Leakage
                </h2>

                <p>
                  Check along outside walls of towers.
                </p>
              </div>

            </div>

            <InspectionToggle
              icon="💧"
              label="Outside Wall Leakage"
              positiveText="No Leakage"
              negativeText="Leakage Found"
              value={
                dailySummary
                  .water_leakage_found ===
                null
                  ? null
                  : !dailySummary
                      .water_leakage_found
              }
              onChange={(noLeakage) =>
                updateDailySummary(
                  'water_leakage_found',
                  !noLeakage
                )
              }
            />

            {dailySummary
              .water_leakage_found ===
              true && (
              <div className="leakage-location-block">

                <label htmlFor="leakageLocations">
                  ⚠️ Which flat / location?
                </label>

                <textarea
                  id="leakageLocations"
                  rows="3"
                  value={
                    dailySummary
                      .water_leakage_locations
                  }
                  placeholder="Example: Tower 6 - Flat 603, Tower 8 - Flat 804"
                  onChange={(event) =>
                    updateDailySummary(
                      'water_leakage_locations',
                      event.target.value
                    )
                  }
                />

                <small>
                  You can enter more than one flat or location.
                </small>

              </div>
            )}

          </div>

          <div className="summary-section-card">

            <div className="summary-section-title">

              <span>
                🗑️
              </span>

              <div>
                <h2>
                  Garbage
                </h2>

                <p>
                  Collection and final disposal
                </p>
              </div>

            </div>

            <InspectionToggle
              icon="🗑️"
              label="Garbage Collection"
              positiveText="Collected"
              negativeText="Not Collected"
              value={
                dailySummary
                  .garbage_collected
              }
              onChange={(value) =>
                updateDailySummary(
                  'garbage_collected',
                  value
                )
              }
            />

            <InspectionToggle
              icon="🚛"
              label="Garbage Disposal"
              positiveText="Disposed"
              negativeText="Not Disposed"
              value={
                dailySummary
                  .garbage_disposed
              }
              onChange={(value) =>
                updateDailySummary(
                  'garbage_disposed',
                  value
                )
              }
            />

          </div>

          <div className="summary-section-card">

            <div className="summary-section-title">

              <span>
                💡
              </span>

              <div>
                <h2>
                  Street Lights
                </h2>

                <p>
                  Check common-area street lights
                </p>
              </div>

            </div>

            <InspectionToggle
              icon="💡"
              label="Street Lights"
              positiveText="All Working"
              negativeText="Some Not Working"
              value={
                dailySummary
                  .street_lights_all_working
              }
              onChange={
                updateStreetLightStatus
              }
            />

            {dailySummary
              .street_lights_all_working ===
              false && (
              <div className="inspection-item">

                <div className="inspection-item-heading">

                  <span className="inspection-item-icon">
                    ⚠️
                  </span>

                  <strong>
                    How many are not working?
                  </strong>

                </div>

                <div className="lights-counter">

                  <button
                    type="button"
                    onClick={
                      decreaseStreetLights
                    }
                  >
                    −
                  </button>

                  <div>
                    {dailySummary
                      .street_lights_not_working_count}
                  </div>

                  <button
                    type="button"
                    onClick={
                      increaseStreetLights
                    }
                  >
                    +
                  </button>

                </div>

              </div>
            )}

          </div>

          {dailySummaryComplete && (
            <div
              className={`overall-status-card ${
                dailySummaryHasIssue
                  ? 'status-attention'
                  : 'status-satisfactory'
              }`}
            >

              <span>
                {dailySummaryHasIssue
                  ? '⚠️'
                  : '✅'}
              </span>

              <div>

                <small>
                  Overall Condition
                </small>

                <strong>
                  {dailySummaryHasIssue
                    ? 'Attention Required'
                    : 'Satisfactory'}
                </strong>

              </div>

            </div>
          )}

          {pendingCount > 0 && (
            <div className="partial-share-warning">

              <strong>
                ⚠️ Partial Tower Report
              </strong>

              <span>
                {pendingCount} tower
                {pendingCount === 1
                  ? ''
                  : 's'} will be clearly shown as
                <b> not included </b>
                when this report is shared.
              </span>

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
            className="save-summary-button"
            disabled={
              dailySummarySaving ||
              !dailySummaryComplete
            }
            onClick={
              saveDailySummary
            }
          >
            {dailySummarySaving
              ? 'Saving...'
              : dailySummarySaved
              ? '✅ Daily Summary Saved'
              : '💾 Save Daily Summary'}
          </button>

          <button
            type="button"
            className="share-summary-button"
            disabled={
              !dailySummarySaved
            }
            onClick={
              shareDailySummary
            }
          >
            {pendingCount > 0
              ? '📲 Share Partial Summary'
              : '📲 Share Summary with RWA'}
          </button>

          <button
            type="button"
            className="scan-next-tower-button"
            onClick={
              returnToList
            }
          >
            ← Back to All Towers
          </button>

        </main>

      </div>
    )
  }

  if (
    screen === 'scanner'
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
              {selectedTower?.tower_name}
            </h1>

            <p>
              Scan Tower QR
            </p>
          </div>

        </header>

        <main className="inspection-content">

          <div className="selected-tower-card">

            <span>
              You selected
            </span>

            <strong>
              🏢 {selectedTower?.tower_name}
            </strong>

            <p>
              Scan only the QR installed at{' '}
              {selectedTower?.tower_name}.
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
              {selectedTower?.tower_name}
            </h1>

            <p>
              Location Verification
            </p>

          </div>

        </header>

        <main className="inspection-content">

          <div className="tower-identified-card">

            <div className="tower-identified-icon">
              ✅
            </div>

            <div>

              <span>
                Correct QR Scanned
              </span>

              <strong>
                {selectedTower?.tower_name}
              </strong>

            </div>

          </div>

          {gpsLoading ? (
            <div className="location-card location-verifying">

              <div className="inspection-big-icon">
                📍
              </div>

              <h2>
                Verifying Location...
              </h2>

              <p>
                Checking your live GPS distance from{' '}
                {selectedTower?.tower_name}.
              </p>

            </div>
          ) : (
            <div className="location-card location-failed">

              <div className="inspection-big-icon">
                ❌
              </div>

              <h2>
                Location Not Verified
              </h2>

              <p>
                {gpsFailureReason}
              </p>

              {distanceFromTower !==
                null && (
                <div className="failed-distance">

                  <span>
                    Current Distance
                  </span>

                  <strong>
                    {Math.round(
                      distanceFromTower
                    )} m
                  </strong>

                </div>
              )}

              <p>
                Allowed:{' '}
                <strong>
                  {selectedTower?.allowed_radius_m} m
                </strong>
              </p>

              <button
                type="button"
                className="retry-location-button"
                onClick={() =>
                  verifyGps(
                    selectedTower
                  )
                }
              >
                📍 Verify Location Again
              </button>

            </div>
          )}

        </main>

      </div>
    )
  }

  if (
    screen === 'report'
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
              {selectedTower?.tower_name}
            </h1>

            <p>
              Inspection Report •{' '}
              {formatDate(today)}
            </p>

          </div>

        </header>

        <main className="inspection-content">

          <div
            className={`report-status-card ${
              hasIssue
                ? 'report-status-issue'
                : 'report-status-good'
            }`}
          >

            <span>
              {hasIssue
                ? '⚠️'
                : '✅'}
            </span>

            <div>

              <small>
                Overall Status
              </small>

              <strong>
                {hasIssue
                  ? 'Attention Required'
                  : 'Satisfactory'}
              </strong>

            </div>

          </div>

          <div className="report-card">

            <div className="report-line">

              <span>
                🧹 Sweeping
              </span>

              <strong>
                {sweepingDone
                  ? '✅ Done'
                  : '❌ Not Done'}
              </strong>

            </div>

            <div className="report-line">

              <span>
                🧽 Mopping
              </span>

              <strong>
                {moppingDone
                  ? '✅ Done'
                  : '➖ Not Done Today'}
              </strong>

            </div>

            <div className="report-line">

              <span>
                📷 Camera
              </span>

              <strong>
                {cameraWorking
                  ? '✅ Working'
                  : '❌ Not Working'}
              </strong>

            </div>

            <div className="report-line">

              <span>
                📺 LED Screen
              </span>

              <strong>
                {ledScreenWorking
                  ? '✅ Working'
                  : '❌ Not Working'}
              </strong>

            </div>

            <div className="report-line">

              <span>
                💡 Lights
              </span>

              <strong>
                {lightsWorkingCount ===
                9
                  ? `✅ ${lightsWorkingCount}/9`
                  : `⚠️ ${lightsWorkingCount}/9`}
              </strong>

            </div>

            {remarks.trim() && (
              <div className="report-remarks">

                <strong>
                  ⚠️ Remark
                </strong>

                <p>
                  {remarks}
                </p>

              </div>
            )}

          </div>

          <div className="visit-proof-card">

            <strong>
              🔐 Visit Verification
            </strong>

            <span>
              Tower QR: ✅ Verified
            </span>

            <span>
              GPS: ✅ Verified
            </span>

            {distanceFromTower !==
              null && (
              <span>
                Distance:{' '}
                {Math.round(
                  distanceFromTower
                )} m
              </span>
            )}

            {gpsAccuracy !==
              null && (
              <span>
                GPS Accuracy: ±
                {Math.round(
                  gpsAccuracy
                )} m
              </span>
            )}

            <span>
              Scan Time:{' '}
              {formatTime(
                qrScannedAt
              )}
            </span>

            <span>
              Saved:{' '}
              {formatTime(
                savedAt
              )}
            </span>

          </div>

          <button
            type="button"
            className="share-whatsapp-button"
            onClick={() =>
              shareReport(
                selectedTower
              )
            }
          >
            📲 Share on WhatsApp
          </button>

          <button
            type="button"
            className="scan-next-tower-button"
            onClick={
              returnToList
            }
          >
            ← Back to All Towers
          </button>

        </main>

      </div>
    )
  }

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
            {selectedTower?.tower_name}
          </h1>

          <p>
            Daily Inspection •{' '}
            {formatDate(today)}
          </p>

        </div>

      </header>

      <main className="inspection-content">

        <div className="location-card location-verified">

          <div className="verification-title">

            <span className="verification-check">
              ✅
            </span>

            <div>

              <strong>
                QR + GPS Verified
              </strong>

              <small>
                Inspection unlocked
              </small>

            </div>

          </div>

          <div className="location-details">

            <span>
              Distance
              <strong>
                {Math.round(
                  distanceFromTower
                )} m
              </strong>
            </span>

            <span>
              Allowed
              <strong>
                {selectedTower?.allowed_radius_m} m
              </strong>
            </span>

            <span>
              Accuracy
              <strong>
                ±{Math.round(
                  gpsAccuracy
                )} m
              </strong>
            </span>

            <span>
              Scan
              <strong>
                {formatTime(
                  qrScannedAt
                )}
              </strong>
            </span>

          </div>

        </div>

        <div className="inspection-form-card">

          <div className="inspection-section-heading">

            <h2>
              Daily Checklist
            </h2>

            <p>
              Physically check every item before selecting its status.
            </p>

          </div>

          <InspectionToggle
            icon="🧹"
            label="Sweeping"
            positiveText="Done"
            negativeText="Not Done"
            value={
              sweepingDone
            }
            onChange={(value) => {
              setSweepingDone(
                value
              )
              markChanged()
            }}
          />

          <InspectionToggle
            icon="🧽"
            label="Mopping"
            positiveText="Done"
            negativeText="Not Done Today"
            value={
              moppingDone
            }
            onChange={(value) => {
              setMoppingDone(
                value
              )
              markChanged()
            }}
          />

          <InspectionToggle
            icon="📷"
            label="Camera"
            positiveText="Working"
            negativeText="Not Working"
            value={
              cameraWorking
            }
            onChange={(value) => {
              setCameraWorking(
                value
              )
              markChanged()
            }}
          />

          <InspectionToggle
            icon="📺"
            label="LED Screen"
            positiveText="Working"
            negativeText="Not Working"
            value={
              ledScreenWorking
            }
            onChange={(value) => {
              setLedScreenWorking(
                value
              )
              markChanged()
            }}
          />

          <div className="inspection-item">

            <div className="inspection-item-heading">

              <span className="inspection-item-icon">
                💡
              </span>

              <strong>
                Lights Glowing
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
                {lightsWorkingCount ===
                null
                  ? '–'
                  : lightsWorkingCount}

                <span>
                  /9
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

            <div className="lights-quick-row">

              <button
                type="button"
                onClick={() => {
                  setLightsWorkingCount(
                    9
                  )
                  markChanged()
                }}
              >
                ✅ All 9
              </button>

              <button
                type="button"
                onClick={() => {
                  setLightsWorkingCount(
                    8
                  )
                  markChanged()
                }}
              >
                8 / 9
              </button>

              <button
                type="button"
                onClick={() => {
                  setLightsWorkingCount(
                    7
                  )
                  markChanged()
                }}
              >
                7 / 9
              </button>

            </div>

          </div>

          <div className="remarks-block">

            <label htmlFor="inspectionRemarks">
              📝 Remarks
            </label>

            <textarea
              id="inspectionRemarks"
              rows="4"
              value={
                remarks
              }
              placeholder="Optional. Example: One light near lift is not working."
              onChange={(event) => {
                setRemarks(
                  event.target.value
                )
                markChanged()
              }}
            />

          </div>

          {checklistComplete && (
            <div
              className={`overall-status-card ${
                hasIssue
                  ? 'status-attention'
                  : 'status-satisfactory'
              }`}
            >

              <span>
                {hasIssue
                  ? '⚠️'
                  : '✅'}
              </span>

              <div>

                <small>
                  Overall Status
                </small>

                <strong>
                  {hasIssue
                    ? 'Attention Required'
                    : 'Satisfactory'}
                </strong>

              </div>

            </div>
          )}

          {error && (
            <div className="inspection-error-box">
              {error}
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
              ? '✅ Inspection Saved'
              : '💾 Save Inspection'}
          </button>

        </div>

        <button
          type="button"
          className="scan-next-tower-button"
          onClick={
            returnToList
          }
        >
          ← Back to All Towers
        </button>

      </main>

    </div>
  )
}

export default TowerInspection