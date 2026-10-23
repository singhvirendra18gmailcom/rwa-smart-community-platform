import { useEffect, useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from './supabase'

const EMPTY = { company_name: '', contact_number: '', start_date: '', end_date: '', enabled: false }

export default function SponsorManagement({ onBack }) {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    supabase.from('chatbot_sponsors').select('company_name,contact_number,start_date,end_date,enabled')
      .eq('id', 1).maybeSingle().then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) setError(loadError.message)
        else if (data) setForm(data)
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const save = async event => {
    event.preventDefault()
    setError('')
    setNotice('')
    const company = form.company_name.trim()
    const phone = form.contact_number.replace(/[\s()-]/g, '')
    if (!company || company.length > 120 || !/^\+?[0-9]{10,15}$/.test(phone)) {
      setError('Enter a company name and a valid 10–15 digit contact number.')
      return
    }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
      setError('Select valid sponsorship dates (end date cannot precede start date).')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: saveError } = await supabase.from('chatbot_sponsors').upsert({
        id: 1,
        company_name: company,
        contact_number: phone,
        start_date: form.start_date,
        end_date: form.end_date,
        enabled: form.enabled,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null
      }, { onConflict: 'id' })
      if (saveError) throw saveError
      setNotice('Sponsor settings saved. The footer is shown only on new complaint registrations during the active dates.')
    } catch (e) {
      setError(e.message || 'Unable to save sponsor settings.')
    } finally {
      setSaving(false)
    }
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const active = form.enabled && form.start_date <= today && form.end_date >= today

  return (
    <div className="app-shell">
      <main className="page-content" style={{ maxWidth: 640, margin: '0 auto' }}>
        <button className="logout-button" type="button" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <h2>Sponsor Management</h2>
        <p>Configure a discreet acknowledgement on the WhatsApp complaint registration confirmation only.</p>
        {loading ? <p>Loading sponsor settings…</p> : (
          <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
            <label>Company name
              <input required maxLength={120} value={form.company_name} onChange={e => set('company_name', e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} />
            </label>
            <label>Contact number
              <input required type="tel" value={form.contact_number} onChange={e => set('contact_number', e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} />
            </label>
            <label>Start date
              <input required type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} />
            </label>
            <label>End date
              <input required type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }} />
            </label>
            <label><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} /> Enable sponsor acknowledgement</label>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 14 }}>
              <strong>Footer preview</strong>
              <p style={{ whiteSpace: 'pre-line' }}>{active ? `Supported by *${form.company_name.trim()}*\nContact: ${form.contact_number.trim()}` : 'No active sponsor footer (disabled or outside sponsorship dates).'}</p>
            </div>
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="submit" disabled={saving} style={{ padding: 12 }}><Save size={16} /> {saving ? 'Saving…' : 'Save sponsor settings'}</button>
          </form>
        )}
      </main>
    </div>
  )
}
