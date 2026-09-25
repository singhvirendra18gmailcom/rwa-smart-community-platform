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

function statusText(status, required = true) {
  if (!required) return 'Not Required'
  if (status === 'SENT') return 'Sent'
  if (status === 'WHATSAPP_OPENED' || status === 'COMPOSER_OPENED') {
    return 'WhatsApp Opened'
  }
  if (status === 'FAILED') return 'Failed'
  return 'Pending'
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/)
  let line = ''
  let currentY = y

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY)
      currentY += lineHeight
      line = word
    } else {
      line = test
    }
  })

  if (line) {
    ctx.fillText(line, x, currentY)
    currentY += lineHeight
  }

  return currentY
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to create report image.'))
    }, 'image/png')
  })
}

export default function SocietyInspectionSummary({ onBack }) {
  const today = useMemo(() => getIndiaDate(), [])
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSummary()
  }, [])

  const loadSummary = async () => {
    setLoading(true)
    setMessage('')

    const [
      towerResult,
      parkResult,
      towerInspectionResult,
      parkInspectionResult,
      societyResult,
      serviceComplaintResult,
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
        .select('garbage_disposed,saved_at')
        .eq('inspection_date', today)
        .maybeSingle(),
      supabase
        .from('society_service_complaints')
        .select('*')
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
      serviceComplaintResult.error ||
      agencyResult.error ||
      streetInspectionResult.error

    if (error) {
      setMessage(error.message)
      setLoading(false)
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
        setMessage(notificationResult.error.message)
        setLoading(false)
        return
      }

      streetNotifications = notificationResult.data || []
    }

    setData({
      towers: towerResult.data || [],
      parks: parkResult.data || [],
      towerInspections: towerInspectionResult.data || [],
      parkInspections: parkInspectionResult.data || [],
      society: societyResult.data || null,
      serviceComplaints: serviceComplaintResult.data || [],
      agencies: agencyResult.data || [],
      streetInspections,
      streetNotifications,
    })

    setLoading(false)
  }

  const summary = useMemo(() => {
    if (!data) return null

    const towerById = new Map(
      data.towerInspections.map((item) => [Number(item.tower_id), item])
    )
    const parkById = new Map(
      data.parkInspections.map((item) => [String(item.park_id), item])
    )

    const cameraIssues = []
    const ledIssues = []
    const sweepingIssues = []
    const moppingIssues = []
    const waterLeakageIssues = []
    const otherIssues = []

    data.towers.forEach((tower) => {
      const inspection = towerById.get(Number(tower.id))
      if (!inspection?.saved_at) return

      const camera =
        inspection.camera_working ??
        inspection.camera_led_working

      const led =
        inspection.led_screen_working ??
        inspection.camera_led_working

      if (camera === false) cameraIssues.push(tower.tower_name)
      if (led === false) ledIssues.push(tower.tower_name)
      if (inspection.sweeping_done === false) sweepingIssues.push(tower.tower_name)
      if (inspection.mopping_done === false) moppingIssues.push(tower.tower_name)
      if (inspection.water_leakage === true) waterLeakageIssues.push(tower.tower_name)
      if (inspection.other_issue === true) {
        otherIssues.push(
          `${tower.tower_name}: ${inspection.other_issue_details || 'Other issue'}`
        )
      }
    })

    data.parks.forEach((park) => {
      const inspection = parkById.get(String(park.id))
      if (!inspection?.saved_at) return

      if (inspection.sweeping_done === false) sweepingIssues.push(park.park_name)
      if (inspection.other_issue === true) {
        otherIssues.push(
          `${park.park_name}: ${inspection.other_issue_details || 'Other issue'}`
        )
      }
    })

    const cameraComplaint = data.serviceComplaints.find(
      (item) => item.service_type === 'CAMERA_AMC'
    )
    const ledComplaint = data.serviceComplaints.find(
      (item) => item.service_type === 'LED_AMC'
    )

    const agencyById = new Map(
      data.agencies.map((agency) => [Number(agency.id), agency])
    )

    const streetAgencies = data.agencies.filter(
      (agency) => agency.service_type === 'STREET_LIGHT'
    )

    const streetRows = streetAgencies.map((agency) => {
      const inspection = data.streetInspections.find(
        (item) => Number(item.agency_id) === Number(agency.id)
      )

      const notification = data.streetNotifications.find(
        (item) => Number(item.agency_id) === Number(agency.id)
      )

      if (!inspection?.saved_at) {
        return {
          agency: agency.agency_name,
          faultyCount: null,
          inspectionStatus: 'Pending',
          complaintStatus: 'Pending Inspection',
        }
      }

      return {
        agency: agency.agency_name,
        faultyCount: inspection.faulty_count || 0,
        inspectionStatus: 'Done',
        complaintStatus:
          inspection.faulty_count > 0
            ? statusText(notification?.delivery_status, true)
            : 'Not Required',
      }
    })

    const allRequiredComplaintsSent =
      (cameraIssues.length === 0 || cameraComplaint?.status === 'SENT') &&
      (ledIssues.length === 0 || ledComplaint?.status === 'SENT') &&
      streetRows.every(
        (row) =>
          row.faultyCount === 0 ||
          row.complaintStatus === 'Sent'
      )

    return {
      completedTowers: data.towerInspections.filter((item) => item.saved_at).length,
      totalTowers: data.towers.length,
      completedParks: data.parkInspections.filter((item) => item.saved_at).length,
      totalParks: data.parks.length,
      cameraIssues,
      ledIssues,
      sweepingIssues,
      moppingIssues,
      waterLeakageIssues,
      otherIssues,
      cameraComplaintStatus: statusText(
        cameraComplaint?.status,
        cameraIssues.length > 0
      ),
      ledComplaintStatus: statusText(
        ledComplaint?.status,
        ledIssues.length > 0
      ),
      garbageStatus:
        data.society?.garbage_disposed === true
          ? 'Disposed'
          : data.society?.garbage_disposed === false
          ? 'Not Disposed'
          : 'Pending',
      streetRows,
      allRequiredComplaintsSent,
    }
  }, [data])

  const shareReport = async () => {
    if (!summary) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1500

      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const margin = 70
      let y = 85

      ctx.textAlign = 'center'
      ctx.fillStyle = '#173f67'
      ctx.font = '700 34px Arial'
      ctx.fillText('RWA POCKET-A', canvas.width / 2, y)

      y += 50
      ctx.font = '700 30px Arial'
      ctx.fillText('DAILY SOCIETY INSPECTION SUMMARY', canvas.width / 2, y)

      y += 42
      ctx.font = '500 22px Arial'
      ctx.fillText(formatDate(today), canvas.width / 2, y)

      y += 55
      ctx.textAlign = 'left'
      ctx.fillStyle = '#172033'

      const lines = [
        `Towers Inspected: ${summary.completedTowers}/${summary.totalTowers}`,
        `Parks Inspected: ${summary.completedParks}/${summary.totalParks}`,
        `Camera: ${summary.cameraIssues.length ? summary.cameraIssues.join(', ') + ' not working' : 'All working'}`,
        `Camera Complaint: ${summary.cameraComplaintStatus}`,
        `LED Screen: ${summary.ledIssues.length ? summary.ledIssues.join(', ') + ' not working' : 'All working'}`,
        `LED Complaint: ${summary.ledComplaintStatus}`,
        `Garbage Disposal: ${summary.garbageStatus}`,
        `Sweeping Issues: ${summary.sweepingIssues.length ? summary.sweepingIssues.join(', ') : 'None'}`,
        `Mopping Issues: ${summary.moppingIssues.length ? summary.moppingIssues.join(', ') : 'None'}`,
        `Water Leakage: ${summary.waterLeakageIssues.length ? summary.waterLeakageIssues.join(', ') : 'None'}`,
      ]

      summary.streetRows.forEach((row) => {
        lines.push(
          row.faultyCount === null
            ? `${row.agency} Street Lights: Inspection Pending`
            : `${row.agency} Street Lights: ${row.faultyCount} faulty • Complaint: ${row.complaintStatus}`
        )
      })

      if (summary.otherIssues.length > 0) {
        lines.push(`Other Issues: ${summary.otherIssues.join(' | ')}`)
      }

      ctx.font = '600 25px Arial'
      lines.forEach((line) => {
        y = wrapText(ctx, line, margin, y, canvas.width - margin * 2, 38)
        y += 16
      })

      ctx.fillStyle = '#6a7688'
      ctx.font = '500 19px Arial'
      y += 20
      y = wrapText(
        ctx,
        'Note: The same report has also been shared with the RWA for information and further action, wherever required.',
        margin,
        y,
        canvas.width - margin * 2,
        30
      )

      y += 35
      ctx.fillStyle = '#173f67'
      ctx.font = '600 18px Arial'
      wrapText(
        ctx,
        'Report digitally generated by the RWA Pocket-A in-house App.',
        margin,
        y,
        canvas.width - margin * 2,
        28
      )

      const blob = await canvasToBlob(canvas)
      const file = new File(
        [blob],
        `rwa-pocket-a-final-inspection-${today}.png`,
        { type: 'image/png' }
      )

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: 'RWA Pocket-A Daily Society Inspection Summary',
          files: [file],
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage('Final summary image downloaded.')
    } catch (error) {
      if (error?.name === 'AbortError') return
      console.error(error)
      setMessage('Unable to generate the final summary image.')
    }
  }

  if (loading || !summary) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading final inspection summary…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Final Society Summary</h1>
          <p>{formatDate(today)} • Inspection + complaint status</p>
        </div>
      </header>

      <main className="street-light-content">
        <section className="final-summary-progress">
          <div>
            <strong>{summary.completedTowers}/{summary.totalTowers}</strong>
            <span>Towers Inspected</span>
          </div>
          <div>
            <strong>{summary.completedParks}/{summary.totalParks}</strong>
            <span>Parks Inspected</span>
          </div>
        </section>

        <section className="final-summary-card">
          <h2>Action & Complaint Status</h2>

          <div className="final-summary-row">
            <span>📷 Camera</span>
            <strong>
              {summary.cameraIssues.length
                ? summary.cameraIssues.join(', ')
                : 'All Working'}
            </strong>
            <b>{summary.cameraComplaintStatus}</b>
          </div>

          <div className="final-summary-row">
            <span>🖥️ LED Screen</span>
            <strong>
              {summary.ledIssues.length
                ? summary.ledIssues.join(', ')
                : 'All Working'}
            </strong>
            <b>{summary.ledComplaintStatus}</b>
          </div>

          {summary.streetRows.map((row) => (
            <div className="final-summary-row" key={row.agency}>
              <span>💡 {row.agency}</span>
              <strong>
                {row.faultyCount === null
                  ? 'Inspection Pending'
                  : `${row.faultyCount} faulty`}
              </strong>
              <b>{row.complaintStatus}</b>
            </div>
          ))}
        </section>

        <section className="final-summary-card">
          <h2>Inspection Status</h2>

          <div className="final-summary-line">
            <span>Garbage Disposal</span>
            <strong>{summary.garbageStatus}</strong>
          </div>
          <div className="final-summary-line">
            <span>Sweeping</span>
            <strong>
              {summary.sweepingIssues.length
                ? summary.sweepingIssues.join(', ')
                : 'All Done'}
            </strong>
          </div>
          <div className="final-summary-line">
            <span>Mopping</span>
            <strong>
              {summary.moppingIssues.length
                ? summary.moppingIssues.join(', ')
                : 'All Done'}
            </strong>
          </div>
          <div className="final-summary-line">
            <span>Water Leakage</span>
            <strong>
              {summary.waterLeakageIssues.length
                ? summary.waterLeakageIssues.join(', ')
                : 'None'}
            </strong>
          </div>
          <div className="final-summary-line">
            <span>Other Issues</span>
            <strong>
              {summary.otherIssues.length
                ? summary.otherIssues.join(' • ')
                : 'None'}
            </strong>
          </div>
        </section>

        <div className="final-summary-note">
          Note: The same report has also been shared with the RWA for information
          and further action, wherever required.
        </div>

        {!summary.allRequiredComplaintsSent && (
          <div className="inspection-workflow-warning">
            ⚠️ Final report can be shared after all required complaints are
            marked Sent.
          </div>
        )}

        <button
          type="button"
          className="share-summary-button"
          style={{ width: '100%' }}
          disabled={!summary.allRequiredComplaintsSent}
          onClick={shareReport}
        >
          🖼️ Share Final Summary Report
        </button>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
