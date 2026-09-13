import { useEffect, useMemo, useState } from 'react'
import {
  FileUp,
  Pencil,
  Save,
  Search,
  Trash2
} from 'lucide-react'
import {
  getDayExpenses,
  getExpenseHeads,
  getMonthClosing,
  getMonthExpenses,
  getSettings,
  nextVoucherNo,
  saveExpenseEntry,
  uploadAccountsDocument,
  voidExpenseEntry
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
  expense_date: date,
  voucher_no: '',
  paid_to: '',
  expense_head_id: '',
  expense_head_name: '',
  description: '',
  payment_mode: 'CASH',
  cheque_no: '',
  reference_no: '',
  amount: '',
  remarks: '',
  attachment_url: ''
})

export default function ExpenseEntry({ setAppMonth }) {
  const today = toISODate()
  const [entryDate, setEntryDate] = useState(today)
  const [form, setForm] = useState(emptyForm(today))
  const [heads, setHeads] = useState([])
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
      const [h, day, month, cfg, closing] = await Promise.all([
        getExpenseHeads(),
        getDayExpenses(date),
        getMonthExpenses(m),
        getSettings(),
        getMonthClosing(m)
      ])
      setHeads(h)
      setDayRows(day)
      setMonthRows(month)
      setSettings(cfg)
      setClosed(Boolean(closing?.is_closed))
      setAppMonth?.(m)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to load expense data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh(entryDate) }, [entryDate])

  useEffect(() => {
    if (!form.voucher_no && settings && settings.enable_voucher_numbering !== false && !form.id) {
      nextVoucherNo(form.expense_date, settings.voucher_prefix || 'VCH')
        .then((voucher) => setForm((old) => ({ ...old, voucher_no: voucher })))
        .catch(() => {})
    }
  }, [settings, form.expense_date, form.id])

  const daySplit = useMemo(() => splitByPaymentMode(dayRows), [dayRows])
  const monthSplit = useMemo(() => splitByPaymentMode(monthRows), [monthRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dayRows
    return dayRows.filter((x) => [x.voucher_no, x.paid_to, x.expense_head_name, x.description]
      .some((v) => String(v || '').toLowerCase().includes(q)))
  }, [dayRows, search])

  function onHeadChange(id) {
    const head = heads.find((x) => x.id === id)
    setForm((old) => ({ ...old, expense_head_id: id, expense_head_name: head?.name || old.expense_head_name }))
  }

  async function resetForm(date = entryDate) {
    const fresh = emptyForm(date)
    if (settings?.enable_voucher_numbering !== false) {
      try { fresh.voucher_no = await nextVoucherNo(date, settings.voucher_prefix || 'VCH') } catch { /* noop */ }
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
    if (!form.expense_head_id || !form.voucher_no || !form.expense_date || !form.paid_to.trim() || !form.amount) {
      setMessage({ type: 'error', text: form.id && !form.expense_head_id
        ? `Please select a Master Data expense head for the imported head "${form.expense_head_name || 'Unmapped'}" before updating.`
        : 'Please complete all mandatory fields.' })
      return
    }
    if (form.payment_mode === 'CHEQUE' && !form.cheque_no.trim()) {
      setMessage({ type: 'error', text: 'Cheque number is required for cheque payments.' })
      return
    }
    if (form.payment_mode === 'UPI' && !form.reference_no.trim()) {
      setMessage({ type: 'error', text: 'UPI / transaction reference is required for UPI payments.' })
      return
    }

    setSaving(true)
    try {
      let attachmentUrl = form.attachment_url || null
      if (attachment) {
        const path = `expense/${form.expense_date}/${Date.now()}-${attachment.name}`
        attachmentUrl = await uploadAccountsDocument(attachment, path)
      }
      const payload = {
        ...form,
        cheque_no: form.payment_mode === 'CHEQUE' ? form.cheque_no.trim() : null,
        reference_no: form.payment_mode === 'UPI' ? form.reference_no.trim() : (form.reference_no.trim() || null),
        amount: Number(form.amount),
        attachment_url: attachmentUrl,
        status: 'POSTED'
      }
      await saveExpenseEntry(payload)
      const savedDate = form.expense_date
      setMessage({ type: 'success', text: form.id ? 'Expense entry updated.' : 'Expense entry saved successfully.' })
      setEntryDate(savedDate)
      await resetForm(savedDate)
      await refresh(savedDate)
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save expense entry.' })
    } finally {
      setSaving(false)
    }
  }

  function editRow(row) {
    setForm({
      ...emptyForm(row.expense_date),
      ...row,
      expense_head_id: row.expense_head_id || '',
      expense_head_name: row.expense_head_name || '',
      amount: String(row.amount || ''),
      cheque_no: row.cheque_no || '',
      reference_no: row.reference_no || '',
      description: row.description || '',
      remarks: row.remarks || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeRow(row) {
    if (!window.confirm(`Void voucher ${row.voucher_no}?`)) return
    try {
      await voidExpenseEntry(row.id)
      setMessage({ type: 'success', text: `${row.voucher_no} has been voided.` })
      await refresh(entryDate)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to void expense entry.' })
    }
  }

  return (
    <>
      <PageHeader
        title="Daily Expense Entry"
        subtitle="Record daily RWA payments with cash/bank classification"
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
      {form.id && !form.expense_head_id && form.expense_head_name ? (
        <Message type="warning">Imported Head: <strong>{form.expense_head_name}</strong>. Select the correct Expense Head from Master Data before updating this voucher.</Message>
      ) : null}

      <div className="acc-stat-grid acc-stat-grid-4">
        <StatCard label="Day Total Expense" value={daySplit.total} tone="red" helper={`Cash ${formatCurrency(daySplit.cash)} · Bank ${formatCurrency(daySplit.bank)}`} />
        <StatCard label="Month Cumulative Expense" value={monthSplit.total} tone="blue" helper={monthLabel(selectedMonth)} />
        <StatCard label="Month Cash Expense" value={monthSplit.cash} tone="sand" helper="Payment mode: Cash" />
        <StatCard label="Month Bank Expense" value={monthSplit.bank} tone="purple" helper="Cheque + UPI" />
      </div>

      <Section title={form.id ? `Edit Voucher ${form.voucher_no}` : 'Add Expense Entry'} subtitle="BANK means Cheque or UPI; CASH remains separate">
        <form className="acc-form-grid" onSubmit={submit}>
          <Field label="Date" required>
            <input type="date" value={form.expense_date} disabled={closed} onChange={(e) => { setEntryDate(e.target.value); setForm({ ...form, expense_date: e.target.value }) }} />
          </Field>
          <Field label="Voucher No." required>
            <input value={form.voucher_no} disabled={closed} onChange={(e) => setForm({ ...form, voucher_no: e.target.value })} />
          </Field>
          <Field label="Paid To" required>
            <input value={form.paid_to} disabled={closed} placeholder="Person / vendor / company" onChange={(e) => setForm({ ...form, paid_to: e.target.value })} />
          </Field>
          <Field label="Expense Head" required hint={form.id && !form.expense_head_id && form.expense_head_name ? `Imported as: ${form.expense_head_name}` : undefined}>
            <select value={form.expense_head_id} disabled={closed} onChange={(e) => onHeadChange(e.target.value)}>
              <option value="">{form.id && !form.expense_head_id && form.expense_head_name ? `Unmapped: ${form.expense_head_name}` : 'Select expense head'}</option>
              {heads.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Description" required className="span-2">
            <input value={form.description} disabled={closed} placeholder="What was this expense for?" onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
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
          <Field label="Attachment" hint="Optional bill / receipt">
            <span className="acc-file-input"><FileUp size={17} /><input type="file" disabled={closed} accept="image/*,.pdf" onChange={(e) => setAttachment(e.target.files?.[0] || null)} /></span>
          </Field>
          <Field label="Remarks" className="span-2">
            <input value={form.remarks} disabled={closed} placeholder="Optional notes" onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
          <div className="acc-form-actions span-full">
            <button type="button" className="acc-button secondary" onClick={() => resetForm()} disabled={saving}><Trash2 size={16} /> Clear</button>
            <button type="submit" className="acc-button primary" disabled={saving || closed}><Save size={17} /> {saving ? 'Saving...' : form.id ? 'Update Expense' : 'Save Expense'}</button>
          </div>
        </form>
      </Section>

      <Section
        title={`Expense Entries - ${formatDate(entryDate)}`}
        subtitle={`${filteredRows.length} entry/entries shown`}
        actions={(
          <div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search voucher, paid to or head" /></div>
        )}
      >
        {loading ? <LoadingBlock /> : filteredRows.length ? (
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>#</th><th>Voucher No.</th><th>Paid To</th><th>Head</th><th>Description</th><th>Mode</th><th>Type</th><th className="num">Amount</th><th>Action</th></tr></thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td><strong>{row.voucher_no}</strong></td>
                    <td>{row.paid_to}</td>
                    <td>{row.expense_head_name || '—'}{!row.expense_head_id ? <><br /><small><strong>⚠ Unmapped</strong></small></> : null}</td>
                    <td>{row.description || '—'}</td>
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
        ) : <EmptyState>No expense recorded for this date.</EmptyState>}
      </Section>
    </>
  )
}
