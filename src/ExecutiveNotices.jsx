import { useEffect, useState } from 'react'
import { Bell, ArrowLeft, LogOut, Send, RefreshCw } from 'lucide-react'
import { supabase } from './supabase'
import './ExecutiveNotices.css'
const BASE = typeof __COMPLAINT_API_BASE_URL__ !== 'undefined' ? __COMPLAINT_API_BASE_URL__ : 'https://rwa-complaint-bot.singh-virendra18.workers.dev'

export default function ExecutiveNotices({ onLogout }) {
  const [screen, setScreen] = useState('home')
  const [templates, setTemplates] = useState([])
  const [recipients, setRecipients] = useState([])
  const [history, setHistory] = useState([])
  const [templateKey, setTemplateKey] = useState('')
  const [parameters, setParameters] = useState([])
  const [mode, setMode] = useState('all')
  const [values, setValues] = useState([])
  const [preview, setPreview] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const template = templates.find(t => `${t.name}:${t.language}` === templateKey)
  async function api(action, body = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Please sign in again.')
    const response = await fetch(`${BASE}/api/notices/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to complete request.')
    return result
  }
  function edited() { setPreview(null); setConfirming(false); setRequestId(null); setSuccess('') }
  async function run(fn) {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function refreshHistory() { const data = await api('history'); setHistory(data.notices) }
  useEffect(() => { if (screen === 'history') run(refreshHistory) }, [screen])
  async function openComposer() {
    setScreen('compose')
    await run(async () => {
      const results = await Promise.allSettled([api('templates'), api('recipients')])
      if (results[0].status === 'fulfilled') setTemplates(results[0].value.templates)
      if (results[1].status === 'fulfilled') setRecipients(results[1].value.recipients)
      const failed = results.find(r => r.status === 'rejected'); if (failed) throw failed.reason
    })
  }
  function body() { return { template_name: template?.name, language: template?.language, parameters, selection: { mode, values } } }
  async function makePreview() {
    await run(async () => { const p = await api('preview', body()); setPreview(p); setRequestId(crypto.randomUUID()) })
  }
  async function send() {
    await run(async () => {
      await api('send', { ...body(), request_id: requestId, preview_text: preview.message, recipient_count: preview.recipient_count })
      setSuccess('Notice queued. Delivery continues in the background.'); setPreview(null); setConfirming(false); setRequestId(null); setScreen('history')
    })
  }
  const options = [...new Set(recipients.map(r => String(mode === 'towers' ? r.tower_no : r.flat_no)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const count = recipients.filter(r => mode === 'all' || values.includes(String(mode === 'towers' ? r.tower_no : r.flat_no))).length
  return <div className="exec-page">
    <header className="exec-header">
      {screen !== 'home' && <button onClick={() => { setScreen('home'); setConfirming(false) }} aria-label="Back to executive dashboard"><ArrowLeft size={20} /></button>}
      <div><h1>{screen === 'home' ? 'RWA Executive' : screen === 'history' ? 'Notice history' : 'Send Notice'}</h1><small>RWA Pocket-A</small></div>
      <button onClick={onLogout} aria-label="Logout"><LogOut size={20} /></button>
    </header>
    <main className="exec-main">
      {error && <p role="alert" className="exec-error">{error}</p>}
      {success && <p role="status" className="exec-success">{success}</p>}
      {screen === 'home' && <>
        <p className="exec-intro">Keep residents informed through WhatsApp.</p>
        <button className="exec-home-card" onClick={openComposer}><Bell size={30} /><span><strong>Send Notice</strong><small>Preview a notice and send it to subscribed residents.</small></span></button>
        <button className="exec-home-card" onClick={() => setScreen('history')}><Send size={28} /><span><strong>Notice history</strong><small>Check sent, delivered and failed messages.</small></span></button>
        <section className="exec-card"><h2>Resident subscriptions</h2><p>Residents can message <strong>NOTICES</strong> to +91 92209 66604 for subscription instructions.</p><p>They can send <strong>STOP NOTICES</strong> at any time. Complaint registration does not subscribe them automatically.</p></section>
      </>}
      {screen === 'compose' && <>
        <section className="exec-card"><h2>1. Choose a notice template</h2>
          <label>Approved template<select disabled={busy} value={templateKey} onChange={e => { setTemplateKey(e.target.value); const t = templates.find(t => `${t.name}:${t.language}` === e.target.value); setParameters(Array(t?.count || 0).fill('')); edited() }}><option value="">Choose a template</option>{templates.map(t => <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>{t.name} · {t.language}</option>)}</select></label>
          {!busy && !templates.length && <p>No approved notice templates are available yet.</p>}
          {template && <><p className="exec-template">{template.body}</p>{parameters.map((p, i) => <label key={i}>Field {i + 1} · {'{{' + (i + 1) + '}}'}<input maxLength={500} value={p} disabled={busy} onChange={e => { setParameters(parameters.map((v, j) => j === i ? e.target.value : v)); edited() }} required /></label>)}</>}
        </section>
        <section className="exec-card"><h2>2. Choose recipients</h2>
          <label>Send to<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setValues([]); edited() }}><option value="all">All subscribed residents</option><option value="towers">Selected towers</option><option value="flats">Selected flats</option></select></label>
          {mode !== 'all' && <div className="exec-options">{options.map(v => <label key={v}><input type="checkbox" checked={values.includes(v)} disabled={busy} onChange={() => { setValues(values.includes(v) ? values.filter(n => n !== v) : [...values, v]); edited() }} />{mode === 'towers' ? `Tower ${v}` : v}</label>)}</div>}
          <strong>{count} unique WhatsApp recipients</strong><p>Only residents who subscribed will receive this notice.</p>
        </section>
        <button className="exec-primary" disabled={busy || !template || !count || parameters.some(p => !p.trim())} onClick={makePreview}>{busy ? 'Please wait…' : 'Preview notice'}</button>
        {preview && <section className="exec-card"><h2>3. Review before sending</h2><small>From +91 92209 66604</small><div className="exec-preview">{preview.message}</div><p>{preview.recipient_count} recipients · Meta template charges may apply.</p><button className="exec-primary" disabled={busy} onClick={() => setConfirming(true)}>Send to {preview.recipient_count} residents</button></section>}
        {confirming && preview && <div className="exec-modal" role="dialog" aria-modal="true" aria-labelledby="exec-confirm-title"><section className="exec-card"><h2 id="exec-confirm-title">Send this notice?</h2>{error && <p role="alert" className="exec-error">{error}</p>}<div className="exec-preview">{preview.message}</div><p>This will send to {preview.recipient_count} subscribed residents.</p><div className="exec-actions"><button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button className="exec-primary" disabled={busy} onClick={send}>{busy ? 'Queueing…' : 'Confirm and send'}</button></div></section></div>}
      </>}
      {screen === 'history' && <><button disabled={busy} className="exec-refresh" onClick={() => run(refreshHistory)}><RefreshCw size={18} />{busy ? 'Loading…' : 'Refresh delivery status'}</button>
        {!busy && !history.length && <section className="exec-card">No notices have been sent yet.</section>}
        {history.map(n => <section key={n.id} className="exec-card"><small>{new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {n.language}</small><div className="exec-preview">{n.message_text}</div><div className="exec-counts">{Object.entries(n.counts).map(([status, count]) => <span key={status}>{count} {status.toLowerCase()}</span>)}</div>{n.counts.FAILED > 0 && <button disabled={busy} onClick={() => run(async () => { await api('retry', { notice_id: n.id }); setSuccess('Failed deliveries queued for retry (maximum three attempts).'); await refreshHistory() })}>Retry failed recipients</button>}{(n.counts.UNKNOWN || n.counts.SENDING) > 0 && <p>Uncertain or processing deliveries are not retried automatically to avoid duplicate notices.</p>}</section>)}
      </>}
    </main>
  </div>
}
