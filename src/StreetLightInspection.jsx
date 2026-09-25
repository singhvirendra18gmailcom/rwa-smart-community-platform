import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

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

function blankAgency(agency) {
  return {
    agency,
    inspectionId: null,
    faultyCount: 0,
    locations: [],
    remarks: '',
    saved: false,
  }
}

export default function StreetLightInspection({ config, onBack }) {
  const today = useMemo(() => getIndiaDate(), [])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingAgencyId, setSavingAgencyId] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setMessage('')

    const { data: agencies, error: agencyError } = await supabase
      .from('street_light_agencies')
      .select('id,agency_code,agency_name,display_order')
      .eq('active', true)
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

    if (inspectionIds.length > 0) {
      const { data, error } = await supabase
        .from('street_light_fault_locations')
        .select('id,inspection_id,sequence_no,location_text,status')
        .in('inspection_id', inspectionIds)
        .order('sequence_no')

      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      locations = data || []
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
      }
    })

    setRows(nextRows)
    setLoading(false)
  }

  const updateRow = (agencyId, updater) => {
    setRows((current) =>
      current.map((row) =>
        row.agency.id === agencyId
          ? { ...updater(row), saved: false }
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

    if (row.faultyCount > 0) {
      const { error: locationError } = await supabase
        .from('street_light_fault_locations')
        .insert(
          row.locations.map((location, index) => ({
            inspection_id: inspection.id,
            sequence_no: index + 1,
            location_text: location.trim(),
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
          ? { ...item, inspectionId: inspection.id, saved: true }
          : item
      )
    )

    setMessage(`${row.agency.agency_name} street-light inspection saved.`)
    setSavingAgencyId(null)
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
          Record faulty street lights separately for each maintenance agency.
        </div>

        {rows.map((row) => (
          <section className="agency-card" key={row.agency.id}>
            <div className="agency-card-heading">
              <div>
                <span>MAINTENANCE AGENCY</span>
                <h2>{row.agency.agency_name}</h2>
              </div>

              <span className={`agency-save-status ${row.saved ? 'saved' : ''}`}>
                {row.saved ? '✓ Saved' : 'Not saved'}
              </span>
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
              <button
                type="button"
                className="all-working-button"
                onClick={() => setFaultyCount(row.agency.id, 0)}
              >
                ✅ All Working
              </button>
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
