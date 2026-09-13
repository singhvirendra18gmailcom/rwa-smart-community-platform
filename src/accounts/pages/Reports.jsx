import { useEffect, useState } from 'react'
import {
  Banknote,
  Download,
  FileSpreadsheet,
  Landmark,
  Printer,
  ReceiptText,
  Search,
  WalletCards
} from 'lucide-react'
import { buildMonthlyStatement } from '../api'
import {
  formatCurrency,
  formatDate,
  groupByHead,
  monthLabel,
  paymentType
} from '../utils'
import {
  exportMonthlyStatementExcel,
  exportMonthlyStatementPdf,
  printMonthlyStatement
} from '../reportUtils'
import { EmptyState, LoadingBlock, Message, PageHeader, Section, StatCard } from '../components/Common'


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

const REPORTS = [
  { id: 'monthly', name: 'Monthly Statement', description: 'Opening balance, income, expenses, transfers and closing balance' },
  { id: 'income', name: 'Income Register', description: 'All receipt entries for the selected month' },
  { id: 'expense', name: 'Expense Register', description: 'All voucher entries for the selected month' },
  { id: 'cashbook', name: 'Cash Book', description: 'Cash income, cash expense and cash/bank movements' },
  { id: 'bankbook', name: 'Bank Book', description: 'Cheque/UPI income and expense plus bank transactions' },
  { id: 'maintenance', name: 'Maintenance Collection', description: 'Flat-wise maintenance collections and paid duration' },
  { id: 'receipts', name: 'Receipt Register', description: 'Receipt-number-wise income register' },
  { id: 'vouchers', name: 'Voucher Register', description: 'Voucher-number-wise expense register' },
  { id: 'income-head', name: 'Income Head Summary', description: 'Income grouped by accounting head' },
  { id: 'expense-head', name: 'Expense Head Summary', description: 'Expense grouped by accounting head' }
]

function reportRows(type, statement) {
  switch (type) {
    case 'income':
    case 'receipts':
      return {
        columns: ['Date', 'Receipt No.', 'Flat', 'Resident / Received From', 'Head', 'Mode', 'Type', 'Amount'],
        rows: statement.income.map((x) => [formatDate(x.receipt_date), x.receipt_no, x.flat_no || '', x.resident_name || x.received_from || '', x.income_head_name, x.payment_mode, paymentType(x.payment_mode), Number(x.amount || 0)])
      }
    case 'expense':
    case 'vouchers':
      return {
        columns: ['Date', 'Voucher No.', 'Paid To', 'Head', 'Description', 'Mode', 'Type', 'Amount'],
        rows: statement.expenses.map((x) => [formatDate(x.expense_date), x.voucher_no, x.paid_to, x.expense_head_name, x.description || '', x.payment_mode, paymentType(x.payment_mode), Number(x.amount || 0)])
      }
    case 'cashbook': {
      const income = statement.income.filter((x) => x.payment_mode === 'CASH').map((x) => [formatDate(x.receipt_date), 'Income', x.receipt_no, x.income_head_name, Number(x.amount || 0)])
      const expense = statement.expenses.filter((x) => x.payment_mode === 'CASH').map((x) => [formatDate(x.expense_date), 'Expense', x.voucher_no, `${x.expense_head_name} - ${x.paid_to}`, -Number(x.amount || 0)])
      const transfers = statement.transfers.map((x) => [formatDate(x.transfer_date), 'Transfer', '', x.transfer_type === 'CASH_TO_BANK' ? 'Cash deposited into bank' : 'Cash withdrawn from bank', x.transfer_type === 'CASH_TO_BANK' ? -Number(x.amount) : Number(x.amount)])
      return { columns: ['Date', 'Entry Type', 'Document', 'Particulars', 'Cash Movement'], rows: [...income, ...expense, ...transfers].sort((a, b) => a[0].localeCompare(b[0])) }
    }
    case 'bankbook': {
      const income = statement.income.filter((x) => x.payment_mode !== 'CASH').map((x) => [formatDate(x.receipt_date), 'Income', x.receipt_no, x.income_head_name, x.payment_mode, Number(x.amount || 0)])
      const expense = statement.expenses.filter((x) => x.payment_mode !== 'CASH').map((x) => [formatDate(x.expense_date), 'Expense', x.voucher_no, `${x.expense_head_name} - ${x.paid_to}`, x.payment_mode, -Number(x.amount || 0)])
      return { columns: ['Date', 'Entry Type', 'Document', 'Particulars', 'Mode', 'Bank Movement'], rows: [...income, ...expense].sort((a, b) => a[0].localeCompare(b[0])) }
    }
    case 'maintenance':
      return {
        columns: ['Receipt Date', 'Receipt No.', 'Flat', 'Resident', 'Maintenance From', 'Maintenance To', 'Mode', 'Amount'],
        rows: statement.income.filter((x) => x.income_head_name.toLowerCase().includes('maintenance')).map((x) => [formatDate(x.receipt_date), x.receipt_no, x.flat_no || '', x.resident_name || x.received_from || '', x.maintenance_from ? x.maintenance_from.slice(0, 7) : '', x.maintenance_to ? x.maintenance_to.slice(0, 7) : '', x.payment_mode, Number(x.amount || 0)])
      }
    case 'income-head':
      return { columns: ['Income Head', 'Cash', 'Bank', 'Total'], rows: groupByHead(statement.income, 'income_head_name').map((x) => [x.head, x.cash, x.bank, x.total]) }
    case 'expense-head':
      return { columns: ['Expense Head', 'Cash', 'Bank', 'Total'], rows: groupByHead(statement.expenses, 'expense_head_name').map((x) => [x.head, x.cash, x.bank, x.total]) }
    default:
      return { columns: [], rows: [] }
  }
}

