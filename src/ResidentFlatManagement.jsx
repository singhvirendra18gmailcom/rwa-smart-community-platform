import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Eraser, Search, UserRoundCog } from 'lucide-react'
import { supabase } from './supabase'
import './ResidentFlatManagement.css'

const WORKER_URL = `${__COMPLAINT_API_BASE_URL__}/api/residents/flat`

function normalizeIndianMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const full = digits.length === 10 ? `91${digits}` : digits
  return /^91[6-9]\d{9}$/.test(full) ? full : null
}

function isValidFlat(value) {
  const flat = String(value || '').trim().toUpperCase()
  return flat.length >= 2 &&
    flat.length <= 25 &&
    /^[A-Z0-9][A-Z0-9 /-]*$/.test(flat) &&
    !['COMMON AREA', 'UNKNOWN', 'N/A', 'NA', 'NONE', 'NOT GIVEN'].includes(flat)
}

function sourceText(source) {
  if (source === 'SUPERVISOR') return 'Supervisor-managed'
  if (source === 'HISTORY') return 'Previous registered complaint'
  if (source === 'CLEARED') return 'Cleared by supervisor — resident will be asked for flat'
  return 'No previous flat found'
}

export default function ResidentFlatManagement({ onBack }) {
  const [mobile, setMobile] = useState('')
  const [found, setFound] = useState(null)
  const [flat, setFlat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function apiCall(method, path, payload) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Session expired. Please sign in again.')
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to process request.')
    return data
  }

  async function lookup(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setFound(null)
    const digits = normalizeIndianMobile(mobile)
    if (!digits) {
      setError('Enter a valid 10-digit Indian WhatsApp number.')
      return
    }
    setBusy(true)
    try {
      const data = await apiCall('GET', `${WORKER_URL}?mobile=${encodeURIComponent(digits)}`)
      setFound(data)
      setFlat(data.flat_no || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function save(action) {
    if (!found) return
    const updatedFlat = String(flat || '').trim().toUpperCase()
    if (action === 'UPDATE' && !isValidFlat(updatedFlat)) {
      setError('Enter a valid flat number, e.g. 36-D.')
      return
    }
    if (action === 'CLEAR' && !window.confirm(
      `Clear the saved flat for +${found.mobile_no}? The next WhatsApp complaint will ask for a flat number.`
    )) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await apiCall('POST', WORKER_URL, {
        mobile_no: found.mobile_no,
        action,
        ...(action === 'UPDATE' ? { flat_no: updatedFlat } : {})
      })
      setFound(data)
      setFlat(data.flat_no || '')
      setNotice(action === 'CLEAR'
        ? 'Flat cleared. The resident will be asked for a flat on the next complaint.'
        : `Flat updated to ${data.flat_no}. It will be reused on the next complaint.`)
      if (data.session_reset === false) {
        setNotice(current => current + ' Warning: existing chat session could not be reset; ask the resident to send Hi.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const mobileValid = normalizeIndianMobile(mobile)

  return (
    <div className="resident-flat-page">
      <header className="resident-flat-header">
        <button className="resident-flat-back" onClick={onBack} type="button">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="resident-flat-heading">
          <UserRoundCog size={24} />
          <div>
            <h1>Resident Flat Mapping</h1>
            <p>Supervisor-only WhatsApp flat management</p>
          </div>
        </div>
      </header>

      <main className="resident-flat-body">
        <section className="resident-flat-panel">
          <h2>Find resident</h2>
          <p>Enter the WhatsApp mobile number used for a previous complaint.</p>
          <form onSubmit={lookup}>
            <label htmlFor="resident-mobile">WhatsApp mobile number</label>
            <div className="resident-flat-search">
              <input
                id="resident-mobile"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={mobile}
                placeholder="+91 98765 43210"
                onChange={e => {
                  setMobile(e.target.value)
                  setFound(null)
                  setError('')
                  setNotice('')
                }}
                maxLength={18}
              />
              <button type="submit" disabled={busy || !mobileValid}>
                <Search size={17} /> Search
              </button>
            </div>
          </form>
        </section>

        {error && <div className="resident-flat-alert error" role="alert">{error}</div>}
        {notice && (
          <div className="resident-flat-alert success" role="status">
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        {found && (
          <section className="resident-flat-panel result">
            <h2>Flat linked to mobile</h2>
            <div className="resident-flat-detail">
              <span>WhatsApp number</span>
              <strong>+{found.mobile_no}</strong>
            </div>
            <div className="resident-flat-detail">
              <span>Current flat</span>
              <strong>{found.flat_no || 'Not saved'}</strong>
            </div>
            <p className="resident-flat-source">{sourceText(found.source)}</p>

            {found.source === 'NONE' ? (
              <p>No registered complaint or saved flat was found for this mobile number.</p>
            ) : (
              <>
                <label htmlFor="mapped-flat">Update flat number</label>
                <input
                  id="mapped-flat"
                  className="resident-flat-input"
                  value={flat}
                  maxLength={25}
                  placeholder="e.g. 36-D"
                  onChange={e => setFlat(e.target.value.toUpperCase())}
                />
                <div className="resident-flat-actions">
                  <button
                    type="button"
                    className="resident-flat-save"
                    disabled={busy || !isValidFlat(flat)}
                    onClick={() => save('UPDATE')}
                  >
                    <CheckCircle2 size={18} /> {busy ? 'Saving...' : 'Update flat'}
                  </button>
                  <button
                    type="button"
                    className="resident-flat-clear"
                    disabled={busy}
                    onClick={() => save('CLEAR')}
                  >
                    <Eraser size={18} /> Clear saved flat
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <p className="resident-flat-footnote">
          This changes the flat used for future WhatsApp complaints only. Existing complaints remain unchanged.
          Updating or clearing also resets any unfinished chatbot session for this number. The resident should send <strong>Hi</strong> to start again.
        </p>
      </main>
    </div>
  )
}
