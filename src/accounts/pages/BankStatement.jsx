import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import {
  clearBankTransactionsForMonth,
  getBankStatements,
  getBankTransactions,
  getMonthExpenses,
  getMonthIncome,
  ignoreBankTransaction,
  matchBankTransaction,
  saveBankStatement,
  saveBankTransactions,
  unmatchBankTransaction,
  uploadAccountsDocument
} from '../api'
import {
  formatCurrency,
  formatDate,
  monthLabel,
  monthStartFromKey,
  parseBankStatementFile,
  reconcileCandidate
} from '../utils'
import {
  EmptyState,
  LoadingBlock,
  Message,
  PageHeader,
  Section,
  StatCard,
  StatusBadge
} from '../components/Common'

function candidateLabel(entry, type) {
  if (!entry) return 'No suggestion'
  if (type === 'INCOME') {
    return `${entry.receipt_no} · ${entry.flat_no || entry.received_from || entry.resident_name || entry.income_head_name} · ${formatCurrency(entry.amount)}`
  }
  return `${entry.voucher_no} · ${entry.paid_to || entry.expense_head_name} · ${formatCurrency(entry.amount)}`
}

function isBankEntryMatched(bankTransactions, entryId) {
  return bankTransactions.some((x) => x.reconciliation_status === 'MATCHED' && x.matched_entry_id === entryId)
}

