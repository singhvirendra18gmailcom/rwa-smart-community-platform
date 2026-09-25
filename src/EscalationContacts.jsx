import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './SocietyInspection.css'

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

export default function EscalationContacts({ onBack }) {
  const [categories, setCategories] = useState([])
  const [supervisor, setSupervisor] = useState({
    name: '',
    mobile: '',
  })
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState(null)
  const [savingSupervisor, setSavingSupervisor] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    setLoading(true)
    setMessage('')

    const [categoryResult, settingsResult] = await Promise.all([
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

    if (categoryResult.error) {
      setMessage(categoryResult.error.message)
      setLoading(false)
      return
    }

    if (settingsResult.error) {
      setMessage(settingsResult.error.message)
      setLoading(false)
      return
    }

    setCategories(categoryResult.data || [])
    setSupervisor({
      name: settingsResult.data?.supervisor_contact_name || '',
      mobile: settingsResult.data?.supervisor_contact_mobile || '',
    })
    setLoading(false)
  }

  const updateCategory = (serviceType, field, value) => {
    setCategories((current) =>
      current.map((item) =>
        item.service_type === serviceType
          ? { ...item, [field]: value }
          : item
      )
    )
  }

  const saveSupervisor = async () => {
    const mobile = normalizeMobile(supervisor.mobile)

    if (mobile && (mobile.length !== 12 || !mobile.startsWith('91'))) {
      setMessage('Please enter a valid Supervisor mobile number.')
      return
    }

    setSavingSupervisor(true)
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
      setMessage(error.message)
      return
    }

    setSupervisor({
      name: data.supervisor_contact_name || '',
      mobile: data.supervisor_contact_mobile || '',
    })
    setMessage('Common Supervisor contact saved.')
  }

  const saveCategory = async (category) => {
    const rwaMobile = normalizeMobile(category.rwa_mobile)

    if (rwaMobile && (rwaMobile.length !== 12 || !rwaMobile.startsWith('91'))) {
      setMessage(
        `Please enter a valid RWA Executive mobile for ${category.service_label}.`
      )
      return
    }

    setSavingType(category.service_type)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_categories')
      .update({
        rwa_name: String(category.rwa_name || '').trim() || null,
        rwa_mobile: rwaMobile || null,
        updated_at: new Date().toISOString(),
      })
      .eq('service_type', category.service_type)
      .select(
        'service_type,service_label,rwa_name,rwa_mobile,display_order,active'
      )
      .single()

    setSavingType(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setCategories((current) =>
      current.map((item) =>
        item.service_type === data.service_type ? data : item
      )
    )
    setMessage(`${data.service_label} RWA Executive contact saved.`)
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading service contacts…</div>
      </div>
    )
  }

  return (
    <div className="street-light-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Service Contacts</h1>
          <p>Common Supervisor and category-wise RWA Executive contacts</p>
        </div>
      </header>

      <main className="street-light-content">
        <div className="street-light-intro">
          The same RWA Supervisor is used for all services. Configure only the
          concerned RWA Executive separately for each service category.
        </div>

        <section className="service-agency-card service-agency-add-card">
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
        </section>

        <div className="service-agency-list">
          {categories.map((category) => (
            <section className="service-agency-card" key={category.service_type}>
              <div className="service-agency-card-title">
                <div>
                  <span>SERVICE CATEGORY</span>
                  <h2>{category.service_label}</h2>
                </div>
              </div>

              <div className="service-agency-form-grid">
                <label>
                  RWA Executive Name
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
                  RWA Executive Mobile
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
            </section>
          ))}
        </div>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
