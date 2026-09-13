import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { getMonthExpenses, getMonthIncome } from '../api'
import { formatCurrency, formatDate, monthLabel, paymentType } from '../utils'
import { EmptyState, LoadingBlock, Message, PageHeader, PaymentBadge, Section, StatCard } from '../components/Common'

export default function Transactions({ month, setMonth }) {
  const [income, setIncome] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('ALL')
  const [payment, setPayment] = useState('ALL')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([getMonthIncome(month), getMonthExpenses(month)])
      .then(([i, e]) => { if (alive) { setIncome(i); setExpenses(e) } })
      .catch((e) => alive && setError(e.message || 'Unable to load transactions.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [month])

  const rows = useMemo(() => {
    const i = income.map((x) => ({
      id: x.id,
      date: x.receipt_date,
      doc: x.receipt_no,
      kind: 'INCOME',
      head: x.income_head_name,
      party: x.resident_name || x.received_from || x.flat_no || '—',
      description: x.remarks || (x.flat_no ? `Flat ${x.flat_no}` : ''),
      mode: x.payment_mode,
      amount: Number(x.amount || 0)
    }))
    const e = expenses.map((x) => ({
      id: x.id,
      date: x.expense_date,
      doc: x.voucher_no,
      kind: 'EXPENSE',
      head: x.expense_head_name,
      party: x.paid_to,
      description: x.description || x.remarks || '',
      mode: x.payment_mode,
      amount: Number(x.amount || 0)
    }))
    const q = search.trim().toLowerCase()
    return [...i, ...e]
      .filter((x) => kind === 'ALL' || x.kind === kind)
      .filter((x) => payment === 'ALL' || paymentType(x.mode) === payment)
      .filter((x) => !q || [x.doc, x.head, x.party, x.description, x.mode].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.doc.localeCompare(a.doc))
  }, [income, expenses, kind, payment, search])

  const totalIncome = income.reduce((a, x) => a + Number(x.amount || 0), 0)
  const totalExpense = expenses.reduce((a, x) => a + Number(x.amount || 0), 0)
  const cashNet = income.filter((x) => x.payment_mode === 'CASH').reduce((a, x) => a + Number(x.amount), 0)
    - expenses.filter((x) => x.payment_mode === 'CASH').reduce((a, x) => a + Number(x.amount), 0)
  const bankNet = income.filter((x) => x.payment_mode !== 'CASH').reduce((a, x) => a + Number(x.amount), 0)
    - expenses.filter((x) => x.payment_mode !== 'CASH').reduce((a, x) => a + Number(x.amount), 0)

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Combined income and expense register"
        actions={<label className="acc-month-picker"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>}
      />
      {error ? <Message type="error">{error}</Message> : null}

      <div className="acc-stat-grid acc-stat-grid-4">
        <StatCard label="Total Income" value={totalIncome} tone="green" helper={monthLabel(month)} />
        <StatCard label="Total Expense" value={totalExpense} tone="red" helper={monthLabel(month)} />
        <StatCard label="Cash Net Movement" value={cashNet} tone="sand" helper="Income cash − expense cash" />
        <StatCard label="Bank Net Movement" value={bankNet} tone="blue" helper="Bank income − bank expense" />
      </div>

      <Section
        title={`${monthLabel(month)} Transaction Register`}
        actions={(
          <div className="acc-filter-row">
            <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="ALL">All Entries</option><option value="INCOME">Income</option><option value="EXPENSE">Expense</option></select>
            <select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="ALL">Cash + Bank</option><option value="CASH">Cash only</option><option value="BANK">Bank only</option></select>
            <div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></div>
          </div>
        )}
      >
        {loading ? <LoadingBlock /> : rows.length ? (
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>Date</th><th>Type</th><th>Receipt / Voucher</th><th>Head</th><th>Resident / Paid To</th><th>Description</th><th>Mode</th><th>Cash/Bank</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>{formatDate(row.date)}</td>
                    <td><span className={`acc-badge ${row.kind === 'INCOME' ? 'income' : 'expense'}`}>{row.kind}</span></td>
                    <td><strong>{row.doc}</strong></td>
                    <td>{row.head}</td>
                    <td>{row.party}</td>
                    <td>{row.description || '—'}</td>
                    <td>{row.mode}</td>
                    <td><PaymentBadge mode={row.mode} /></td>
                    <td className="num"><strong>{formatCurrency(row.amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState>No matching transactions.</EmptyState>}
      </Section>
    </>
  )
}