export default function BankStatement({ month, setMonth }) {
  const [statements, setStatements] = useState([])
  const [bankRows, setBankRows] = useState([])
  const [income, setIncome] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [file, setFile] = useState(null)
  const [incomeSearch, setIncomeSearch] = useState('')
  const [expenseSearch, setExpenseSearch] = useState('')
  const [manualSelections, setManualSelections] = useState({})

  async function refresh() {
    setLoading(true)
    try {
      const [s, b, i, e] = await Promise.all([
        getBankStatements(month),
        getBankTransactions(month),
        getMonthIncome(month),
        getMonthExpenses(month)
      ])
      setStatements(s)
      setBankRows(b)
      setIncome(i)
      setExpenses(e)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to load bank reconciliation.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [month])

  const credits = useMemo(() => bankRows.filter((x) => Number(x.credit || 0) > 0), [bankRows])
  const debits = useMemo(() => bankRows.filter((x) => Number(x.debit || 0) > 0), [bankRows])
  const bankIncome = useMemo(() => income.filter((x) => x.payment_mode !== 'CASH'), [income])
  const bankExpenses = useMemo(() => expenses.filter((x) => x.payment_mode !== 'CASH'), [expenses])

  const creditTotal = credits.reduce((a, x) => a + Number(x.credit || 0), 0)
  const debitTotal = debits.reduce((a, x) => a + Number(x.debit || 0), 0)
  const matchedCredit = credits.filter((x) => x.reconciliation_status === 'MATCHED').reduce((a, x) => a + Number(x.credit || 0), 0)
  const matchedDebit = debits.filter((x) => x.reconciliation_status === 'MATCHED').reduce((a, x) => a + Number(x.debit || 0), 0)

  const unmatchedIncomeEntries = bankIncome.filter((x) => !isBankEntryMatched(bankRows, x.id))
  const unmatchedExpenseEntries = bankExpenses.filter((x) => !isBankEntryMatched(bankRows, x.id))

  async function handleUpload() {
    if (!file) {
      setMessage({ type: 'error', text: 'Select a bank statement file first.' })
      return
    }
    setUploading(true)
    setMessage(null)
    try {
      const parsed = await parseBankStatementFile(file, month)
      const path = `bank-statements/${month}/${Date.now()}-${file.name}`
      let filePath = null
      try {
        filePath = await uploadAccountsDocument(file, path)
      } catch (storageError) {
        // Import can still proceed even if bucket policy/setup has not been applied yet.
        filePath = null
      }

      const statement = await saveBankStatement({
        statement_month: monthStartFromKey(month),
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || file.name.split('.').pop(),
        imported_rows: parsed.rows.length,
        skipped_rows: parsed.skipped
      })

      await clearBankTransactionsForMonth(month)
      let autoMatched = 0
      if (parsed.rows.length) {
        const inserted = await saveBankTransactions(parsed.rows.map((row) => ({
          ...row,
          bank_statement_id: statement.id,
          statement_month: monthStartFromKey(month)
        })))

        // Safely auto-match only when a strong bank reference / UTR / cheque number agrees.
        const usedIncome = new Set()
        const usedExpense = new Set()
        for (const bankRow of inserted) {
          const type = Number(bankRow.credit || 0) > 0 ? 'INCOME' : 'EXPENSE'
          const source = type === 'INCOME'
            ? income.filter((entry) => !usedIncome.has(entry.id))
            : expenses.filter((entry) => !usedExpense.has(entry.id))
          const candidate = reconcileCandidate(bankRow, source, type)
          if (candidate?.method === 'REFERENCE' && candidate.score >= 100) {
            await matchBankTransaction(bankRow.id, candidate.entry.id, type, 'AUTO_REFERENCE')
            if (type === 'INCOME') usedIncome.add(candidate.entry.id)
            else usedExpense.add(candidate.entry.id)
            autoMatched += 1
          }
        }
      }
      setMessage({ type: 'success', text: `${parsed.message || 'Bank statement uploaded.'}${autoMatched ? ` ${autoMatched} transaction(s) auto-matched by reference.` : ''}` })
      setFile(null)
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to import bank statement.' })
    } finally {
      setUploading(false)
    }
  }

  function suggestionFor(row, type) {
    const entries = type === 'INCOME' ? unmatchedIncomeEntries : unmatchedExpenseEntries
    return reconcileCandidate(row, entries, type)
  }

  async function confirmMatch(row, type, entryId, method = 'MANUAL') {
    if (!entryId) return
    try {
      await matchBankTransaction(row.id, entryId, type, method)
      setMessage({ type: 'success', text: 'Transaction reconciled.' })
      setManualSelections((old) => ({ ...old, [row.id]: '' }))
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to reconcile transaction.' })
    }
  }

  async function undoMatch(row) {
    try {
      await unmatchBankTransaction(row.id)
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to remove match.' })
    }
  }

  async function ignore(row) {
    try {
      await ignoreBankTransaction(row.id)
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to ignore transaction.' })
    }
  }

  const filteredCredits = credits.filter((x) => {
    const q = incomeSearch.trim().toLowerCase()
    return !q || [x.description, x.reference_no, x.transaction_date].some((v) => String(v || '').toLowerCase().includes(q))
  })
  const filteredDebits = debits.filter((x) => {
    const q = expenseSearch.trim().toLowerCase()
    return !q || [x.description, x.reference_no, x.transaction_date].some((v) => String(v || '').toLowerCase().includes(q))
  })

  function renderRows(rows, type) {
    const entries = type === 'INCOME' ? bankIncome : bankExpenses
    return rows.map((row) => {
      const matchedEntry = row.matched_entry_id ? entries.find((x) => x.id === row.matched_entry_id) : null
      const suggestion = row.reconciliation_status === 'UNMATCHED' ? suggestionFor(row, type) : null
      const availableEntries = entries.filter((x) => x.id === row.matched_entry_id || !isBankEntryMatched(bankRows, x.id))
      return (
        <tr key={row.id}>
          <td>{formatDate(row.transaction_date)}</td>
          <td className="acc-desc-cell"><strong>{row.description || 'Bank transaction'}</strong><small>{row.reference_no || 'No reference'}</small></td>
          <td className="num"><strong>{formatCurrency(type === 'INCOME' ? row.credit : row.debit)}</strong></td>
          <td>
            {matchedEntry ? (
              <div className="acc-match-entry"><strong>{candidateLabel(matchedEntry, type)}</strong><small>Matched by {row.match_method || 'manual'}</small></div>
            ) : suggestion ? (
              <div className="acc-match-entry suggestion"><strong>{candidateLabel(suggestion.entry, type)}</strong><small>Suggested: same amount {suggestion.days === 0 ? 'and date' : `within ${suggestion.days} day(s)`}</small></div>
            ) : <span className="muted-text">No automatic suggestion</span>}
          </td>
          <td><StatusBadge status={row.reconciliation_status} /></td>
          <td>
            {row.reconciliation_status === 'MATCHED' ? (
              <button className="acc-mini-button secondary" onClick={() => undoMatch(row)}>Unmatch</button>
            ) : row.reconciliation_status === 'IGNORED' ? (
              <button className="acc-mini-button secondary" onClick={() => undoMatch(row)}>Restore</button>
            ) : (
              <div className="acc-match-actions">
                {suggestion ? <button className="acc-mini-button success" onClick={() => confirmMatch(row, type, suggestion.entry.id, suggestion.method === 'REFERENCE' ? 'AUTO_REFERENCE' : 'SUGGESTED')}>Match suggestion</button> : null}
                <select value={manualSelections[row.id] || ''} onChange={(e) => setManualSelections((old) => ({ ...old, [row.id]: e.target.value }))}>
                  <option value="">Select entry…</option>
                  {availableEntries.map((entry) => <option key={entry.id} value={entry.id}>{candidateLabel(entry, type)}</option>)}
                </select>
                <button className="acc-mini-button primary" disabled={!manualSelections[row.id]} onClick={() => confirmMatch(row, type, manualSelections[row.id])}><Link2 size={14} /> Match</button>
                <button className="acc-mini-button secondary" onClick={() => ignore(row)}>Ignore</button>
              </div>
            )}
          </td>
        </tr>
      )
    })
  }

  return (
    <>
      <PageHeader
        title="Bank Statement & Reconciliation"
        subtitle="Only transactions for the selected month are imported and compared with BANK entries"
        actions={<label className="acc-month-picker"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>}
      />
      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}

      <Section title={`Upload Bank Statement - ${monthLabel(month)}`} subtitle="Supported for automatic extraction: CSV, XLS, XLSX. PDF can be stored as supporting document.">
        <div className="acc-upload-panel">
          <div className="acc-upload-drop">
            <FileSpreadsheet size={38} />
            <strong>{file ? file.name : 'Choose bank statement'}</strong>
            <small>The importer automatically keeps only {monthLabel(month)} transactions.</small>
            <input type="file" accept=".csv,.xls,.xlsx,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="acc-upload-info">
            <div><span>Latest upload</span><strong>{statements[0]?.file_name || 'No statement uploaded'}</strong></div>
            <div><span>Transactions imported</span><strong>{bankRows.length}</strong></div>
            <button className="acc-button primary" disabled={!file || uploading} onClick={handleUpload}><Upload size={17} /> {uploading ? 'Importing...' : 'Upload & Import'}</button>
            <button className="acc-button secondary" onClick={refresh}><RefreshCw size={16} /> Refresh</button>
          </div>
        </div>
      </Section>

      {loading ? <LoadingBlock text="Loading reconciliation..." /> : (
        <>
          <div className="acc-stat-grid acc-stat-grid-4">
            <StatCard label="Bank Credits" value={creditTotal} tone="green" helper={`${credits.length} credit transaction(s)`} />
            <StatCard label="Matched Income" value={matchedCredit} tone="blue" helper={`${unmatchedIncomeEntries.length} RWA bank income entry/entries unmatched`} />
            <StatCard label="Bank Debits" value={debitTotal} tone="red" helper={`${debits.length} debit transaction(s)`} />
            <StatCard label="Matched Expense" value={matchedDebit} tone="purple" helper={`${unmatchedExpenseEntries.length} RWA bank expense entry/entries unmatched`} />
          </div>

          <Section
            className="acc-recon-income"
            title="Online Income Reconciliation (Bank Credits)"
            subtitle="Bank credits are matched only with Income entries paid by Cheque or UPI"
            actions={<div className="acc-search"><Search size={16} /><input value={incomeSearch} onChange={(e) => setIncomeSearch(e.target.value)} placeholder="Search credit..." /></div>}
          >
            {filteredCredits.length ? (
              <div className="acc-table-wrap">
                <table className="acc-table recon-table">
                  <thead><tr><th>Date</th><th>Bank Description / Ref.</th><th className="num">Bank Credit</th><th>RWA Income Entry</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{renderRows(filteredCredits, 'INCOME')}</tbody>
                </table>
              </div>
            ) : <EmptyState>No bank credits imported for {monthLabel(month)}.</EmptyState>}
          </Section>

          <Section
            className="acc-recon-expense"
            title="Online Expense Reconciliation (Bank Debits)"
            subtitle="Bank debits are matched only with Expense entries paid by Cheque or UPI"
            actions={<div className="acc-search"><Search size={16} /><input value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder="Search debit..." /></div>}
          >
            {filteredDebits.length ? (
              <div className="acc-table-wrap">
                <table className="acc-table recon-table">
                  <thead><tr><th>Date</th><th>Bank Description / Ref.</th><th className="num">Bank Debit</th><th>RWA Expense Entry</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{renderRows(filteredDebits, 'EXPENSE')}</tbody>
                </table>
              </div>
            ) : <EmptyState>No bank debits imported for {monthLabel(month)}.</EmptyState>}
          </Section>

          <div className="acc-two-col">
            <Section title="Unmatched RWA Bank Income Entries" subtitle="Recorded in the app but not linked to a bank credit">
              {unmatchedIncomeEntries.length ? <div className="acc-simple-list">{unmatchedIncomeEntries.map((x) => <div key={x.id}><span>{candidateLabel(x, 'INCOME')}</span><strong>{x.payment_mode}</strong></div>)}</div> : <div className="acc-ok-box"><CheckCircle2 size={20} /> All bank income entries are matched.</div>}
            </Section>
            <Section title="Unmatched RWA Bank Expense Entries" subtitle="Recorded in the app but not linked to a bank debit">
              {unmatchedExpenseEntries.length ? <div className="acc-simple-list">{unmatchedExpenseEntries.map((x) => <div key={x.id}><span>{candidateLabel(x, 'EXPENSE')}</span><strong>{x.payment_mode}</strong></div>)}</div> : <div className="acc-ok-box"><CheckCircle2 size={20} /> All bank expense entries are matched.</div>}
            </Section>
          </div>

          <Section title="Reconciliation Summary" subtitle="Income and expense are deliberately kept separate">
            <div className="acc-recon-summary">
              <div><span>Income matched</span><strong>{formatCurrency(matchedCredit)} / {formatCurrency(bankIncome.reduce((a, x) => a + Number(x.amount || 0), 0))}</strong></div>
              <div><span>Expense matched</span><strong>{formatCurrency(matchedDebit)} / {formatCurrency(bankExpenses.reduce((a, x) => a + Number(x.amount || 0), 0))}</strong></div>
              <div><span>Unmatched bank credits</span><strong>{credits.filter((x) => x.reconciliation_status === 'UNMATCHED').length}</strong></div>
              <div><span>Unmatched bank debits</span><strong>{debits.filter((x) => x.reconciliation_status === 'UNMATCHED').length}</strong></div>
            </div>
          </Section>
        </>
      )}
    </>
  )
}
