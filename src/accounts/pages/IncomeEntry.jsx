import { useEffect, useMemo, useState } from 'react'
import {
  FileUp,
  Pencil,
  Save,
  Search,
  Trash2
} from 'lucide-react'
import {
  getDayIncome,
  getFlatsWithResidents,
  getIncomeHeads,
  getMonthClosing,
  getMonthIncome,
  getSettings,
  nextReceiptNo,
  saveIncomeEntry,
  uploadAccountsDocument,
  voidIncomeEntry
} from '../api'
import {
  formatCurrency,
  formatDate,
  monthKey,
  monthLabel,
  splitByPaymentMode,
  toISODate
} from '../utils'
import {
  EmptyState,
  Field,
  LoadingBlock,
  Message,
  PageHeader,
  PaymentBadge,
  Section,
  StatCard
} from '../components/Common'

const emptyForm = (date = toISODate()) => ({
  id: null,
  receipt_date: date,
  receipt_no: '',
  income_head_id: '',
  income_head_name: '',
  flat_id: '',
  flat_no: '',
  resident_name: '',
  received_from: '',
  payment_date: date,
  maintenance_from: '',
  maintenance_to: '',
  payment_mode: 'CASH',
  cheque_no: '',
  reference_no: '',
  amount: '',
  remarks: '',
  attachment_url: ''
})

