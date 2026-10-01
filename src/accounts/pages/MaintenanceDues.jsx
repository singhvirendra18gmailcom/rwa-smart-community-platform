import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Printer, Search } from 'lucide-react'
import {
  getFlatsWithResidents,
  getMaintenanceIncomeEntries,
  getMaintenanceRates
} from '../api'
import {
  calculateMaintenanceDues,
  flatPaymentRecord,
  maintenanceTrackingStart
} from '../maintenanceDues'
import { formatCurrency, formatDate, monthLabel } from '../utils'
import {
  EmptyState,
  LoadingBlock,
  Message,
  PageHeader,
  Section,
  StatCard
} from '../components/Common'

function exportExcel(title, month, columns, rows, fileName) {
  const XLSX = globalThis.XLSX
  if (!XLSX) throw new Error('Excel export library is not loaded. Reload the app while online.')
  const ws = XLSX.utils.aoa_to_sheet([
    ['RWA Pocket-A'],
    [title],
    [monthLabel(month)],
    [],
    columns,
    ...rows
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31))
  XLSX.writeFile(wb, fileName)
}

function exportPdf(title, month, columns, rows, fileName) {
  const jsPDF = globalThis.jspdf?.jsPDF
  if (!jsPDF) throw new Error('PDF library is not loaded. Reload the app while online.')
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('RWA Pocket-A', 12, 14)
  doc.setFontSize(13)
  doc.text(title, 12, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(monthLabel(month), 12, 28)
  doc.autoTable({
    startY: 34,
    head: [columns],
    body: rows.map((row) => row.map((value) => typeof value === 'number' ? value.toLocaleString('en-IN') : value)),
    styles: { fontSize: 7.5 },
    theme: 'grid'
  })
  doc.save(fileName)
}

function printRows(title, month, columns, rows) {
  const popup = window.open('', '_blank', 'width=1100,height=800')
  if (!popup) throw new Error('Popup blocked. Please allow popups.')
  const head = columns.map((c) => '<th>' + String(c) + '</th>').join('')
  const body = rows.map((row) => '<tr>' + row.map((value) => '<td>' + String(typeof value === 'number' ? value.toLocaleString('en-IN') : (value ?? '')) + '</td>').join('') + '</tr>').join('')
  popup.document.write('<!doctype html><html><head><title>' + title + '</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#17223b}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:18px}th,td{border:1px solid #d9e1ec;padding:7px;text-align:left}th{background:#f1f5f9}</style></head><body><h1>RWA Pocket-A - ' + title + '</h1><p>' + monthLabel(month) + '</p><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table><script>window.onload=()=>window.print()</script></body></html>')
  popup.document.close()
}

function monthText(value) {
  return value ? monthLabel(String(value).slice(0, 7)) : '—'
}

export default function MaintenanceDues({ month, setMonth }) {
  const [flats, setFlats] = useState([])
  const [entries, setEntries] = useState([])
  const [rates, setRates] = useState([])
  const [selectedFlatId, setSelectedFlatId] = useState('')
  const [tab, setTab] = useState('defaulters')
  const [filterMode, setFilterMode] = useState('all')
  const [monthThreshold, setMonthThreshold] = useState(2)
  const [amountThreshold, setAmountThreshold] = useState(5000)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      getFlatsWithResidents(),
      getMaintenanceIncomeEntries(),
      getMaintenanceRates(true)
    ])
      .then(([flatRows, paymentRows, rateRows]) => {
        if (!alive) return
        setFlats(flatRows)
        setEntries(paymentRows)
        setRates(rateRows)
        setSelectedFlatId(flatRows[0]?.id || '')
      })
      .catch((error) => alive && setMessage({ type: 'error', text: error.message || 'Unable to load maintenance records.' }))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const trackingStart = useMemo(() => maintenanceTrackingStart(rates), [rates])
  const dues = useMemo(() => calculateMaintenanceDues({ flats, entries, rates, reportMonth: month }), [flats, entries, rates, month])

  const selectedFlat = useMemo(
    () => dues.find((row) => row.id === selectedFlatId) || flats.find((row) => row.id === selectedFlatId) || null,
    [dues, flats, selectedFlatId]
  )

  const selectedPayments = useMemo(
    () => flatPaymentRecord(entries, selectedFlat?.flat_no),
    [entries, selectedFlat?.flat_no]
  )

  const defaulters = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dues.filter((row) => {
      if (row.due_month_count <= 0) return false
      if (filterMode === 'months' && row.due_month_count <= Number(monthThreshold || 0)) return false
      if (filterMode === 'amount' && row.due_amount <= Number(amountThreshold || 0)) return false
      if (!q) return true
      return (String(row.flat_no || '') + ' ' + String(row.owner_name || '') + ' ' + String(row.tower_no || '')).toLowerCase().includes(q)
    })
  }, [dues, filterMode, monthThreshold, amountThreshold, search])

  const totalDue = useMemo(() => defaulters.reduce((sum, row) => sum + Number(row.due_amount || 0), 0), [defaulters])
  const moreThanMonthsCount = useMemo(() => dues.filter((row) => row.due_month_count > Number(monthThreshold || 0)).length, [dues, monthThreshold])
  const moreThanAmountCount = useMemo(() => dues.filter((row) => row.due_amount > Number(amountThreshold || 0)).length, [dues, amountThreshold])

  function run(action) {
    try { action() } catch (error) { setMessage({ type: 'error', text: error.message || 'Unable to generate report.' }) }
  }

  function defaulterTitle() {
    if (filterMode === 'months') return 'Defaulters - More Than ' + Number(monthThreshold || 0) + ' Months Due'
    if (filterMode === 'amount') return 'Defaulters - Dues Above Rs ' + Number(amountThreshold || 0).toLocaleString('en-IN')
    return 'Monthly Defaulter Report'
  }

  function exportDefaulters(type) {
    const columns = ['Flat', 'Owner / Resident', 'Tower', 'Due Months', 'Due Amount', 'Oldest Due Month', 'Paid Through']
    const rows = defaulters.map((row) => [
      row.flat_no,
      row.owner_name || '',
      row.tower_no || '',
      row.due_month_count,
      Number(row.due_amount || 0),
      row.oldest_due_month ? monthText(row.oldest_due_month) : '',
      row.paid_through ? monthText(row.paid_through) : ''
    ])
    const title = defaulterTitle()
    const base = 'RWA_Defaulters_' + month
    if (type === 'excel') exportExcel(title, month, columns, rows, base + '.xlsx')
    else if (type === 'pdf') exportPdf(title, month, columns, rows, base + '.pdf')
    else printRows(title, month, columns, rows)
  }

  function exportFlat(type) {
    if (!selectedFlat) return
    const columns = ['Receipt Date', 'Receipt No.', 'Maintenance From', 'Maintenance To', 'Mode', 'Amount', 'Received From']
    const rows = selectedPayments.map((row) => [
      formatDate(row.receipt_date),
      row.receipt_no,
      row.maintenance_from ? monthText(row.maintenance_from) : '',
      row.maintenance_to ? monthText(row.maintenance_to) : '',
      row.payment_mode,
      Number(row.amount || 0),
      row.resident_name || row.received_from || ''
    ])
    const title = 'Flat ' + selectedFlat.flat_no + ' - Maintenance Payment Record'
    const base = 'RWA_Flat_' + selectedFlat.flat_no + '_Maintenance_Record'
    if (type === 'excel') exportExcel(title, month, columns, rows, base + '.xlsx')
    else if (type === 'pdf') exportPdf(title, month, columns, rows, base + '.pdf')
    else printRows(title, month, columns, rows)
  }

  if (loading) return <LoadingBlock text="Preparing maintenance ledger and dues..." />

  return (
    <>
      <PageHeader
        title="Maintenance Dues"
        subtitle="Flat-wise payment history, dues filters and monthly defaulter reports"
        actions={(
          <label className="acc-month-picker">
            <span>Report Month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
      />

      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}
      {!rates.length ? <Message type="warning">Maintenance rate history is not configured. Run the maintenance-dues migration, then add the first rate in Master Data → Maintenance Rates.</Message> : null}

      <div className="acc-dues-tabs">
        <button className={tab === 'defaulters' ? 'active' : ''} onClick={() => setTab('defaulters')}>Defaulters & Dues</button>
        <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>Flat Payment Record</button>
      </div>

      {tab === 'defaulters' ? (
        <>
          <div className="acc-stat-grid acc-stat-grid-4">
            <StatCard label="Defaulter Flats" value={dues.filter((row) => row.due_month_count > 0).length} tone="red" helper={monthLabel(month)} />
            <StatCard label="Filtered Dues" value={totalDue} tone="sand" helper={defaulters.length + ' flats'} />
            <StatCard label={'More Than ' + Number(monthThreshold || 0) + ' Months'} value={moreThanMonthsCount} tone="purple" helper="Flat count" />
            <StatCard label={'Above ₹' + Number(amountThreshold || 0).toLocaleString('en-IN')} value={moreThanAmountCount} tone="blue" helper="Flat count" />
          </div>

          <Section
            title="Defaulter Report"
            subtitle={trackingStart ? 'Dues calculated from ' + monthText(trackingStart) + ' using maintenance rate history' : 'Add maintenance rate history before calculating dues'}
            actions={(
              <>
                <button className="acc-button success" disabled={!rates.length} onClick={() => run(() => exportDefaulters('excel'))}><FileSpreadsheet size={16} /> Excel</button>
                <button className="acc-button danger-bg" disabled={!rates.length} onClick={() => run(() => exportDefaulters('pdf'))}><Download size={16} /> PDF</button>
                <button className="acc-button secondary" disabled={!rates.length} onClick={() => run(() => exportDefaulters('print'))}><Printer size={16} /> Print</button>
              </>
            )}
          >
            <div className="acc-dues-filter-tabs">
              <button className={filterMode === 'all' ? 'active' : ''} onClick={() => setFilterMode('all')}>Monthly Defaulters</button>
              <button className={filterMode === 'months' ? 'active' : ''} onClick={() => setFilterMode('months')}>More Than X Months</button>
              <button className={filterMode === 'amount' ? 'active' : ''} onClick={() => setFilterMode('amount')}>Dues Above Amount</button>
            </div>

            <div className="acc-dues-controls">
              {filterMode === 'months' ? (
                <label className="acc-date-picker">
                  <span>More than how many months?</span>
                  <input type="number" min="0" value={monthThreshold} onChange={(e) => setMonthThreshold(e.target.value)} />
                </label>
              ) : null}
              {filterMode === 'amount' ? (
                <label className="acc-date-picker">
                  <span>Dues above amount</span>
                  <input type="number" min="0" step="100" value={amountThreshold} onChange={(e) => setAmountThreshold(e.target.value)} />
                </label>
              ) : null}
              <div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flat or owner" /></div>
            </div>

            {!rates.length ? <EmptyState>Configure Maintenance Rates to calculate dues.</EmptyState> : defaulters.length ? (
              <div className="acc-table-wrap">
                <table className="acc-table">
                  <thead><tr><th>#</th><th>Flat</th><th>Owner / Resident</th><th>Tower</th><th>Due Months</th><th>Oldest Due</th><th>Paid Through</th><th className="num">Due Amount</th></tr></thead>
                  <tbody>
                    {defaulters.map((row, index) => (
                      <tr key={row.id}>
                        <td>{index + 1}</td>
                        <td><strong>{row.flat_no}</strong></td>
                        <td>{row.owner_name || '—'}</td>
                        <td>{row.tower_no || '—'}</td>
                        <td><strong>{row.due_month_count}</strong></td>
                        <td>{row.oldest_due_month ? monthText(row.oldest_due_month) : '—'}</td>
                        <td>{row.paid_through ? monthText(row.paid_through) : '—'}</td>
                        <td className="num"><strong>{formatCurrency(row.due_amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="7">Total Outstanding</td><td className="num">{formatCurrency(totalDue)}</td></tr></tfoot>
                </table>
              </div>
            ) : <EmptyState>No flats match the selected defaulter filter.</EmptyState>}
          </Section>
        </>
      ) : (
        <Section
          title="Flat Payment Record"
          subtitle="Extract the complete maintenance payment history for one flat"
          actions={(
            <>
              <button className="acc-button success" disabled={!selectedFlat} onClick={() => run(() => exportFlat('excel'))}><FileSpreadsheet size={16} /> Excel</button>
              <button className="acc-button danger-bg" disabled={!selectedFlat} onClick={() => run(() => exportFlat('pdf'))}><Download size={16} /> PDF</button>
              <button className="acc-button secondary" disabled={!selectedFlat} onClick={() => run(() => exportFlat('print'))}><Printer size={16} /> Print</button>
            </>
          )}
        >
          <div className="acc-flat-ledger-selector">
            <select value={selectedFlatId} onChange={(e) => setSelectedFlatId(e.target.value)}>
              {flats.map((flat) => <option key={flat.id} value={flat.id}>{flat.flat_no}{flat.resident_name ? ' - ' + flat.resident_name : ''}</option>)}
            </select>
          </div>

          {selectedFlat ? (
            <>
              <div className="acc-flat-ledger-summary">
                <div><span>Flat</span><strong>{selectedFlat.flat_no}</strong></div>
                <div><span>Owner / Resident</span><strong>{selectedFlat.owner_name || selectedFlat.resident_name || '—'}</strong></div>
                <div><span>Total Maintenance Paid</span><strong>{formatCurrency(selectedFlat.total_maintenance_paid || 0)}</strong></div>
                <div><span>Paid Through</span><strong>{selectedFlat.paid_through ? monthText(selectedFlat.paid_through) : '—'}</strong></div>
                <div><span>Due Months</span><strong>{selectedFlat.due_month_count ?? '—'}</strong></div>
                <div><span>Outstanding</span><strong>{formatCurrency(selectedFlat.due_amount || 0)}</strong></div>
              </div>

              {selectedPayments.length ? (
                <div className="acc-table-wrap">
                  <table className="acc-table">
                    <thead><tr><th>#</th><th>Receipt Date</th><th>Receipt No.</th><th>Maintenance From</th><th>Maintenance To</th><th>Mode</th><th>Received From</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {selectedPayments.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{formatDate(row.receipt_date)}</td>
                          <td><strong>{row.receipt_no}</strong></td>
                          <td>{row.maintenance_from ? monthText(row.maintenance_from) : '—'}</td>
                          <td>{row.maintenance_to ? monthText(row.maintenance_to) : '—'}</td>
                          <td>{row.payment_mode}</td>
                          <td>{row.resident_name || row.received_from || '—'}</td>
                          <td className="num"><strong>{formatCurrency(row.amount)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState>No maintenance payment recorded for this flat.</EmptyState>}
            </>
          ) : <EmptyState>No active flats are available.</EmptyState>}
        </Section>
      )}
    </>
  )
}
