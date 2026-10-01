import { useEffect, useMemo, useState } from 'react'
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
  if (!digits) return ''
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
  const [categories, setCategories] = useState([])
  const [supervisor, setSupervisor] = useState({ name: '', mobile: '' })

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [savingType, setSavingType] = useState(null)
  const [savingSupervisor, setSavingSupervisor] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [cardStatus, setCardStatus] = useState({})
  const [categoryStatus, setCategoryStatus] = useState({})
  const [supervisorStatus, setSupervisorStatus] = useState('')

  const [newAgency, setNewAgency] = useState({
    agency_name: '',
    service_type: 'OTHER',
    service_label: '',
    contact_name: '',
    mobile_no: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const activeAgencies = useMemo(
    () => agencies.filter((agency) => agency.active !== false),
    [agencies]
  )

  const loadData = async () => {
    setLoading(true)
    setMessage('')

    const [agencyResult, categoryResult, settingsResult] = await Promise.all([
      supabase
        .from('society_service_agencies')
        .select(
          'id,agency_code,agency_name,service_type,service_label,contact_name,mobile_no,whatsapp_no,sms_no,display_order,active,notes'
        )
        .order('display_order')
        .order('agency_name'),
      supabase
        .from('society_service_categories')
        .select(
          'service_type,service_label,rwa_name,rwa_mobile,display_order,active'
        )
        .eq('active', true)
        .order('display_order')
        .order('service_label'),
      supabase
        .from('society_inspection_settings')
        .select('supervisor_contact_name,supervisor_contact_mobile')
        .eq('id', 1)
        .maybeSingle(),
    ])

    const error =
      agencyResult.error ||
      categoryResult.error ||
      settingsResult.error

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setAgencies(agencyResult.data || [])
    setCategories(categoryResult.data || [])
    setSupervisor({
      name: settingsResult.data?.supervisor_contact_name || '',
      mobile: settingsResult.data?.supervisor_contact_mobile || '',
    })

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

  const updateCategory = (serviceType, field, value) => {
    setCategories((current) =>
      current.map((category) =>
        category.service_type === serviceType
          ? { ...category, [field]: value }
          : category
      )
    )
  }

  const saveSupervisor = async () => {
    const mobile = normalizeIndiaMobile(supervisor.mobile)

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setSupervisorStatus('Please enter a valid Supervisor mobile number.')
      return
    }

    setSavingSupervisor(true)
    setSupervisorStatus('Saving…')
    setMessage('')

    const { data, error } = await supabase
      .from('society_inspection_settings')
      .update({
        supervisor_contact_name:
          String(supervisor.name || '').trim() || null,
        supervisor_contact_mobile: mobile || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('supervisor_contact_name,supervisor_contact_mobile')
      .single()

    setSavingSupervisor(false)

    if (error) {
      setSupervisorStatus(error.message)
      return
    }

    setSupervisor({
      name: data.supervisor_contact_name || '',
      mobile: data.supervisor_contact_mobile || '',
    })
    setSupervisorStatus('✓ Supervisor saved')
  }

  const saveCategory = async (category) => {
    const mobile = normalizeIndiaMobile(category.rwa_mobile)

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setCategoryStatus((current) => ({
        ...current,
        [category.service_type]: {
          text: 'Please enter a valid RWA Executive mobile number.',
          type: 'error',
        },
      }))
      return
    }

    setSavingType(category.service_type)
    setMessage('')
    setCategoryStatus((current) => ({
      ...current,
      [category.service_type]: { text: 'Saving…', type: 'info' },
    }))

    const { data, error } = await supabase
      .from('society_service_categories')
      .update({
        rwa_name: String(category.rwa_name || '').trim() || null,
        rwa_mobile: mobile || null,
        updated_at: new Date().toISOString(),
      })
      .eq('service_type', category.service_type)
      .select(
        'service_type,service_label,rwa_name,rwa_mobile,display_order,active'
      )
      .single()

    setSavingType(null)

    if (error) {
      setCategoryStatus((current) => ({
        ...current,
        [category.service_type]: { text: error.message, type: 'error' },
      }))
      return
    }

    setCategories((current) =>
      current.map((item) =>
        item.service_type === data.service_type ? data : item
      )
    )
    setCategoryStatus((current) => ({
      ...current,
      [category.service_type]: {
        text: '✓ RWA Executive saved',
        type: 'success',
      },
    }))
  }

  const saveAgency = async (agency) => {
    const name = String(agency.agency_name || '').trim()
    const mobile = normalizeIndiaMobile(agency.mobile_no)

    const setAgencyStatus = (text, type = 'info') => {
      setCardStatus((current) => ({
        ...current,
        [agency.id]: { text, type },
      }))
    }

    if (!name) {
      setAgencyStatus('Agency name is required.', 'error')
      return
    }

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setAgencyStatus('Please enter a valid 10-digit mobile number.', 'error')
      return
    }

    setSavingId(agency.id)
    setMessage('')
    setAgencyStatus('Saving…')

    try {
      const { data, error } = await supabase
        .from('society_service_agencies')
        .update({
          agency_name: name,
          service_type: agency.service_type || 'OTHER',
          service_label: String(agency.service_label || '').trim() || null,
          contact_name: String(agency.contact_name || '').trim() || null,
          mobile_no: mobile || null,
          whatsapp_no: mobile || null,
          sms_no: mobile || null,
          active: agency.active !== false,
          notes: String(agency.notes || '').trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agency.id)
        .select(
          'id,agency_code,agency_name,service_type,service_label,contact_name,mobile_no,whatsapp_no,sms_no,display_order,active,notes'
        )
        .single()

      if (error) throw error

      setAgencies((current) =>
        current.map((item) =>
          item.id === agency.id ? data : item
        )
      )

      setAgencyStatus('✓ Agency saved', 'success')
    } catch (error) {
      console.error('Save agency failed:', error)
      setAgencyStatus(
        error?.message || 'Unable to save agency.',
        'error'
      )
    } finally {
      setSavingId(null)
    }
  }

  const addAgency = async () => {
    const name = newAgency.agency_name.trim()
    const mobile = normalizeIndiaMobile(newAgency.mobile_no)

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
    await loadData()
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading service setup…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Service Agencies & Contacts</h1>
          <p>Manage service providers and RWA contact mapping in one place</p>
        </div>
      </header>

      <main className="street-light-content">
        <section className="service-agency-card service-agency-supervisor-card">
          <div className="service-agency-card-title">
            <div>
              <span>COMMON FOR ALL SERVICES</span>
              <h2>RWA Staff / Supervisor</h2>
            </div>
          </div>

          <div className="service-agency-form-grid">
            <label>
              Supervisor Name
              <input
                value={supervisor.name}
                onChange={(event) =>
                  setSupervisor((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Supervisor name"
              />
            </label>

            <label>
              Supervisor Mobile
              <input
                type="tel"
                inputMode="tel"
                value={supervisor.mobile}
                onChange={(event) =>
                  setSupervisor((current) => ({
                    ...current,
                    mobile: event.target.value,
                  }))
                }
                placeholder="10-digit mobile"
              />
            </label>
          </div>

          <button
            type="button"
            className="agency-contact-save"
            disabled={savingSupervisor}
            onClick={saveSupervisor}
          >
            {savingSupervisor ? 'Saving…' : 'Save Supervisor'}
          </button>

          {supervisorStatus && (
            <div className="service-agency-save-status success">
              {supervisorStatus}
            </div>
          )}
        </section>

        <div className="service-agency-toolbar">
          <div>
            <strong>
              {categories.length} Service Categories • {activeAgencies.length} Active Agencies
            </strong>
            <small>
              Each category has one RWA Executive contact and can have one or more service agencies.
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

        <div className="service-category-list">
          {categories.map((category) => {
            const categoryAgencies = agencies.filter(
              (agency) => agency.service_type === category.service_type
            )

            return (
              <section
                className="service-category-group"
                key={category.service_type}
              >
                <div className="service-category-heading">
                  <div>
                    <span>SERVICE CATEGORY</span>
                    <h2>{category.service_label}</h2>
                    <small>
                      {categoryAgencies.length === 1
                        ? '1 agency configured'
                        : `${categoryAgencies.length} agencies configured`}
                    </small>
                  </div>
                </div>

                <div className="service-category-rwa-card">
                  <div className="service-category-rwa-title">
                    <strong>RWA Executive</strong>
                    <small>Concerned RWA contact for this service</small>
                  </div>

                  <div className="service-agency-form-grid">
                    <label>
                      Executive Name
                      <input
                        value={category.rwa_name || ''}
                        onChange={(event) =>
                          updateCategory(
                            category.service_type,
                            'rwa_name',
                            event.target.value
                          )
                        }
                        placeholder="RWA Executive name"
                      />
                    </label>

                    <label>
                      Executive Mobile
                      <input
                        type="tel"
                        inputMode="tel"
                        value={category.rwa_mobile || ''}
                        onChange={(event) =>
                          updateCategory(
                            category.service_type,
                            'rwa_mobile',
                            event.target.value
                          )
                        }
                        placeholder="10-digit mobile"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="agency-contact-save"
                    disabled={savingType === category.service_type}
                    onClick={() => saveCategory(category)}
                  >
                    {savingType === category.service_type
                      ? 'Saving…'
                      : 'Save RWA Executive'}
                  </button>

                  {categoryStatus[category.service_type]?.text && (
                    <div
                      className={`service-agency-save-status ${categoryStatus[category.service_type].type || 'info'}`}
                    >
                      {categoryStatus[category.service_type].text}
                    </div>
                  )}
                </div>

                <div className="service-category-agencies">
                  {categoryAgencies.length === 0 && (
                    <div className="service-category-empty">
                      No agency configured for this category yet.
                    </div>
                  )}

                  {categoryAgencies.map((agency) => (
                    <section className="service-agency-card" key={agency.id}>
                      <div className="service-agency-card-title">
                        <div>
                          <span>SERVICE AGENCY</span>
                          <h2>{agency.agency_name}</h2>
                        </div>

                        <label className="service-agency-active">
                          <input
                            type="checkbox"
                            checked={agency.active !== false}
                            onChange={(event) =>
                              updateAgency(
                                agency.id,
                                'active',
                                event.target.checked
                              )
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
                              updateAgency(
                                agency.id,
                                'agency_name',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Service
                          <select
                            value={agency.service_type || 'OTHER'}
                            onChange={(event) =>
                              updateAgency(
                                agency.id,
                                'service_type',
                                event.target.value
                              )
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
                              updateAgency(
                                agency.id,
                                'service_label',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Contact Person
                          <input
                            value={agency.contact_name || ''}
                            onChange={(event) =>
                              updateAgency(
                                agency.id,
                                'contact_name',
                                event.target.value
                              )
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
                              updateAgency(
                                agency.id,
                                'mobile_no',
                                event.target.value
                              )
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

                      {cardStatus[agency.id]?.text && (
                        <div
                          className={`service-agency-save-status ${cardStatus[agency.id].type || 'info'}`}
                        >
                          {cardStatus[agency.id].text}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
