import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

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

function getIndiaDate() {
  const parts =
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())

  const year =
    parts.find(
      (part) => part.type === 'year'
    )?.value

  const month =
    parts.find(
      (part) => part.type === 'month'
    )?.value

  const day =
    parts.find(
      (part) => part.type === 'day'
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

  const toRadians = (value) =>
    (value * Math.PI) / 180

  const dLat =
    toRadians(lat2 - lat1)

  const dLon =
    toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
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

  if (
    value.startsWith(
      'RWA-PARK:'
    )
  ) {
    return value
      .substring(
        'RWA-PARK:'.length
      )
      .trim()
  }

  try {
    const url =
      new URL(value)

    const towerToken =
      url.searchParams.get(
        'tower'
      )

    if (towerToken) {
      return towerToken.trim()
    }

    const parkToken =
      url.searchParams.get(
        'park'
      )

    if (parkToken) {
      return parkToken.trim()
    }
  } catch {
    // QR is not a URL.
  }

  return value
}

function normaliseStreetLights(
  value
) {
  if (
    Array.isArray(value) &&
    value.length === 8
  ) {
    return value.map(
      (item) => item !== false
    )
  }

  return [
    ...DEFAULT_STREET_LIGHTS,
  ]
}

function getStreetLightFailures(
  status
) {
  return normaliseStreetLights(
    status
  )
    .map(
      (
        working,
        index
      ) => ({
        working,
        index,
        label:
          STREET_LIGHT_POSITIONS[
            index
          ],
      })
    )
    .filter(
      (light) =>
        !light.working
    )
}