export default function IncomeEntry({ appMonth, setAppMonth }) {
  const today = toISODate()
  const [entryDate, setEntryDate] = useState(today)
  const [form, setForm] = useState(emptyForm(today))
  const [heads, setHeads] = useState([])
  const [flats, setFlats] = useState([])
  const [dayRows, setDayRows] = useState([])
  const [monthRows, setMonthRows] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [closed, setClosed] = useState(false)

  const selectedMonth = monthKey(new Date(`${entryDate}T00:00:00`))

  async function refresh(date = entryDate) {
    setLoading(true)
    try {
      const m = monthKey(new Date(`${date}T00:00:00`))
      const [h, f, day, month, cfg, closing] = await Promise.all([
        getIncomeHeads(),
        getFlatsWithResidents(),
        getDayIncome(date),
        getMonthIncome(m),
        getSettings(),
        getMonthClosing(m)
      ])
      setHeads(h)
      setFlats(f)
      setDayRows(day)
      setMonthRows(month)
      setSettings(cfg)
      setClosed(Boolean(closing?.is_closed))
      setAppMonth?.(m)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to load income data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh(entryDate) }, [entryDate])

  useEffect(() => {
    if (!form.receipt_no && settings && settings.enable_receipt_numbering !== false && !form.id) {
      nextReceiptNo(form.receipt_date, settings.receipt_prefix || 'RCP')
        .then((receipt) => setForm((old) => ({ ...old, receipt_no: receipt })))
        .catch(() => {})
    }
  }, [settings, form.receipt_date, form.id])

  const daySplit = useMemo(() => splitByPaymentMode(dayRows), [dayRows])
  const monthSplit = useMemo(() => splitByPaymentMode(monthRows), [monthRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dayRows
    return dayRows.filter((x) => [x.receipt_no, x.flat_no, x.resident_name, x.received_from, x.income_head_name]
      .some((v) => String(v || '').toLowerCase().includes(q)))
  }, [dayRows, search])

  const maintenanceSelected = form.income_head_name.toLowerCase().includes('maintenance')

  function onHeadChange(id) {
    const head = heads.find((x) => x.id === id)
    setForm((old) => ({
      ...old,
      income_head_id: id,
      income_head_name: head?.name || '',
      maintenance_from: head?.name?.toLowerCase().includes('maintenance') ? old.maintenance_from : '',
      maintenance_to: head?.name?.toLowerCase().includes('maintenance') ? old.maintenance_to : ''
    }))
  }

  function onFlatChange(id) {
    const flat = flats.find((x) => x.id === id)
    setForm((old) => ({
      ...old,
      flat_id: id,
      flat_no: flat?.flat_no || '',
      resident_name: flat?.resident_name || '',
      received_from: flat?.resident_name || old.received_from
    }))
  }

  async function resetForm(date = entryDate) {
    const fresh = emptyForm(date)
    if (settings?.enable_receipt_numbering !== false) {
      try { fresh.receipt_no = await nextReceiptNo(date, settings.receipt_prefix || 'RCP') } catch { /* noop */ }
    }
    setForm(fresh)
    setAttachment(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (closed) {
      setMessage({ type: 'error', text: `${monthLabel(selectedMonth)} is closed. Reopen the month before adding entries.` })
      return
    }
    if (!form.income_head_id || !form.receipt_no || !form.receipt_date || !form.payment_date || !form.amount) {
      setMessage({ type: 'error', text: 'Please complete all mandatory fields.' })
      return
    }
    if (form.payment_mode === 'CHEQUE' && !form.cheque_no.trim()) {
      setMessage({ type: 'error', text: 'Cheque number is required for cheque receipts.' })
      return
    }
    if (form.payment_mode === 'UPI' && !form.reference_no.trim()) {
      setMessage({ type: 'error', text: 'UPI / transaction reference is required for UPI receipts.' })
      return
    }
    if (maintenanceSelected && (!form.maintenance_from || !form.maintenance_to)) {
      setMessage({ type: 'error', text: 'Maintenance From and Maintenance To are required for maintenance receipts.' })
      return
    }

    setSaving(true)
    try {
      let attachmentUrl = form.attachment_url || null
      if (attachment) {
        const path = `income/${form.receipt_date}/${Date.now()}-${attachment.name}`
        attachmentUrl = await uploadAccountsDocument(attachment, path)
      }
      const payload = {
        ...form,
        flat_id: form.flat_id || null,
        flat_no: form.flat_no || null,
        resident_name: form.resident_name || null,
        received_from: form.received_from || form.resident_name || null,
        maintenance_from: form.maintenance_from ? `${form.maintenance_from}-01` : null,
        maintenance_to: form.maintenance_to ? `${form.maintenance_to}-01` : null,
        cheque_no: form.payment_mode === 'CHEQUE' ? form.cheque_no.trim() : null,
        reference_no: form.payment_mode === 'UPI' ? form.reference_no.trim() : (form.reference_no.trim() || null),
        amount: Number(form.amount),
        attachment_url: attachmentUrl,
        status: 'POSTED'
      }
      await saveIncomeEntry(payload)
      const savedDate = form.receipt_date
      setMessage({ type: 'success', text: form.id ? 'Income entry updated.' : 'Income entry saved successfully.' })
      setEntryDate(savedDate)
      await resetForm(savedDate)
      await refresh(savedDate)
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save income entry.' })
    } finally {
      setSaving(false)
    }
  }

  function editRow(row) {
    setForm({
      ...emptyForm(row.receipt_date),
      ...row,
      flat_id: row.flat_id || '',
      income_head_id: row.income_head_id || '',
      amount: String(row.amount || ''),
      maintenance_from: row.maintenance_from ? row.maintenance_from.slice(0, 7) : '',
      maintenance_to: row.maintenance_to ? row.maintenance_to.slice(0, 7) : '',
      cheque_no: row.cheque_no || '',
      reference_no: row.reference_no || '',
      remarks: row.remarks || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeRow(row) {
    if (!window.confirm(`Void receipt ${row.receipt_no}?`)) return
    try {
      await voidIncomeEntry(row.id)
      setMessage({ type: 'success', text: `${row.receipt_no} has been voided.` })
      await refresh(entryDate)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to void income entry.' })
    }
  }

  return (
    <>
      <PageHeader
        title="Daily Income Entry"
        subtitle="Record maintenance receipts and other RWA income"
        actions={(
          <label className="acc-date-picker">
            <span>Entry Date</span>
            <input type="date" value={entryDate} onChange={(e) => {
              setEntryDate(e.target.value)
              setForm(emptyForm(e.target.value))
            }} />
          </label>
        )}
      />

      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}
      {closed ? <Message type="warning">{monthLabel(selectedMonth)} is closed. Entries are view-only until the month is reopened.</Message> : null}

      <div className="acc-stat-grid acc-stat-grid-4">
        <StatCard label="Day Total Income" value={daySplit.total} tone="green" helper={`Cash ${formatCurrency(daySplit.cash)} · Bank ${formatCurrency(daySplit.bank)}`} />
        <StatCard label="Month Cumulative Income" value={monthSplit.total} tone="blue" helper={monthLabel(selectedMonth)} />
        <StatCard label="Month Cash Income" value={monthSplit.cash} tone="sand" helper="Payment mode: Cash" />
        <StatCard label="Month Bank Income" value={monthSplit.bank} tone="purple" helper="Cheque + UPI" />
      </div>

      <Section title={form.id ? `Edit Receipt ${form.receipt_no}` : 'Add Income Entry'} subtitle="BANK means Cheque or UPI; CASH remains separate">
        <form className="acc-form-grid" onSubmit={submit}>
          <Field label="Receipt Date" required>
            <input type="date" value={form.receipt_date} disabled={closed} onChange={(e) => { setEntryDate(e.target.value); setForm({ ...form, receipt_date: e.target.value, payment_date: e.target.value }) }} />
          </Field>
          <Field label="Receipt No." required>
            <input value={form.receipt_no} disabled={closed} onChange={(e) => setForm({ ...form, receipt_no: e.target.value })} />
          </Field>
          <Field label="Income Source / Head" required>
            <select value={form.income_head_id} disabled={closed} onChange={(e) => onHeadChange(e.target.value)}>
              <option value="">Select income head</option>
              {heads.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Flat No.">
            <select value={form.flat_id} disabled={closed} onChange={(e) => onFlatChange(e.target.value)}>
              <option value="">Not linked to a flat</option>
              {flats.map((x) => <option key={x.id} value={x.id}>{x.flat_no}{x.resident_name ? ` - ${x.resident_name}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Resident Name">
            <input value={form.resident_name} disabled={closed} placeholder="Auto-filled when flat is selected" onChange={(e) => setForm({ ...form, resident_name: e.target.value })} />
          </Field>
          <Field label="Received From">
            <input value={form.received_from} disabled={closed} placeholder="Resident / company / individual" onChange={(e) => setForm({ ...form, received_from: e.target.value })} />
          </Field>
          <Field label="Payment Date" required>
            <input type="date" value={form.payment_date} disabled={closed} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
          </Field>

          {maintenanceSelected ? (
            <>
              <Field label="Maintenance From" required>
                <input type="month" value={form.maintenance_from} disabled={closed} onChange={(e) => setForm({ ...form, maintenance_from: e.target.value })} />
              </Field>
              <Field label="Maintenance To" required>
                <input type="month" value={form.maintenance_to} disabled={closed} onChange={(e) => setForm({ ...form, maintenance_to: e.target.value })} />
              </Field>
            </>
          ) : null}

          <Field label="Mode of Payment" required>
            <select value={form.payment_mode} disabled={closed} onChange={(e) => setForm({ ...form, payment_mode: e.target.value, cheque_no: '', reference_no: '' })}>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="UPI">UPI</option>
            </select>
          </Field>
          {form.payment_mode === 'CHEQUE' ? (
            <Field label="Cheque No." required>
              <input value={form.cheque_no} disabled={closed} placeholder="Enter cheque number" onChange={(e) => setForm({ ...form, cheque_no: e.target.value })} />
            </Field>
          ) : null}
          {form.payment_mode === 'UPI' ? (
            <Field label="UPI / Transaction Reference" required>
              <input value={form.reference_no} disabled={closed} placeholder="UTR / Txn ID" onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Amount" required>
            <input type="number" min="0.01" step="0.01" value={form.amount} disabled={closed} placeholder="0.00" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Attachment" hint="Optional receipt / supporting document">
            <span className="acc-file-input"><FileUp size={17} /><input type="file" disabled={closed} accept="image/*,.pdf" onChange={(e) => setAttachment(e.target.files?.[0] || null)} /></span>
          </Field>
          <Field label="Remarks" className="span-2">
            <input value={form.remarks} disabled={closed} placeholder="Optional notes" onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
          <div className="acc-form-actions span-full">
            <button type="button" className="acc-button secondary" onClick={() => resetForm()} disabled={saving}><Trash2 size={16} /> Clear</button>
            <button type="submit" className="acc-button primary" disabled={saving || closed}><Save size={17} /> {saving ? 'Saving...' : form.id ? 'Update Income' : 'Save Income'}</button>
          </div>
        </form>
      </Section>

      <Section
        title={`Income Entries - ${formatDate(entryDate)}`}
        subtitle={`${filteredRows.length} entry/entries shown`}
        actions={(
          <div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt, flat or name" /></div>
        )}
      >
        {loading ? <LoadingBlock /> : filteredRows.length ? (
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>#</th><th>Receipt No.</th><th>Flat</th><th>Resident / Received From</th><th>Income Head</th><th>Mode</th><th>Type</th><th className="num">Amount</th><th>Action</th></tr></thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td><strong>{row.receipt_no}</strong></td>
                    <td>{row.flat_no || '—'}</td>
                    <td>{row.resident_name || row.received_from || '—'}</td>
                    <td>{row.income_head_name}</td>
                    <td>{row.payment_mode}</td>
                    <td><PaymentBadge mode={row.payment_mode} /></td>
                    <td className="num"><strong>{formatCurrency(row.amount)}</strong></td>
                    <td>
                      <div className="acc-row-actions">
                        <button title="Edit" disabled={closed || settings?.allow_editing_entries === false} onClick={() => editRow(row)}><Pencil size={15} /></button>
                        <button title="Void" className="danger" disabled={closed || settings?.allow_editing_entries === false} onClick={() => removeRow(row)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="7">Total</td><td className="num">{formatCurrency(daySplit.total)}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : <EmptyState>No income recorded for this date.</EmptyState>}
      </Section>
    </>
  )
}
