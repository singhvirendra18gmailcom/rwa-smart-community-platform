import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Landmark,
  Lock,
  Printer,
  RotateCcw,
  Save,
  WalletCards
} from 'lucide-react'
import {
  buildMonthlyStatement,
  closeMonth,
  deleteTransfer,
  getMonthClosing,
  reopenMonth,
  saveTransfer
} from '../api'
import {
  formatCurrency,
  formatDate,
  groupByHead,
  monthLabel,
  toISODate
} from '../utils'
import {
  exportMonthlyStatementExcel,
  exportMonthlyStatementPdf,
  printMonthlyStatement
} from '../reportUtils'
import {
  EmptyState,
  Field,
  LoadingBlock,
  Message,
  PageHeader,
  Section,
  StatCard
} from '../components/Common'

export default function MonthlyStatement({ month, setMonth }) {
  const [statement, setStatement] = useState(null)
  const [closingRecord, setClosingRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [transfer, setTransfer] = useState({
    transfer_date: toISODate(),
    transfer_type: 'CASH_TO_BANK',
    amount: '',
    reference_no: '',
    description: ''
  })
  const [savingTransfer, setSavingTransfer] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [data, closing] = await Promise.all([
        buildMonthlyStatement(month),
        getMonthClosing(month)
      ])
      setStatement(data)
      setClosingRecord(closing)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to generate monthly statement.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTransfer((old) => ({ ...old, transfer_date: `${month}-01` }))
    refresh()
  }, [month])

  const incomeGroups = useMemo(() => statement ? groupByHead(statement.income, 'income_head_name') : [], [statement])
  const expenseGroups = useMemo(() => statement ? groupByHead(statement.expenses, 'expense_head_name') : [], [statement])
  const isClosed = Boolean(closingRecord?.is_closed)

  async function addTransfer(e) {
    e.preventDefault()
    if (isClosed) return
    if (!transfer.amount || Number(transfer.amount) <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid transfer amount.' })
      return
    }
    if (!transfer.transfer_date.startsWith(month)) {
      setMessage({ type: 'error', text: `Transfer date must be within ${monthLabel(month)}.` })
      return
    }
    setSavingTransfer(true)
    try {
      await saveTransfer({ ...transfer, amount: Number(transfer.amount) })
      setMessage({ type: 'success', text: 'Cash/bank transfer recorded.' })
      setTransfer({ transfer_date: `${month}-01`, transfer_type: 'CASH_TO_BANK', amount: '', reference_no: '', description: '' })
      await refresh()
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save transfer.' })
    } finally {
      setSavingTransfer(false)
    }
  }

  async function removeTransfer(id) {
    if (isClosed || !window.confirm('Delete this cash/bank transfer?')) return
    try {
      await deleteTransfer(id)
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to delete transfer.' })
    }
  }

  async function handleCloseMonth() {
    if (!statement) return
    const warning = statement.reconciliation.unmatchedCount
      ? `There are ${statement.reconciliation.unmatchedCount} unmatched bank transaction(s). Close ${monthLabel(month)} anyway?`
      : `Close ${monthLabel(month)}? Entries will become read-only and the closing balance will be carried forward.`
    if (!window.confirm(warning)) return
    try {
      const record = await closeMonth(month, statement)
      setClosingRecord(record)
      setMessage({ type: 'success', text: `${monthLabel(month)} has been closed. Its closing balance will be used as the next month's opening balance.` })
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to close month.' })
    }
  }

  async function handleReopen() {
    if (!window.confirm(`Reopen ${monthLabel(month)} for editing?`)) return
    try {
      const record = await reopenMonth(month)
      setClosingRecord(record)
      setMessage({ type: 'success', text: `${monthLabel(month)} has been reopened.` })
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to reopen month.' })
    }
  }

  function runReport(action) {
    if (!statement) return
    try {
      action(statement)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to create report.' })
    }
  }

  return (
    <>
      <PageHeader
        title="Monthly Statement"
        subtitle="A system-generated statement from recorded income, expense and bank/cash activity"
        actions={(
          <>
            <label className="acc-month-picker"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            <button className="acc-button success" disabled={!statement} onClick={() => runReport(exportMonthlyStatementExcel)}><FileSpreadsheet size={17} /> Excel</button>
            <button className="acc-button danger-bg" disabled={!statement} onClick={() => runReport(exportMonthlyStatementPdf)}><Download size={17} /> PDF</button>
            <button className="acc-button secondary" disabled={!statement} onClick={() => runReport(printMonthlyStatement)}><Printer size={17} /> Print</button>
          </>
        )}
      />

      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}
      {isClosed ? <Message type="success">{monthLabel(month)} is closed and locked. Closing cash and bank balances are fixed for carry-forward.</Message> : null}
      {loading ? <LoadingBlock text="Generating monthly statement..." /> : null}

      {!loading && statement ? (
        <>
          <div className="acc-statement-title">
            <div>
              <strong>{statement.settings?.society_name || 'RWA Pocket-A'}</strong>
              <span>{statement.settings?.society_subtitle || 'Express View Apartment, Sector-105, Noida'}</span>
            </div>
            <div>
              <h2>Monthly Account Statement</h2>
              <span>{monthLabel(month)}</span>
            </div>
            <div className={isClosed ? 'closed' : 'open'}>
              {isClosed ? <><Lock size={17} /> Closed Month</> : <>Open Month</>}
            </div>
          </div>

          <div className="acc-stat-grid acc-stat-grid-5">
            <StatCard label="Opening Balance" value={statement.openingTotal} tone="blue" icon={WalletCards} helper={`Cash ${formatCurrency(statement.opening.cash)} · Bank ${formatCurrency(statement.opening.bank)}`} />
            <StatCard label="Total Income" value={statement.incomeSplit.total} tone="green" icon={ArrowUpCircle} helper={`Cash ${formatCurrency(statement.incomeSplit.cash)} · Bank ${formatCurrency(statement.incomeSplit.bank)}`} />
            <StatCard label="Total Expense" value={statement.expenseSplit.total} tone="red" icon={ArrowDownCircle} helper={`Cash ${formatCurrency(statement.expenseSplit.cash)} · Bank ${formatCurrency(statement.expenseSplit.bank)}`} />
            <StatCard label="Cash in Hand" value={statement.closingCash} tone="sand" icon={WalletCards} helper="Closing cash" />
            <StatCard label="Bank Balance" value={statement.closingBank} tone="purple" icon={Landmark} helper={`Total closing ${formatCurrency(statement.closingTotal)}`} />
          </div>

          <Section title="Opening Balance" subtitle={`Balance brought forward as on 01 ${monthLabel(month)}`}>
            <div className="acc-balance-3">
              <div><span>Cash in Hand</span><strong>{formatCurrency(statement.opening.cash)}</strong></div>
              <div><span>Bank Balance</span><strong>{formatCurrency(statement.opening.bank)}</strong></div>
              <div className="highlight"><span>Total Opening Balance</span><strong>{formatCurrency(statement.openingTotal)}</strong></div>
            </div>
          </Section>

          <div className="acc-two-col acc-statement-columns">
            <Section className="income-panel" title="Income Details" subtitle="Income grouped by head and split into CASH / BANK">
              {incomeGroups.length ? (
                <div className="acc-table-wrap">
                  <table className="acc-table compact">
                    <thead><tr><th>Income Head</th><th className="num">Cash</th><th className="num">Bank</th><th className="num">Total</th></tr></thead>
                    <tbody>{incomeGroups.map((row) => <tr key={row.head}><td>{row.head}</td><td className="num">{formatCurrency(row.cash)}</td><td className="num">{formatCurrency(row.bank)}</td><td className="num"><strong>{formatCurrency(row.total)}</strong></td></tr>)}</tbody>
                    <tfoot><tr><td>Total Income</td><td className="num">{formatCurrency(statement.incomeSplit.cash)}</td><td className="num">{formatCurrency(statement.incomeSplit.bank)}</td><td className="num">{formatCurrency(statement.incomeSplit.total)}</td></tr></tfoot>
                  </table>
                </div>
              ) : <EmptyState>No income entries for this month.</EmptyState>}
            </Section>

            <Section className="expense-panel" title="Expense Details" subtitle="Expenses grouped by head and split into CASH / BANK">
              {expenseGroups.length ? (
                <div className="acc-table-wrap">
                  <table className="acc-table compact">
                    <thead><tr><th>Expense Head</th><th className="num">Cash</th><th className="num">Bank</th><th className="num">Total</th></tr></thead>
                    <tbody>{expenseGroups.map((row) => <tr key={row.head}><td>{row.head}</td><td className="num">{formatCurrency(row.cash)}</td><td className="num">{formatCurrency(row.bank)}</td><td className="num"><strong>{formatCurrency(row.total)}</strong></td></tr>)}</tbody>
                    <tfoot><tr><td>Total Expense</td><td className="num">{formatCurrency(statement.expenseSplit.cash)}</td><td className="num">{formatCurrency(statement.expenseSplit.bank)}</td><td className="num">{formatCurrency(statement.expenseSplit.total)}</td></tr></tfoot>
                  </table>
                </div>
              ) : <EmptyState>No expense entries for this month.</EmptyState>}
            </Section>
          </div>

          <Section title="Cash / Bank Transfers" subtitle="These transfers move money between cash and bank; they do not change total RWA funds">
            <div className="acc-transfer-layout">
              <div>
                {statement.transfers.length ? (
                  <div className="acc-table-wrap">
                    <table className="acc-table compact">
                      <thead><tr><th>Date</th><th>Movement</th><th>Reference</th><th className="num">Amount</th><th /></tr></thead>
                      <tbody>{statement.transfers.map((x) => (
                        <tr key={x.id}>
                          <td>{formatDate(x.transfer_date)}</td>
                          <td>{x.transfer_type === 'CASH_TO_BANK' ? 'Cash deposited into Bank' : 'Cash withdrawn from Bank'}</td>
                          <td>{x.reference_no || '—'}</td>
                          <td className="num"><strong>{formatCurrency(x.amount)}</strong></td>
                          <td><button className="acc-mini-button secondary" disabled={isClosed} onClick={() => removeTransfer(x.id)}>Delete</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptyState>No cash/bank transfer recorded.</EmptyState>}
                <div className="acc-transfer-totals">
                  <span>Cash → Bank <strong>{formatCurrency(statement.cashDeposited)}</strong></span>
                  <span>Bank → Cash <strong>{formatCurrency(statement.cashWithdrawn)}</strong></span>
                </div>
              </div>
              <form className="acc-transfer-form" onSubmit={addTransfer}>
                <h3><ArrowRightLeft size={18} /> Record Transfer</h3>
                <Field label="Date" required><input type="date" disabled={isClosed} value={transfer.transfer_date} onChange={(e) => setTransfer({ ...transfer, transfer_date: e.target.value })} /></Field>
                <Field label="Movement" required><select disabled={isClosed} value={transfer.transfer_type} onChange={(e) => setTransfer({ ...transfer, transfer_type: e.target.value })}><option value="CASH_TO_BANK">Cash deposited into Bank</option><option value="BANK_TO_CASH">Cash withdrawn from Bank</option></select></Field>
                <Field label="Amount" required><input type="number" min="0.01" step="0.01" disabled={isClosed} value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} /></Field>
                <Field label="Reference"><input disabled={isClosed} value={transfer.reference_no} onChange={(e) => setTransfer({ ...transfer, reference_no: e.target.value })} placeholder="Deposit slip / bank ref" /></Field>
                <button className="acc-button primary" disabled={savingTransfer || isClosed}><Save size={16} /> Save Transfer</button>
              </form>
            </div>
          </Section>

          <div className="acc-two-col">
            <Section title="Balance Calculation" subtitle="Transfers affect Cash and Bank separately but not the total balance">
              <div className="acc-calculation-list">
                <div><span>Opening Balance</span><strong>{formatCurrency(statement.openingTotal)}</strong></div>
                <div className="plus"><span>+ Total Income</span><strong>{formatCurrency(statement.incomeSplit.total)}</strong></div>
                <div className="minus"><span>− Total Expense</span><strong>{formatCurrency(statement.expenseSplit.total)}</strong></div>
                <div className="result"><span>Closing Balance</span><strong>{formatCurrency(statement.closingTotal)}</strong></div>
              </div>
            </Section>

            <Section title="Closing Balance Breakup" subtitle={`Calculated closing position for ${monthLabel(month)}`}>
              <div className="acc-balance-3 vertical-on-small">
                <div><span>Cash in Hand</span><strong>{formatCurrency(statement.closingCash)}</strong></div>
                <div><span>Bank Balance</span><strong>{formatCurrency(statement.closingBank)}</strong></div>
                <div className="highlight"><span>Total Closing Balance</span><strong>{formatCurrency(statement.closingTotal)}</strong></div>
              </div>
            </Section>
          </div>

          <Section title="Bank Reconciliation Status" subtitle="Only BANK income and BANK expense (Cheque + UPI) are reconciled">
            <div className="acc-recon-summary statement-recon">
              <div><span>Bank Income Recorded</span><strong>{formatCurrency(statement.incomeSplit.bank)}</strong><small>Matched credits: {formatCurrency(statement.reconciliation.matchedCredits)}</small></div>
              <div><span>Bank Expense Recorded</span><strong>{formatCurrency(statement.expenseSplit.bank)}</strong><small>Matched debits: {formatCurrency(statement.reconciliation.matchedDebits)}</small></div>
              <div><span>Unmatched Bank Transactions</span><strong className={statement.reconciliation.unmatchedCount ? 'danger-text' : 'success-text'}>{statement.reconciliation.unmatchedCount}</strong><small>{statement.reconciliation.unmatchedCount ? 'Review before closing' : 'Reconciliation clear'}</small></div>
              <div><span>Accounts Position</span><strong>{formatCurrency(statement.closingTotal)}</strong><small>{statement.reconciliation.unmatchedCount ? 'Review pending items' : 'Ready for closing'}</small></div>
            </div>
          </Section>

          <div className="acc-close-panel">
            <div>
              <CheckCircle2 size={25} />
              <div><strong>{isClosed ? `${monthLabel(month)} is closed` : 'Review complete?'}</strong><span>{isClosed ? 'This month is locked for normal entry editing.' : 'Close the month after reviewing income, expenses, bank reconciliation and closing balances.'}</span></div>
            </div>
            {isClosed
              ? <button className="acc-button secondary" onClick={handleReopen}><RotateCcw size={17} /> Reopen Month</button>
              : <button className="acc-button primary" onClick={handleCloseMonth}><Lock size={17} /> Close Month</button>}
          </div>
        </>
      ) : null}
    </>
  )
}
