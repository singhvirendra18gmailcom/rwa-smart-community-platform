import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

const SERVICE_OPTIONS = [
  ['STREET_LIGHT', 'Street Lights'],
  ['ENTRY_EXIT_BARRIER', 'Entry / Exit Gate Barrier'],
  ['MYGATE_APP', 'MyGate App'],
  ['CAMERA_AMC', 'CCTV / Camera AMC'],
  ['LED_AMC', 'LED Screen AMC'],
  ['SEWERAGE', 'Sewerage'],
  ['HORTICULTURE', 'Horticulture'],
  ['PARK_MAINTENANCE', 'Park Maintenance'],
  ['AUTHORITY_SWEEPING', 'Authority Sweeping'],
  ['OTHER', 'Other'],
]

function normalizeIndiaMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

function createAgencyCode(name) {
  const base = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'AGENCY'

  return `${base}_${Date.now().toString().slice(-6)}`
}

export default function ServiceAgencies({ onBack }) {
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [newAgency, setNewAgency] = useState({
    agency_name: '',
    service_type: 'OTHER',
    service_label: '',
    contact_name: '',
    mobile_no: '',
  })

  useEffect(() => {
    loadAgencies()
  }, [])

  const loadAgencies = async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_agencies')
      .select(
        'id,agency_code,agency_name,service_type,service_label,contact_name,mobile_no,whatsapp_no,sms_no,display_order,active,notes'
      )
      .order('display_order')
      .order('agency_name')

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setAgencies(data || [])
    setLoading(false)
  }

  const updateAgency = (id, field, value) => {
    setAgencies((current) =>
      current.map((agency) =>
        agency.id === id
          ? { ...agency, [field]: value }
          : agency
      )
    )
  }

  const saveAgency = async (agency) => {
    const name = agency.agency_name.trim()
    const mobile = agency.mobile_no
      ? normalizeIndiaMobile(agency.mobile_no)
      : ''

    if (!name) {
      setMessage('Agency name is required.')
      return
    }

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setMessage(`Please enter a valid 10-digit mobile number for ${name}.`)
      return
    }

    setSavingId(agency.id)
    setMessage('')

    const { error } = await supabase
      .from('society_service_agencies')
      .update({
        agency_name: name,
        service_type: agency.service_type,
        service_label: agency.service_label?.trim() || null,
        contact_name: agency.contact_name?.trim() || null,
        mobile_no: mobile || null,
        whatsapp_no: mobile || null,
        sms_no: mobile || null,
        active: agency.active !== false,
        notes: agency.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id)

    setSavingId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    if (mobile) {
      updateAgency(agency.id, 'mobile_no', mobile)
    }

    setMessage(`${name} saved successfully.`)
  }

  const addAgency = async () => {
    const name = newAgency.agency_name.trim()
    const mobile = newAgency.mobile_no
      ? normalizeIndiaMobile(newAgency.mobile_no)
      : ''

    if (!name) {
      setMessage('Please enter the agency name.')
      return
    }

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setMessage('Please enter a valid 10-digit Indian mobile number.')
      return
    }

    const serviceLabel =
      newAgency.service_label.trim() ||
      SERVICE_OPTIONS.find(([key]) => key === newAgency.service_type)?.[1] ||
      'Other'

    setSavingId('new')
    setMessage('')

    const { error } = await supabase
      .from('society_service_agencies')
      .insert({
        agency_code: createAgencyCode(name),
        agency_name: name,
        service_type: newAgency.service_type,
        service_label: serviceLabel,
        contact_name: newAgency.contact_name.trim() || null,
        mobile_no: mobile || null,
        whatsapp_no: mobile || null,
        sms_no: mobile || null,
        display_order: 100,
        active: true,
        updated_at: new Date().toISOString(),
      })

    setSavingId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setNewAgency({
      agency_name: '',
      service_type: 'OTHER',
      service_label: '',
      contact_name: '',
      mobile_no: '',
    })
    setShowAdd(false)
    setMessage(`${name} added successfully.`)
    await loadAgencies()
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading service agencies…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Service Agencies</h1>
          <p>Contacts and responsibility mapping</p>
        </div>
      </header>

      <main className="street-light-content">
        <div className="service-agency-toolbar">
          <div>
            <strong>{agencies.filter((agency) => agency.active).length} Active Agencies</strong>
            <small>
              Used to route inspection issues and complaints to the concerned stakeholder.
            </small>
          </div>

          <button
            type="button"
            className="service-agency-add-button"
            onClick={() => setShowAdd((current) => !current)}
          >
            {showAdd ? 'Cancel' : '+ Add Agency'}
          </button>
        </div>

        {showAdd && (
          <section className="service-agency-card service-agency-add-card">
            <div className="service-agency-card-title">
              <strong>New Service Agency</strong>
            </div>

            <div className="service-agency-form-grid">
              <label>
                Agency Name
                <input
                  value={newAgency.agency_name}
                  onChange={(event) =>
                    setNewAgency((current) => ({
                      ...current,
                      agency_name: event.target.value,
                    }))
                  }
                  placeholder="Agency / vendor name"
                />
              </label>

              <label>
                Service
                <select
                  value={newAgency.service_type}
                  onChange={(event) =>
                    setNewAgency((current) => ({
                      ...current,
                      service_type: event.target.value,
                    }))
                  }
                >
                  {SERVICE_OPTIONS.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                Service Label
                <input
                  value={newAgency.service_label}
                  onChange={(event) =>
                    setNewAgency((current) => ({
                      ...current,
                      service_label: event.target.value,
                    }))
                  }
                  placeholder="Optional custom label"
                />
              </label>

              <label>
                Contact Person
                <input
                  value={newAgency.contact_name}
                  onChange={(event) =>
                    setNewAgency((current) => ({
                      ...current,
                      contact_name: event.target.value,
                    }))
                  }
                  placeholder="Person name"
                />
              </label>

              <label>
                Mobile Number
                <input
                  type="tel"
                  inputMode="tel"
                  value={newAgency.mobile_no}
                  onChange={(event) =>
                    setNewAgency((current) => ({
                      ...current,
                      mobile_no: event.target.value,
                    }))
                  }
                  placeholder="10-digit mobile number"
                />
              </label>
            </div>

            <button
              type="button"
              className="society-primary-button"
              disabled={savingId === 'new'}
              onClick={addAgency}
            >
              {savingId === 'new' ? 'Adding…' : 'Add Agency'}
            </button>
          </section>
        )}

        <div className="service-agency-list">
          {agencies.map((agency) => (
            <section className="service-agency-card" key={agency.id}>
              <div className="service-agency-card-title">
                <div>
                  <span>{agency.service_label || agency.service_type}</span>
                  <h2>{agency.agency_name}</h2>
                </div>

                <label className="service-agency-active">
                  <input
                    type="checkbox"
                    checked={agency.active !== false}
                    onChange={(event) =>
                      updateAgency(agency.id, 'active', event.target.checked)
                    }
                  />
                  Active
                </label>
              </div>

              <div className="service-agency-form-grid">
                <label>
                  Agency Name
                  <input
                    value={agency.agency_name || ''}
                    onChange={(event) =>
                      updateAgency(agency.id, 'agency_name', event.target.value)
                    }
                  />
                </label>

                <label>
                  Service
                  <select
                    value={agency.service_type || 'OTHER'}
                    onChange={(event) =>
                      updateAgency(agency.id, 'service_type', event.target.value)
                    }
                  >
                    {SERVICE_OPTIONS.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Service Label
                  <input
                    value={agency.service_label || ''}
                    onChange={(event) =>
                      updateAgency(agency.id, 'service_label', event.target.value)
                    }
                  />
                </label>

                <label>
                  Contact Person
                  <input
                    value={agency.contact_name || ''}
                    onChange={(event) =>
                      updateAgency(agency.id, 'contact_name', event.target.value)
                    }
                    placeholder="Person name"
                  />
                </label>

                <label>
                  Mobile Number
                  <input
                    type="tel"
                    inputMode="tel"
                    value={agency.mobile_no || ''}
                    onChange={(event) =>
                      updateAgency(agency.id, 'mobile_no', event.target.value)
                    }
                    placeholder="10-digit mobile number"
                  />
                </label>
              </div>

              <button
                type="button"
                className="agency-contact-save"
                disabled={savingId === agency.id}
                onClick={() => saveAgency(agency)}
              >
                {savingId === agency.id ? 'Saving…' : 'Save Agency'}
              </button>
            </section>
          ))}
        </div>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