function exportGenericExcel(report, statement) {
  const XLSX = globalThis.XLSX
  if (!XLSX) throw new Error('Excel export library is not loaded. Reload the app while online.')
  const data = reportRows(report.id, statement)
  const ws = XLSX.utils.aoa_to_sheet([
    [`RWA Pocket-A - ${report.name}`],
    [monthLabel(statement.month)],
    [],
    data.columns,
    ...data.rows
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, report.name.slice(0, 31))
  XLSX.writeFile(wb, `RWA_${report.name.replace(/\s+/g, '_')}_${statement.month}.xlsx`)
}

function exportGenericPdf(report, statement) {
  const jsPDF = globalThis.jspdf?.jsPDF
  if (!jsPDF) throw new Error('PDF library is not loaded. Reload the app while online.')
  const data = reportRows(report.id, statement)
  const doc = new jsPDF({ orientation: data.columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('RWA Pocket-A', 12, 14)
  doc.setFontSize(13)
  doc.text(report.name, 12, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(monthLabel(statement.month), 12, 28)
  doc.autoTable({ startY: 34, head: [data.columns], body: data.rows.map((row) => row.map((v) => typeof v === 'number' ? v.toLocaleString('en-IN') : v)), styles: { fontSize: 7.5 }, theme: 'grid' })
  doc.save(`RWA_${report.name.replace(/\s+/g, '_')}_${statement.month}.pdf`)
}

function printGeneric(report, statement) {
  const data = reportRows(report.id, statement)
  const popup = window.open('', '_blank', 'width=1100,height=800')
  if (!popup) throw new Error('Popup blocked. Please allow popups.')
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(report.name)}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#17223b}h1{margin-bottom:2px}p{color:#64748b;margin-top:0}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:18px}th,td{border:1px solid #d9e1ec;padding:7px;text-align:left}th{background:#f1f5f9}.num{text-align:right}</style></head><body><h1>RWA Pocket-A - ${escapeHtml(report.name)}</h1><p>${monthLabel(statement.month)}</p><table><thead><tr>${data.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${r.map(v=>`<td>${typeof v==='number' ? v.toLocaleString('en-IN') : escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}

export default function Reports({ month, setMonth }) {
  const [statement, setStatement] = useState(null)
  const [selected, setSelected] = useState('monthly')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    buildMonthlyStatement(month)
      .then((x) => alive && setStatement(x))
      .catch((e) => alive && setMessage({ type: 'error', text: e.message || 'Unable to load reports.' }))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [month])

  const report = REPORTS.find((x) => x.id === selected) || REPORTS[0]
  const preview = statement && selected !== 'monthly' ? reportRows(selected, statement) : null
  const filteredCards = REPORTS.filter((x) => !search.trim() || `${x.name} ${x.description}`.toLowerCase().includes(search.toLowerCase()))

  function run(action) {
    try { action() } catch (e) { setMessage({ type: 'error', text: e.message || 'Unable to generate report.' }) }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="View, print and download RWA financial reports"
        actions={(
          <>
            <label className="acc-month-picker"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            <div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a report" /></div>
          </>
        )}
      />
      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}
      {loading ? <LoadingBlock text="Preparing reports..." /> : null}

      {!loading && statement ? (
        <>
          <div className="acc-stat-grid acc-stat-grid-5">
            <StatCard label="Income" value={statement.incomeSplit.total} tone="green" />
            <StatCard label="Expense" value={statement.expenseSplit.total} tone="red" />
            <StatCard label="Cash Closing" value={statement.closingCash} tone="sand" />
            <StatCard label="Bank Closing" value={statement.closingBank} tone="blue" />
            <StatCard label="Closing Balance" value={statement.closingTotal} tone="purple" />
          </div>

          <Section title="Report Library" subtitle="Select a report to preview it below">
            <div className="acc-report-grid">
              {filteredCards.map((item) => (
                <button key={item.id} className={`acc-report-card ${selected === item.id ? 'active' : ''}`} onClick={() => setSelected(item.id)}>
                  <span className="acc-report-icon">{item.id.includes('bank') ? <Landmark size={21} /> : item.id.includes('cash') ? <Banknote size={21} /> : item.id === 'monthly' ? <WalletCards size={21} /> : <ReceiptText size={21} />}</span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </Section>

          <Section
            title={`${report.name} Preview`}
            subtitle={monthLabel(month)}
            actions={(
              <>
                <button className="acc-button success" onClick={() => run(() => selected === 'monthly' ? exportMonthlyStatementExcel(statement) : exportGenericExcel(report, statement))}><FileSpreadsheet size={16} /> Excel</button>
                <button className="acc-button danger-bg" onClick={() => run(() => selected === 'monthly' ? exportMonthlyStatementPdf(statement) : exportGenericPdf(report, statement))}><Download size={16} /> PDF</button>
                <button className="acc-button secondary" onClick={() => run(() => selected === 'monthly' ? printMonthlyStatement(statement) : printGeneric(report, statement))}><Printer size={16} /> Print</button>
              </>
            )}
          >
            {selected === 'monthly' ? (
              <div className="acc-report-preview-monthly">
                <div className="acc-balance-3"><div><span>Opening Balance</span><strong>{formatCurrency(statement.openingTotal)}</strong></div><div><span>Net Surplus / Deficit</span><strong>{formatCurrency(statement.incomeSplit.total - statement.expenseSplit.total)}</strong></div><div className="highlight"><span>Closing Balance</span><strong>{formatCurrency(statement.closingTotal)}</strong></div></div>
                <div className="acc-two-col mini-summary">
                  <div><h3>Income</h3>{groupByHead(statement.income, 'income_head_name').map((x) => <p key={x.head}><span>{x.head}</span><strong>{formatCurrency(x.total)}</strong></p>)}</div>
                  <div><h3>Expense</h3>{groupByHead(statement.expenses, 'expense_head_name').map((x) => <p key={x.head}><span>{x.head}</span><strong>{formatCurrency(x.total)}</strong></p>)}</div>
                </div>
              </div>
            ) : preview?.rows.length ? (
              <div className="acc-table-wrap"><table className="acc-table"><thead><tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 15).map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : ''}>{typeof v === 'number' ? formatCurrency(v) : v || '—'}</td>)}</tr>)}</tbody></table>{preview.rows.length > 15 ? <div className="acc-preview-note">Showing first 15 of {preview.rows.length} rows. Export includes the complete report.</div> : null}</div>
            ) : <EmptyState>No data for this report.</EmptyState>}
          </Section>
        </>
      ) : null}
    </>
  )
}