function inspectionHasIssue(
  type,
  inspection
) {
  if (!inspection) {
    return false
  }

  const streetFailureCount =
    getStreetLightFailures(
      inspection.street_light_status
    ).length

  if (type === 'park') {
    return (
      inspection.sweeping_done ===
        false ||
      inspection.water_leakage ===
        true ||
      inspection.garbage_disposed ===
        false ||
      streetFailureCount > 0 ||
      inspection.other_issue ===
        true
    )
  }

  const camera =
    inspection.camera_working ??
    inspection.camera_led_working

  const led =
    inspection.led_screen_working ??
    inspection.camera_led_working

  return (
    inspection.sweeping_done ===
      false ||
    camera === false ||
    led === false ||
    inspection.water_leakage ===
      true ||
    inspection.garbage_disposed ===
      false ||
    streetFailureCount > 0 ||
    inspection.other_issue ===
      true ||
    (
      inspection
        .lights_working_count !==
        null &&
      inspection
        .lights_working_count <
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

function StreetLightMap({
  locationName,
  locationType,
  status,
  readOnly = false,
  onToggle,
}) {
  const lights =
    normaliseStreetLights(
      status
    )

  const failedCount =
    lights.filter(
      (working) =>
        !working
    ).length

  return (
    <div className="street-light-section">

      <div className="street-light-heading">

        <div>
          <strong>
            💡 Nearby Street Lights
          </strong>

          <p>
            Approximate locations
          </p>
        </div>

        <span
          className={`street-light-count ${
            failedCount > 0
              ? 'street-light-count-bad'
              : 'street-light-count-good'
          }`}
        >
          {failedCount === 0
            ? '✅ No issue'
            : `⚠ ${failedCount} not working`}
        </span>

      </div>

      {!readOnly && (
        <div className="street-light-help">
          Tap the approximate position
          where a street light is not
          working.
        </div>
      )}

      <div className="street-light-map">

        {lights.map(
          (
            working,
            index
          ) => (
            <button
              key={index}
              type="button"
              disabled={readOnly}
              aria-label={
                STREET_LIGHT_POSITIONS[
                  index
                ]
              }
              className={`street-light-dot street-light-dot-${
                index + 1
              } ${
                working
                  ? 'working'
                  : 'not-working'
              }`}
              onClick={() =>
                onToggle?.(
                  index
                )
              }
            />
          )
        )}

        <div className="street-light-tower">

          <span>
            {locationType ===
            'park'
              ? '🌳'
              : '🏢'}
          </span>

          <strong>
            {locationName}
          </strong>

        </div>

      </div>

      <div className="street-light-legend">

        <span>
          <i className="legend-dot working" />
          Working
        </span>

        <span>
          <i className="legend-dot not-working" />
          Not working
        </span>

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
  const completed =
    Boolean(
      inspection?.saved_at
    )

  const issue =
    completed &&
    inspectionHasIssue(
      location.type,
      inspection
    )

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
          {location.type ===
          'park'
            ? '🌳'
            : '🏢'}
        </div>

        <div className="inspection-location-info">

          <strong>
            {location.name}
          </strong>

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
            onClick={() =>
              onScan(location)
            }
          >
            📷 Scan QR
          </button>
        )}

        {completed && (
          <>
            <button
              type="button"
              className="location-rescan-button"
              onClick={() =>
                onScan(location)
              }
            >
              📷 Scan Again
            </button>

            <button
              type="button"
              className="location-report-button"
              onClick={() =>
                onReport(location)
              }
            >
              📄 Report
            </button>

            <button
              type="button"
              className="location-share-button"
              onClick={() =>
                onShare(
                  location,
                  inspection
                )
              }
            >
              📲 Share
            </button>
          </>
        )}

      </div>

    </div>
  )
}

function TowerInspection({
  onBack,
}) {
  const today =
    useMemo(
      () =>
        getIndiaDate(),
      []
    )

  const scannerRef =
    useRef(null)

  const scanLockedRef =
    useRef(false)

  const [
    screen,
    setScreen,
  ] =
    useState('list')

  const [
    towers,
    setTowers,
  ] =
    useState([])

  const [
    parks,
    setParks,
  ] =
    useState([])

  const [
    towerInspections,
    setTowerInspections,
  ] =
    useState([])

  const [
    parkInspections,
    setParkInspections,
  ] =
    useState([])

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    selectedLocation,
    setSelectedLocation,
  ] =
    useState(null)

  const [
    scannerActive,
    setScannerActive,
  ] =
    useState(false)

  const [
    scannerStarting,
    setScannerStarting,
  ] =
    useState(false)

  const [
    gpsLoading,
    setGpsLoading,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    infoMessage,
    setInfoMessage,
  ] =
    useState('')

  const [
    gpsFailureReason,
    setGpsFailureReason,
  ] =
    useState('')

  const [
    qrScannedAt,
    setQrScannedAt,
  ] =
    useState(null)

  const [
    scanLatitude,
    setScanLatitude,
  ] =
    useState(null)

  const [
    scanLongitude,
    setScanLongitude,
  ] =
    useState(null)

  const [
    gpsAccuracy,
    setGpsAccuracy,
  ] =
    useState(null)

  const [
    distanceFromLocation,
    setDistanceFromLocation,
  ] =
    useState(null)

  const [
    sweepingDone,
    setSweepingDone,
  ] =
    useState(null)

  const [
    moppingDone,
    setMoppingDone,
  ] =
    useState(null)

  const [
    cameraWorking,
    setCameraWorking,
  ] =
    useState(null)

  const [
    ledScreenWorking,
    setLedScreenWorking,
  ] =
    useState(null)

  const [
    lightsWorkingCount,
    setLightsWorkingCount,
  ] =
    useState(null)

  const [
    waterLeakage,
    setWaterLeakage,
  ] =
    useState(null)

  const [
    garbageDisposed,
    setGarbageDisposed,
  ] =
    useState(null)

  const [
    otherIssue,
    setOtherIssue,
  ] =
    useState(false)

  const [
    otherIssueDetails,
    setOtherIssueDetails,
  ] =
    useState('')

  const [
    streetLightStatus,
    setStreetLightStatus,
  ] =
    useState([
      ...DEFAULT_STREET_LIGHTS,
    ])

  const [
    remarks,
    setRemarks,
  ] =
    useState('')

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    saved,
    setSaved,
  ] =
    useState(false)

  const [
    savedAt,
    setSavedAt,
  ] =
    useState(null)

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

    let cancelled =
      false

    async function openScanner() {
      try {
        setScannerStarting(
          true
        )

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
    screen,
  ])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  function mapTower(
    tower
  ) {
    return {
      id: tower.id,
      type: 'tower',
      name:
        tower.tower_name,
      qr_token:
        tower.qr_token,
      latitude:
        tower.latitude,
      longitude:
        tower.longitude,
      allowed_radius_m:
        tower.allowed_radius_m,
      display_order:
        tower.display_order,
    }
  }

  function mapPark(
    park
  ) {
    return {
      id: park.id,
      type: 'park',
      name:
        park.park_name,
      qr_token:
        park.qr_token,
      latitude:
        park.latitude,
      longitude:
        park.longitude,
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
      ] =
        await Promise.all([
          supabase
            .from('towers')
            .select('*')
            .eq(
              'active',
              true
            )
            .order(
              'display_order',
              {
                ascending:
                  true,
              }
            ),

          supabase
            .from('parks')
            .select('*')
            .eq(
              'active',
              true
            )
            .order(
              'display_order',
              {
                ascending:
                  true,
              }
            ),
        ])

      if (
        towerResponse.error
      ) {
        throw towerResponse.error
      }

      if (
        parkResponse.error
      ) {
        throw parkResponse.error
      }

      const towerData =
        towerResponse.data || []

      const parkData =
        parkResponse.data || []

      setTowers(
        towerData
      )

      setParks(
        parkData
      )

      const towerIds =
        towerData.map(
          (tower) =>
            tower.id
        )

      const parkIds =
        parkData.map(
          (park) =>
            park.id
        )

      if (
        towerIds.length > 0
      ) {
        const {
          data,
          error:
            inspectionError,
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

        setTowerInspections(
          data || []
        )
      } else {
        setTowerInspections(
          []
        )
      }

      if (
        parkIds.length > 0
      ) {
        const {
          data,
          error:
            parkError,
        } =
          await supabase
            .from(
              'park_daily_inspections'
            )
            .select('*')
            .eq(
              'inspection_date',
              today
            )
            .in(
              'park_id',
              parkIds
            )

        if (
          parkError
        ) {
          throw parkError
        }

        setParkInspections(
          data || []
        )
      } else {
        setParkInspections(
          []
        )
      }
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Unable to load inspection locations.'
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

  function getInspection(
    location
  ) {
    if (!location) {
      return null
    }

    if (
      location.type ===
      'park'
    ) {
      return parkInspections.find(
        (inspection) =>
          inspection
            .park_id ===
          location.id
      )
    }

    return towerInspections.find(
      (inspection) =>
        inspection
          .tower_id ===
        location.id
    )
  }

  function resetForm() {
    setSweepingDone(null)
    setMoppingDone(null)

    setCameraWorking(null)
    setLedScreenWorking(null)

    setLightsWorkingCount(
      null
    )

    setWaterLeakage(null)
    setGarbageDisposed(null)

    setOtherIssue(false)

    setOtherIssueDetails(
      ''
    )

    setStreetLightStatus([
      ...DEFAULT_STREET_LIGHTS,
    ])

    setRemarks('')

    setSaved(false)

    setSavedAt(null)

    setInfoMessage('')
  }

  function populateForm(
    location,
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

    if (
      location.type ===
      'tower'
    ) {
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
        inspection
          .lights_working_count
      )
    }

    setWaterLeakage(
      inspection.water_leakage ??
        false
    )

    setGarbageDisposed(
      inspection.garbage_disposed ??
        true
    )

    setOtherIssue(
      inspection.other_issue ??
        false
    )

    setOtherIssueDetails(
      inspection
        .other_issue_details ||
        ''
    )

    setStreetLightStatus(
      normaliseStreetLights(
        inspection
          .street_light_status
      )
    )

    setRemarks(
      inspection.remarks ||
        ''
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

  async function startLocationScan(
    location
  ) {
    await stopScanner()

    setSelectedLocation(
      location
    )

    resetForm()

    setQrScannedAt(null)
    setScanLatitude(null)
    setScanLongitude(null)
    setGpsAccuracy(null)

    setDistanceFromLocation(
      null
    )

    setGpsFailureReason(
      ''
    )

    setInfoMessage('')
    setError('')

    setScreen('scanner')

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

    const allLocations = [
      ...towers.map(
        mapTower
      ),
      ...parks.map(
        mapPark
      ),
    ]

    const scannedLocation =
      allLocations.find(
        (location) =>
          location.qr_token ===
          token
      )

    if (!scannedLocation) {
      setError(
        'This is not a valid RWA Pocket-A inspection QR code.'
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
      scannedLocation.type !==
        selectedLocation.type ||
      scannedLocation.id !==
        selectedLocation.id
    ) {
      setError(
        `Wrong QR code. You selected ${selectedLocation.name}, but scanned ${scannedLocation.name}.`
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
      new Date()
        .toISOString()

    setQrScannedAt(
      scanTime
    )

    const existingInspection =
      getInspection(
        selectedLocation
      )

    populateForm(
      selectedLocation,
      existingInspection
    )

    setScreen(
      'verification'
    )

    verifyGps(
      selectedLocation
    )
  }

  function verifyGps(
    location
  ) {
    if (!location) {
      return
    }

    setGpsLoading(true)

    setGpsFailureReason(
      ''
    )

    setError('')

    if (
      !navigator.geolocation
    ) {
      setGpsFailureReason(
        'GPS is not supported by this device/browser.'
      )

      setGpsLoading(false)

      return
    }

    if (
      location.latitude ==
        null ||
      location.longitude ==
        null
    ) {
      setGpsFailureReason(
        `GPS coordinates are not configured for ${location.name}.`
      )

      setGpsLoading(false)

      return
    }

    navigator.geolocation
      .getCurrentPosition(
        (position) => {
          const latitude =
            position.coords
              .latitude

          const longitude =
            position.coords
              .longitude

          const accuracy =
            position.coords
              .accuracy

          const distance =
            calculateDistance(
              latitude,
              longitude,
              Number(
                location.latitude
              ),
              Number(
                location.longitude
              )
            )

          setScanLatitude(
            latitude
          )

          setScanLongitude(
            longitude
          )

          setGpsAccuracy(
            accuracy
          )

          setDistanceFromLocation(
            distance
          )

          if (
            accuracy >
            MAX_GPS_ACCURACY_M
          ) {
            setGpsFailureReason(
              `GPS accuracy is currently ±${Math.round(
                accuracy
              )} m. Please move to an open area and try again.`
            )

            setGpsLoading(
              false
            )

            return
          }

          if (
            distance >
            Number(
              location
                .allowed_radius_m
            )
          ) {
            setGpsFailureReason(
              `You are approximately ${Math.round(
                distance
              )} m away from ${location.name}. Allowed distance is ${location.allowed_radius_m} m.`
            )

            setGpsLoading(
              false
            )

            return
          }

          setGpsFailureReason(
            ''
          )

          setGpsLoading(
            false
          )

          setScreen('form')
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

          setGpsLoading(
            false
          )
        },

        {
          enableHighAccuracy:
            true,
          timeout: 20000,
          maximumAge: 0,
        }
      )
  }

  function isScanStillValid() {
    if (!qrScannedAt) {
      return false
    }

    const scanTime =
      new Date(
        qrScannedAt
      ).getTime()

    const minutes =
      (
        Date.now() -
        scanTime
      ) /
      1000 /
      60

    return (
      minutes <=
      INSPECTION_VALIDITY_MINUTES
    )
  }

  const isPark =
    selectedLocation?.type ===
    'park'

  const checklistComplete =
    sweepingDone !== null &&
    moppingDone !== null &&
    waterLeakage !== null &&
    garbageDisposed !==
      null &&
    (
      isPark ||
      (
        cameraWorking !==
          null &&
        ledScreenWorking !==
          null &&
        lightsWorkingCount !==
          null
      )
    )

  const streetFailures =
    getStreetLightFailures(
      streetLightStatus
    )

  /*
    Mopping deliberately does not
    trigger Attention Required.
  */
  const hasIssue =
    sweepingDone === false ||
    waterLeakage === true ||
    garbageDisposed ===
      false ||
    streetFailures.length >
      0 ||
    otherIssue === true ||
    (
      !isPark &&
      (
        cameraWorking ===
          false ||
        ledScreenWorking ===
          false ||
        (
          lightsWorkingCount !==
            null &&
          lightsWorkingCount <
            9
        )
      )
    )

  function markChanged() {
    setSaved(false)

    setInfoMessage('')
  }

  function toggleStreetLight(
    index
  ) {
    markChanged()

    setStreetLightStatus(
      (current) =>
        current.map(
          (
            working,
            currentIndex
          ) =>
            currentIndex ===
            index
              ? !working
              : working
        )
    )
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
      !isScanStillValid()
    ) {
      setError(
        'The QR/GPS verification has expired. Please scan the QR again.'
      )

      return
    }

    if (
      !checklistComplete
    ) {
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
      } =
        await supabase.auth
          .getUser()

      if (!user) {
        throw new Error(
          'Your login session has expired.'
        )
      }

      const now =
        new Date()
          .toISOString()

      const commonData = {
        inspection_date:
          today,

        sweeping_done:
          sweepingDone,

        mopping_done:
          moppingDone,

        water_leakage:
          waterLeakage,

        garbage_disposed:
          garbageDisposed,

        street_light_status:
          streetLightStatus,

        other_issue:
          otherIssue,

        other_issue_details:
          otherIssue
            ? otherIssueDetails
                .trim()
            : null,

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

        gps_verified: true,

        saved_at: now,

        updated_at: now,
      }

      if (isPark) {
        const {
          data,
          error:
            saveError,
        } =
          await supabase
            .from(
              'park_daily_inspections'
            )
            .upsert(
              {
                ...commonData,

                park_id:
                  selectedLocation.id,

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
                inspection
                  .park_id !==
                selectedLocation.id
            ),
            data,
          ]
        )
      } else {
        const {
          data,
          error:
            saveError,
        } =
          await supabase
            .from(
              'tower_daily_inspections'
            )
            .upsert(
              {
                ...commonData,

                tower_id:
                  selectedLocation.id,

                camera_working:
                  cameraWorking,

                led_screen_working:
                  ledScreenWorking,

                lights_working_count:
                  lightsWorkingCount,

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
                inspection
                  .tower_id !==
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

    if (
      location.type ===
      'tower'
    ) {
      const camera =
        inspection.camera_working ??
        inspection.camera_led_working

      const led =
        inspection.led_screen_working ??
        inspection.camera_led_working

      if (
        camera === false
      ) {
        lines.push(
          '📷 Camera not working'
        )
      }

      if (
        led === false
      ) {
        lines.push(
          '📺 LED Screen not working'
        )
      }
    }

    if (
      inspection
        .water_leakage ===
      true
    ) {
      lines.push(
        '💧 Water leakage observed'
      )
    }

    if (
      inspection
        .garbage_disposed ===
      false
    ) {
      lines.push(
        '🗑️ Garbage collection/disposal requires attention'
      )
    }

    const streetIssues =
      getStreetLightFailures(
        inspection
          .street_light_status
      )

    if (
      streetIssues.length >
      0
    ) {
      lines.push(
        `💡 Street lights: ${streetIssues.length} not working`
      )
    }

    if (
      inspection
        .other_issue === true
    ) {
      lines.push(
        `⚠️ ${
          inspection
            .other_issue_details ||
          'Other issue reported'
        }`
      )
    }

    if (
      inspection
        .sweeping_done ===
      false
    ) {
      lines.push(
        '🧹 Sweeping not done'
      )
    }

    return lines
  }

  function buildShareMessage(
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
        inspection
          .street_light_status
      )

    const attentionBlock =
      attentionLines.length >
      0
        ? `
🚨 *ATTENTION REQUIRED*

${attentionLines
  .map(
    (line) =>
      `• ${line}`
  )
  .join('\n')}

`
        : ''

    const towerBlock =
      location.type ===
      'tower'
        ? `
📷 Camera: ${
  inspection.camera_working
    ? '✅ Working'
    : '❌ Not Working'
}

📺 LED Screen: ${
  inspection
    .led_screen_working
    ? '✅ Working'
    : '❌ Not Working'
}

💡 Tower Lights: ${
  inspection
    .lights_working_count
}/9 Working
`
        : ''

    return `${
      location.type ===
      'park'
        ? '🌳'
        : '🏢'
    } *${location.name} - DAILY INSPECTION*

📅 ${formatDate(today)}

${attentionBlock}*Inspection Summary*

🧹 Sweeping: ${
      inspection
        .sweeping_done
        ? '✅ Done'
        : '❌ Not Done'
    }

🧽 Mopping: ${
      inspection
        .mopping_done
        ? '✅ Done'
        : '➖ Not Done Today'
    }
${towerBlock}
💧 Water Leakage: ${
      inspection
        .water_leakage
        ? '❌ Leakage observed'
        : '✅ No leakage'
    }

🗑️ Garbage: ${
      inspection
        .garbage_disposed
        ? '✅ Disposed / Area Clean'
        : '❌ Requires Attention'
    }

💡 Nearby Street Lights: ${
      streetFailures.length ===
      0
        ? '✅ No issue observed'
        : `⚠️ ${streetFailures.length} not working`
    }

📍 Visit: QR + GPS Verified

*Overall Status: ${
      attentionLines.length >
      0
        ? '⚠️ ATTENTION REQUIRED'
        : '✅ SATISFACTORY'
    }*

👤 Inspected by: Supervisor
🏘️ RWA Pocket-A

_Digitally generated through the RWA-AI App._`
  }

  async function shareReport(
    location,
    inspection
  ) {
    if (!inspection) {
      setError(
        'Inspection has not been saved yet.'
      )

      return
    }

    const message =
      buildShareMessage(
        location,
        inspection
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
      }
    }

    try {
      await navigator
        .clipboard
        .writeText(
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

  function openReport(
    location
  ) {
    const inspection =
      getInspection(
        location
      )

    if (!inspection) {
      return
    }

    setSelectedLocation(
      location
    )

    populateForm(
      location,
      inspection
    )

    setQrScannedAt(
      inspection.qr_scanned_at
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

    setDistanceFromLocation(
      location.type ===
      'park'
        ? inspection
            .distance_from_park_m
        : inspection
            .distance_from_tower_m
    )

    setScreen('report')
  }

  async function returnToList() {
    await stopScanner()

    setScannerActive(
      false
    )

    setSelectedLocation(
      null
    )

    setQrScannedAt(null)

    setGpsFailureReason(
      ''
    )

    setDistanceFromLocation(
      null
    )

    setGpsAccuracy(null)

    resetForm()

    setError('')
    setInfoMessage('')

    setScreen('list')
  }

  const towerLocations =
    towers.map(
      mapTower
    )

  const parkLocations =
    parks.map(
      mapPark
    )

  const allLocations = [
    ...towerLocations,
    ...parkLocations,
  ]

  const completedCount =
    allLocations.filter(
      (location) =>
        Boolean(
          getInspection(
            location
          )?.saved_at
        )
    ).length

  const issueCount =
    allLocations.filter(
      (location) => {
        const inspection =
          getInspection(
            location
          )

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

              <span>
                ✅
              </span>

              <strong>
                {completedCount}
              </strong>

              <small>
                Done
              </small>

            </div>

            <div className="summary-card summary-pending">

              <span>
                ⏳
              </span>

              <strong>
                {pendingCount}
              </strong>

              <small>
                Pending
              </small>

            </div>

            <div className="summary-card summary-issues">

              <span>
                ⚠️
              </span>

              <strong>
                {issueCount}
              </strong>

              <small>
                Issues
              </small>

            </div>

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
                      key={`tower-${location.id}`}
                      location={
                        location
                      }
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
                      key={`park-${location.id}`}
                      location={
                        location
                      }
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
              {
                selectedLocation
                  ?.name
              }
            </h1>

            <p>
              Scan QR
            </p>

          </div>

        </header>

        <main className="inspection-content">

          <div className="selected-tower-card">

            <strong>
              {selectedLocation
                ?.type ===
              'park'
                ? '🌳'
                : '🏢'}{' '}
              {
                selectedLocation
                  ?.name
              }
            </strong>

            <p>
              Scan the QR installed
              at this location.
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
    screen ===
    'verification'
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
              {
                selectedLocation
                  ?.name
              }
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
              {
                selectedLocation
                  ?.name
              }
            </h1>

            <p>
              Daily Inspection
            </p>

          </div>

        </header>

        <main className="inspection-content">

          <div className="verification-success-card">

            <span>
              ✅
            </span>

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
            value={
              sweepingDone
            }
            onChange={(
              value
            ) => {
              markChanged()

              setSweepingDone(
                value
              )
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
            onChange={(
              value
            ) => {
              markChanged()

              setMoppingDone(
                value
              )
            }}
          />

          {!isPark && (
            <>
              <InspectionToggle
                icon="📷"
                label="Camera"
                positiveText="Working"
                negativeText="Not Working"
                value={
                  cameraWorking
                }
                onChange={(
                  value
                ) => {
                  markChanged()

                  setCameraWorking(
                    value
                  )
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
                onChange={(
                  value
                ) => {
                  markChanged()

                  setLedScreenWorking(
                    value
                  )
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
                      {lightsWorkingCount ===
                      null
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

                {lightsWorkingCount ===
                  null && (
                  <button
                    type="button"
                    className="all-lights-working-button"
                    onClick={() => {
                      markChanged()

                      setLightsWorkingCount(
                        9
                      )
                    }}
                  >
                    ✅ All 9 Working
                  </button>
                )}

              </div>
            </>
          )}

          <InspectionToggle
            icon="💧"
            label="Water Leakage"
            positiveText="No Leakage"
            negativeText="Leakage Found"
            value={
              waterLeakage ===
              null
                ? null
                : !waterLeakage
            }
            onChange={(
              noLeakage
            ) => {
              markChanged()

              setWaterLeakage(
                !noLeakage
              )
            }}
          />

          <InspectionToggle
            icon="🗑️"
            label="Garbage Collection / Disposal"
            positiveText="Disposed / Area Clean"
            negativeText="Requires Attention"
            value={
              garbageDisposed
            }
            onChange={(
              value
            ) => {
              markChanged()

              setGarbageDisposed(
                value
              )
            }}
          />

          <StreetLightMap
            locationName={
              selectedLocation
                ?.name
            }
            locationType={
              selectedLocation
                ?.type
            }
            status={
              streetLightStatus
            }
            onToggle={
              toggleStreetLight
            }
          />

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

                  setOtherIssue(
                    false
                  )

                  setOtherIssueDetails(
                    ''
                  )
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

                  setOtherIssue(
                    true
                  )
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
                onChange={(
                  event
                ) => {
                  markChanged()

                  setOtherIssueDetails(
                    event.target
                      .value
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
              onChange={(
                event
              ) => {
                markChanged()

                setRemarks(
                  event.target
                    .value
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

              <small>
                Mopping is excluded from Attention Required.
              </small>

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

          {saved && (
            <button
              type="button"
              className="share-inspection-button"
              onClick={() =>
                shareReport(
                  selectedLocation,
                  getInspection(
                    selectedLocation
                  )
                )
              }
            >
              📲 Share on WhatsApp
            </button>
          )}

          {savedAt && (
            <div className="saved-time">
              Last saved:{' '}
              {formatTime(
                savedAt
              )}
            </div>
          )}

        </main>

      </div>
    )
  }

  if (screen === 'report') {
    const inspection =
      getInspection(
        selectedLocation
      )

    const attentionLines =
      inspection
        ? buildAttentionLines(
            selectedLocation,
            inspection
          )
        : []

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
              {
                selectedLocation
                  ?.name
              }
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

          {attentionLines.length >
            0 && (
            <div className="report-attention-card">

              <h2>
                🚨 Attention Required
              </h2>

              {attentionLines.map(
                (
                  line,
                  index
                ) => (
                  <div
                    key={index}
                    className="attention-line"
                  >
                    {line}
                  </div>
                )
              )}

            </div>
          )}

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

            {!isPark && (
              <>
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
                    💡 Tower Lights
                  </span>

                  <strong>
                    {
                      lightsWorkingCount
                    }
                    /9 Working
                  </strong>

                </div>
              </>
            )}

            <div className="report-line">

              <span>
                💧 Water Leakage
              </span>

              <strong>
                {waterLeakage
                  ? '❌ Found'
                  : '✅ None'}
              </strong>

            </div>

            <div className="report-line">

              <span>
                🗑️ Garbage
              </span>

              <strong>
                {garbageDisposed
                  ? '✅ Disposed'
                  : '❌ Attention'}
              </strong>

            </div>

          </div>

          <StreetLightMap
            locationName={
              selectedLocation
                ?.name
            }
            locationType={
              selectedLocation
                ?.type
            }
            status={
              streetLightStatus
            }
            readOnly
          />

          {otherIssue && (
            <div className="report-remarks">

              <strong>
                ⚠️ Other Issue
              </strong>

              <p>
                {otherIssueDetails}
              </p>

            </div>
          )}

          {remarks.trim() && (
            <div className="report-remarks">

              <strong>
                📝 Remarks
              </strong>

              <p>
                {remarks}
              </p>

            </div>
          )}

          <div className="visit-proof-card">

            <strong>
              🔐 Visit Verification
            </strong>

            <span>
              QR: ✅ Verified
            </span>

            <span>
              GPS: ✅ Verified
            </span>

            {distanceFromLocation !==
              null && (
              <span>
                Distance:{' '}
                {Math.round(
                  distanceFromLocation
                )}{' '}
                m
              </span>
            )}

            {gpsAccuracy !==
              null && (
              <span>
                GPS Accuracy: ±
                {Math.round(
                  gpsAccuracy
                )}{' '}
                m
              </span>
            )}

            <span>
              Scan Time:{' '}
              {formatTime(
                qrScannedAt
              )}
            </span>

          </div>

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
            📲 Share Report
          </button>

        </main>

      </div>
    )
  }

  return null
}

export default TowerInspection