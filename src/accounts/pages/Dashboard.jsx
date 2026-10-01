import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  Banknote,
  Landmark,
  Scale,
  Upload,
  WalletCards
} from 'lucide-react'
import { buildMonthlyStatement } from '../api'
import { currentMonthKey, formatCurrency, monthLabel } from '../utils'
import { EmptyState, LoadingBlock, Message, PageHeader, Section, StatCard } from '../components/Common'

export default function Dashboard({ navigate, month = currentMonthKey(), setMonth }) {
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    buildMonthlyStatement(month)
      .then((data) => alive && setStatement(data))
      .catch((e) => alive && setError(e.message || 'Unable to load accounts dashboard.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [month])

  const recent = useMemo(() => {
    if (!statement) return []
    const income = statement.income.slice(0, 4).map((x) => ({
      date: x.receipt_date,
      no: x.receipt_no,
      text: x.flat_no ? `${x.income_head_name} - ${x.flat_no}` : x.income_head_name,
      amount: Number(x.amount),
      type: 'income'
    }))
    const expense = statement.expenses.slice(0, 4).map((x) => ({
      date: x.expense_date,
      no: x.voucher_no,
      text: x.paid_to || x.expense_head_name,
      amount: Number(x.amount),
      type: 'expense'
    }))
    return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  }, [statement])

  return (
    <>
      <PageHeader
        title="Accounts Dashboard"
        subtitle="Daily income, expenses, balances and reconciliation at a glance"
        actions={(
          <label className="acc-month-picker">
            <span>Month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
      />

      {error ? <Message type="error">{error}</Message> : null}
      {loading ? <LoadingBlock text="Loading accounts..." /> : null}

      {!loading && statement ? (
        <>
          <div className="acc-stat-grid acc-stat-grid-4">
            <StatCard label="Opening Balance" value={statement.openingTotal} tone="blue" icon={WalletCards} helper={`Cash ${formatCurrency(statement.opening.cash)} · Bank ${formatCurrency(statement.opening.bank)}`} />
            <StatCard label="Total Income" value={statement.incomeSplit.total} tone="green" icon={ArrowUpCircle} helper={`Cash ${formatCurrency(statement.incomeSplit.cash)} · Bank ${formatCurrency(statement.incomeSplit.bank)}`} />
            <StatCard label="Total Expense" value={statement.expenseSplit.total} tone="red" icon={ArrowDownCircle} helper={`Cash ${formatCurrency(statement.expenseSplit.cash)} · Bank ${formatCurrency(statement.expenseSplit.bank)}`} />
            <StatCard label="Closing Balance" value={statement.closingTotal} tone="purple" icon={Scale} helper={`Cash ${formatCurrency(statement.closingCash)} · Bank ${formatCurrency(statement.closingBank)}`} />
          </div>

          <div className="acc-quick-grid">
            <button className="acc-quick-card green" onClick={() => navigate('income')}>
              <ArrowUpCircle size={25} />
              <span><strong>Add Income</strong><small>Receipt entry for maintenance and other collections</small></span>
              <ArrowRight size={18} />
            </button>
            <button className="acc-quick-card red" onClick={() => navigate('expense')}>
              <ArrowDownCircle size={25} />
              <span><strong>Add Expense</strong><small>Voucher entry for daily RWA payments</small></span>
              <ArrowRight size={18} />
            </button>
            <button className="acc-quick-card blue" onClick={() => navigate('bank')}>
              <Upload size={25} />
              <span><strong>Bank Statement</strong><small>Upload and reconcile bank transactions</small></span>
              <ArrowRight size={18} />
            </button>
            <button className="acc-quick-card purple" onClick={() => navigate('statement')}>
              <Landmark size={25} />
              <span><strong>Monthly Statement</strong><small>Review cash, bank and monthly balances</small></span>
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="acc-two-col">
            <Section title={`${monthLabel(month)} position`} subtitle="Cash and bank view">
              <div className="acc-balance-visual">
                <div>
                  <Banknote size={26} />
                  <span>Cash in Hand</span>
                  <strong>{formatCurrency(statement.closingCash)}</strong>
                </div>
                <div>
                  <Landmark size={26} />
                  <span>Bank Balance</span>
                  <strong>{formatCurrency(statement.closingBank)}</strong>
                </div>
              </div>
              <div className="acc-balance-equation">
                <span>{formatCurrency(statement.openingTotal)}<small>Opening</small></span>
                <b>+</b>
                <span>{formatCurrency(statement.incomeSplit.total)}<small>Income</small></span>
                <b>−</b>
                <span>{formatCurrency(statement.expenseSplit.total)}<small>Expense</small></span>
                <b>=</b>
                <span>{formatCurrency(statement.closingTotal)}<small>Closing</small></span>
              </div>
            </Section>

            <Section title="Bank reconciliation" subtitle="Only Cheque and UPI entries are compared with the bank statement" actions={<button className="acc-link-button" onClick={() => navigate('bank')}>Open reconciliation <ArrowRight size={15} /></button>}>
              <div className="acc-recon-lines">
                <div>
                  <span>Income reconciled</span>
                  <strong>{formatCurrency(statement.reconciliation.matchedCredits)} / {formatCurrency(statement.incomeSplit.bank)}</strong>
                </div>
                <div>
                  <span>Expense reconciled</span>
                  <strong>{formatCurrency(statement.reconciliation.matchedDebits)} / {formatCurrency(statement.expenseSplit.bank)}</strong>
                </div>
                <div>
                  <span>Unmatched bank transactions</span>
                  <strong className={statement.reconciliation.unmatchedCount ? 'danger-text' : 'success-text'}>{statement.reconciliation.unmatchedCount}</strong>
                </div>
              </div>
            </Section>
          </div>

          <Section title="Recent entries" subtitle="Latest income and expense entries for the selected month" actions={<button className="acc-link-button" onClick={() => navigate('transactions')}>View all <ArrowRight size={15} /></button>}>
            {recent.length ? (
              <div className="acc-recent-list">
                {recent.map((x) => (
                  <div key={`${x.type}-${x.no}`} className="acc-recent-row">
                    <span className={`acc-recent-icon ${x.type}`}>{x.type === 'income' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}</span>
                    <div><strong>{x.text}</strong><small>{x.no} · {x.date}</small></div>
                    <b className={x.type === 'income' ? 'success-text' : 'danger-text'}>{x.type === 'income' ? '+' : '−'} {formatCurrency(x.amount)}</b>
                  </div>
                ))}
              </div>
            ) : <EmptyState>No accounts entries in {monthLabel(month)} yet.</EmptyState>}
          </Section>
        </>
      ) : null}
    </>
  )
}
