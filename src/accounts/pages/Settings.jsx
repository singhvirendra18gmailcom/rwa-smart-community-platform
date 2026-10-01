import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { getSettings, saveSettings } from '../api'
import { monthLabel } from '../utils'
import { Field, LoadingBlock, Message, PageHeader, Section } from '../components/Common'

const defaults = {
  society_name: 'RWA Pocket-A',
  society_subtitle: 'Express View Apartment, Sector-105, Noida',
  financial_year_start_month: 4,
  receipt_prefix: 'RCP',
  voucher_prefix: 'VCH',
  enable_receipt_numbering: true,
  enable_voucher_numbering: true,
  allow_editing_entries: true,
  enable_audit_log: true,
  initial_opening_month: '',
  initial_opening_cash: 0,
  initial_opening_bank: 0
}

export default function Settings() {
  const [form, setForm] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    getSettings()
      .then((x) => setForm({ ...defaults, ...(x || {}), initial_opening_month: x?.initial_opening_month ? x.initial_opening_month.slice(0, 7) : '' }))
      .catch((e) => setMessage({ type: 'error', text: e.message || 'Unable to load settings.' }))
      .finally(() => setLoading(false))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        society_name: form.society_name.trim(),
        society_subtitle: form.society_subtitle.trim(),
        financial_year_start_month: Number(form.financial_year_start_month),
        receipt_prefix: form.receipt_prefix.trim().toUpperCase() || 'RCP',
        voucher_prefix: form.voucher_prefix.trim().toUpperCase() || 'VCH',
        enable_receipt_numbering: Boolean(form.enable_receipt_numbering),
        enable_voucher_numbering: Boolean(form.enable_voucher_numbering),
        allow_editing_entries: Boolean(form.allow_editing_entries),
        enable_audit_log: Boolean(form.enable_audit_log),
        initial_opening_month: form.initial_opening_month ? `${form.initial_opening_month}-01` : null,
        initial_opening_cash: Number(form.initial_opening_cash || 0),
        initial_opening_bank: Number(form.initial_opening_bank || 0)
      }
      const saved = await saveSettings(payload)
      setForm({ ...defaults, ...saved, initial_opening_month: saved.initial_opening_month ? saved.initial_opening_month.slice(0, 7) : '' })
      setMessage({ type: 'success', text: 'Accounts settings saved.' })
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Accounts Settings" subtitle="Configure statement identity, numbering and opening balance rules" />
      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}
      {loading ? <LoadingBlock text="Loading settings..." /> : (
        <form onSubmit={submit}>
          <div className="acc-settings-grid">
            <div>
              <Section title="Society Information" subtitle="Shown on monthly statements and exported reports">
                <div className="acc-form-grid settings-form">
                  <Field label="Society Name" required><input value={form.society_name} onChange={(e) => setForm({ ...form, society_name: e.target.value })} /></Field>
                  <Field label="Apartment / Location" required><input value={form.society_subtitle} onChange={(e) => setForm({ ...form, society_subtitle: e.target.value })} /></Field>
                </div>
              </Section>

              <Section title="Financial Year & Numbering" subtitle="Controls document numbering and financial-year defaults">
                <div className="acc-form-grid settings-form">
                  <Field label="Financial Year Start Month">
                    <select value={form.financial_year_start_month} onChange={(e) => setForm({ ...form, financial_year_start_month: e.target.value })}>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                    </select>
                  </Field>
                  <div />
                  <Field label="Receipt Prefix"><input maxLength="10" value={form.receipt_prefix} onChange={(e) => setForm({ ...form, receipt_prefix: e.target.value })} /></Field>
                  <Field label="Voucher Prefix"><input maxLength="10" value={form.voucher_prefix} onChange={(e) => setForm({ ...form, voucher_prefix: e.target.value })} /></Field>
                </div>
              </Section>

              <Section title="First Month Opening Balance" subtitle="Use this only for the first Accounts month. Later months carry forward the previous closed month automatically.">
                <div className="acc-form-grid settings-form">
                  <Field label="Opening Month"><input type="month" value={form.initial_opening_month} onChange={(e) => setForm({ ...form, initial_opening_month: e.target.value })} /></Field>
                  <div />
                  <Field label="Opening Cash in Hand"><input type="number" step="0.01" value={form.initial_opening_cash} onChange={(e) => setForm({ ...form, initial_opening_cash: e.target.value })} /></Field>
                  <Field label="Opening Bank Balance"><input type="number" step="0.01" value={form.initial_opening_bank} onChange={(e) => setForm({ ...form, initial_opening_bank: e.target.value })} /></Field>
                </div>
                {form.initial_opening_month ? <div className="acc-info-strip">The first generated statement for <strong>{monthLabel(form.initial_opening_month)}</strong> will start from these balances unless a month record already exists.</div> : null}
              </Section>
            </div>

            <div>
              <Section title="System Preferences" subtitle="Accounts behaviour">
                <div className="acc-setting-toggles">
                  <label><input type="checkbox" checked={form.enable_receipt_numbering} onChange={(e) => setForm({ ...form, enable_receipt_numbering: e.target.checked })} /><span><strong>Automatic receipt numbering</strong><small>Generate receipt numbers for income entries</small></span></label>
                  <label><input type="checkbox" checked={form.enable_voucher_numbering} onChange={(e) => setForm({ ...form, enable_voucher_numbering: e.target.checked })} /><span><strong>Automatic voucher numbering</strong><small>Generate voucher numbers for expense entries</small></span></label>
                  <label><input type="checkbox" checked={form.allow_editing_entries} onChange={(e) => setForm({ ...form, allow_editing_entries: e.target.checked })} /><span><strong>Allow editing entries</strong><small>Closed months remain locked regardless of this option</small></span></label>
                  <label><input type="checkbox" checked={form.enable_audit_log} onChange={(e) => setForm({ ...form, enable_audit_log: e.target.checked })} /><span><strong>Audit trail</strong><small>Database triggers keep a history of changes</small></span></label>
                </div>
              </Section>

              <div className="acc-settings-save">
                <Settings2 size={30} />
                <div><strong>Ready to save?</strong><span>Changes apply to future entries and generated reports.</span></div>
                <button className="acc-button primary" disabled={saving}><Save size={17} /> {saving ? 'Saving...' : 'Save Settings'}</button>
              </div>
            </div>
          </div>
        </form>
      )}
    </>
  )
}
