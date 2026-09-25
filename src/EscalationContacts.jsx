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
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_categories')
      .select(
        'service_type,service_label,supervisor_name,supervisor_mobile,rwa_name,rwa_mobile,display_order,active'
      )
      .eq('active', true)
      .order('display_order')
      .order('service_label')

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setCategories(data || [])
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

  const saveCategory = async (category) => {
    const supervisorMobile = normalizeMobile(category.supervisor_mobile)
    const rwaMobile = normalizeMobile(category.rwa_mobile)

    if (
      supervisorMobile &&
      (supervisorMobile.length !== 12 || !supervisorMobile.startsWith('91'))
    ) {
      setMessage(`Please enter a valid RWA Staff / Supervisor mobile for ${category.service_label}.`)
      return
    }

    if (rwaMobile && (rwaMobile.length !== 12 || !rwaMobile.startsWith('91'))) {
      setMessage(`Please enter a valid RWA Executive mobile for ${category.service_label}.`)
      return
    }

    setSavingType(category.service_type)
    setMessage('')

    const { data, error } = await supabase
      .from('society_service_categories')
      .update({
        supervisor_name: String(category.supervisor_name || '').trim() || null,
        supervisor_mobile: supervisorMobile || null,
        rwa_name: String(category.rwa_name || '').trim() || null,
        rwa_mobile: rwaMobile || null,
        updated_at: new Date().toISOString(),
      })
      .eq('service_type', category.service_type)
      .select(
        'service_type,service_label,supervisor_name,supervisor_mobile,rwa_name,rwa_mobile,display_order,active'
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
    setMessage(`${data.service_label} service contacts saved.`)
  }

  if (loading) {
    return (
      <div className="street-light-page">
        <div className="society-loading">Loading escalation contacts…</div>
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
          <p>RWA staff and executive contacts for agency callbacks</p>
        </div>
      </header>

      <main className="street-light-content">
        <div className="street-light-intro">
          Configure the RWA staff member and RWA Executive whom the concerned agency or mechanic can call back for coordination.
        </div>

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
                  RWA Staff / Supervisor Name
                  <input
                    value={category.supervisor_name || ''}
                    onChange={(event) =>
                      updateCategory(
                        category.service_type,
                        'supervisor_name',
                        event.target.value
                      )
                    }
                    placeholder="Supervisor name"
                  />
                </label>

                <label>
                  RWA Staff / Supervisor Mobile
                  <input
                    type="tel"
                    inputMode="tel"
                    value={category.supervisor_mobile || ''}
                    onChange={(event) =>
                      updateCategory(
                        category.service_type,
                        'supervisor_mobile',
                        event.target.value
                      )
                    }
                    placeholder="10-digit mobile"
                  />
                </label>

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
                    placeholder="RWA member name"
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
                  : 'Save Contacts'}
              </button>
            </section>
          ))}
        </div>

        {message && <div className="street-light-message">{message}</div>}
      </main>
    </div>
  )
}
