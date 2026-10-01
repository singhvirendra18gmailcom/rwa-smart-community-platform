import { formatCurrency, formatNumber, groupByHead, monthLabel } from './utils'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function formatPdfMoney(value) {
  return `Rs. ${formatNumber(value)}`
}

function safeFileName(text) {
  return String(text).replace(/[^a-z0-9-_]+/gi, '_')
}

export function exportMonthlyStatementExcel(statement) {
  const XLSX = globalThis.XLSX
  if (!XLSX) throw new Error('Excel export library is not loaded. Please reload the app while online.')

  const wb = XLSX.utils.book_new()
  const title = `RWA Pocket-A Monthly Statement - ${monthLabel(statement.month)}`
  const rows = [
    [title],
    [],
    ['Opening Balance', 'Cash', statement.opening.cash, 'Bank', statement.opening.bank, 'Total', statement.openingTotal],
    [],
    ['INCOME DETAILS'],
    ['Head', 'Cash', 'Bank', 'Total'],
    ...groupByHead(statement.income, 'income_head_name').map((r) => [r.head, r.cash, r.bank, r.total]),
    ['Total Income', statement.incomeSplit.cash, statement.incomeSplit.bank, statement.incomeSplit.total],
    [],
    ['EXPENSE DETAILS'],
    ['Head', 'Cash', 'Bank', 'Total'],
    ...groupByHead(statement.expenses, 'expense_head_name').map((r) => [r.head, r.cash, r.bank, r.total]),
    ['Total Expense', statement.expenseSplit.cash, statement.expenseSplit.bank, statement.expenseSplit.total],
    [],
    ['BANK / CASH TRANSFERS'],
    ['Cash deposited in bank', statement.cashDeposited],
    ['Cash withdrawn from bank', statement.cashWithdrawn],
    [],
    ['Closing Balance', 'Cash', statement.closingCash, 'Bank', statement.closingBank, 'Total', statement.closingTotal]
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Statement')

  const incomeSheet = XLSX.utils.json_to_sheet(statement.income.map((x) => ({
    'Receipt Date': x.receipt_date,
    'Receipt No': x.receipt_no,
    'Flat No': x.flat_no || '',
    'Resident / Received From': x.resident_name || x.received_from || '',
    'Income Head': x.income_head_name,
    'Mode': x.payment_mode,
    'Type': x.payment_mode === 'CASH' ? 'CASH' : 'BANK',
    'Reference / Cheque': x.reference_no || x.cheque_no || '',
    'Amount': Number(x.amount || 0)
  })))
  XLSX.utils.book_append_sheet(wb, incomeSheet, 'Income Register')

  const expenseSheet = XLSX.utils.json_to_sheet(statement.expenses.map((x) => ({
    'Date': x.expense_date,
    'Voucher No': x.voucher_no,
    'Paid To': x.paid_to,
    'Expense Head': x.expense_head_name,
    'Description': x.description || '',
    'Mode': x.payment_mode,
    'Type': x.payment_mode === 'CASH' ? 'CASH' : 'BANK',
    'Reference / Cheque': x.reference_no || x.cheque_no || '',
    'Amount': Number(x.amount || 0)
  })))
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Expense Register')

  XLSX.writeFile(wb, `${safeFileName(title)}.xlsx`)
}

function drawKeyValue(doc, x, y, label, value, width = 55) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(80, 90, 110)
  doc.text(label, x, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 35, 65)
  doc.text(value, x, y + 6)
  doc.setDrawColor(225, 230, 240)
  doc.roundedRect(x - 2, y - 6, width, 18, 2, 2)
}

export function exportMonthlyStatementPdf(statement) {
  const jsPDF = globalThis.jspdf?.jsPDF
  if (!jsPDF) throw new Error('PDF library is not loaded. Please reload the app while online.')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const margin = 12

  doc.setTextColor(17, 45, 84)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('RWA Pocket-A', margin, 16)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(statement.settings?.society_subtitle || 'Express View Apartment, Sector-105, Noida', margin, 22)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('MONTHLY ACCOUNT STATEMENT', pageWidth / 2, 16, { align: 'center' })
  doc.setFontSize(10)
  doc.text(monthLabel(statement.month), pageWidth / 2, 22, { align: 'center' })

  doc.setDrawColor(45, 105, 180)
  doc.line(margin, 27, pageWidth - margin, 27)

  drawKeyValue(doc, 14, 38, 'Opening Balance', formatPdfMoney(statement.openingTotal), 43)
  drawKeyValue(doc, 62, 38, 'Total Income', formatPdfMoney(statement.incomeSplit.total), 43)
  drawKeyValue(doc, 110, 38, 'Total Expense', formatPdfMoney(statement.expenseSplit.total), 43)
  drawKeyValue(doc, 158, 38, 'Closing Balance', formatPdfMoney(statement.closingTotal), 40)

  const incomeRows = groupByHead(statement.income, 'income_head_name').map((r) => [
    r.head,
    formatNumber(r.cash),
    formatNumber(r.bank),
    formatNumber(r.total)
  ])
  incomeRows.push(['TOTAL INCOME', formatNumber(statement.incomeSplit.cash), formatNumber(statement.incomeSplit.bank), formatNumber(statement.incomeSplit.total)])

  doc.setTextColor(18, 115, 80)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Income Details', margin, 62)
  doc.autoTable({
    startY: 65,
    margin: { left: margin, right: margin },
    head: [['Head', 'Cash (Rs.)', 'Bank (Rs.)', 'Total (Rs.)']],
    body: incomeRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [232, 248, 240], textColor: [20, 80, 60] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
  })

  const expenseRows = groupByHead(statement.expenses, 'expense_head_name').map((r) => [
    r.head,
    formatNumber(r.cash),
    formatNumber(r.bank),
    formatNumber(r.total)
  ])
  expenseRows.push(['TOTAL EXPENSE', formatNumber(statement.expenseSplit.cash), formatNumber(statement.expenseSplit.bank), formatNumber(statement.expenseSplit.total)])

  let y = doc.lastAutoTable.finalY + 9
  if (y > 185) {
    doc.addPage()
    y = 18
  }
  doc.setTextColor(185, 45, 55)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Expense Details', margin, y)
  doc.autoTable({
    startY: y + 3,
    margin: { left: margin, right: margin },
    head: [['Head', 'Cash (Rs.)', 'Bank (Rs.)', 'Total (Rs.)']],
    body: expenseRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [253, 237, 238], textColor: [130, 35, 45] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
  })

  y = doc.lastAutoTable.finalY + 9
  if (y > 245) {
    doc.addPage()
    y = 18
  }

  doc.setTextColor(45, 65, 120)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Cash / Bank Movement', margin, y)
  doc.autoTable({
    startY: y + 3,
    margin: { left: margin, right: margin },
    body: [
      ['Cash deposited into bank', formatPdfMoney(statement.cashDeposited)],
      ['Cash withdrawn from bank', formatPdfMoney(statement.cashWithdrawn)]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
  })

  y = doc.lastAutoTable.finalY + 9
  if (y > 250) {
    doc.addPage()
    y = 18
  }

  doc.setFillColor(241, 247, 255)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 27, 2, 2, 'F')
  doc.setTextColor(20, 45, 85)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Closing Cash', margin + 6, y + 8)
  doc.text('Closing Bank', margin + 72, y + 8)
  doc.text('Total Closing Balance', margin + 132, y + 8)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(formatPdfMoney(statement.closingCash), margin + 6, y + 17)
  doc.text(formatPdfMoney(statement.closingBank), margin + 72, y + 17)
  doc.text(formatPdfMoney(statement.closingTotal), margin + 132, y + 17)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 110, 125)
  doc.text('System generated from recorded income, expense, cash/bank transfers and reconciliation data.', margin, 287)

  doc.save(`RWA_Monthly_Statement_${safeFileName(monthLabel(statement.month))}.pdf`)
}

export function printMonthlyStatement(statement) {
  const incomeRows = groupByHead(statement.income, 'income_head_name')
  const expenseRows = groupByHead(statement.expenses, 'expense_head_name')
  const popup = window.open('', '_blank', 'width=1100,height=800')
  if (!popup) throw new Error('Popup blocked. Please allow popups and try again.')

  popup.document.write(`<!doctype html><html><head><title>Monthly Statement</title>
  <style>
    body{font-family:Arial,sans-serif;color:#17223b;margin:28px} h1,h2,p{margin:0} .head{text-align:center;border-bottom:2px solid #1d5ea8;padding-bottom:12px;margin-bottom:18px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.card{border:1px solid #dbe4ef;border-radius:8px;padding:10px}.label{font-size:12px;color:#64748b}.value{font-size:18px;font-weight:700;margin-top:5px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}th,td{border:1px solid #d7dfeb;padding:7px}th{background:#f2f6fb;text-align:left}.num{text-align:right}.total{font-weight:700;background:#eef8f2}.expense .total{background:#fff0f0}
    .movement{margin-top:16px;border:1px solid #d7dfeb;padding:12px;border-radius:8px}.footer{margin-top:24px;font-size:10px;color:#6b7280}@media print{button{display:none}.two{grid-template-columns:1fr 1fr}}
  </style></head><body>
  <div class="head"><h2>RWA Pocket-A</h2><p>${escapeHtml(statement.settings?.society_subtitle || '')}</p><h1>Monthly Account Statement - ${monthLabel(statement.month)}</h1></div>
  <div class="grid">
    <div class="card"><div class="label">Opening Balance</div><div class="value">${formatCurrency(statement.openingTotal)}</div></div>
    <div class="card"><div class="label">Total Income</div><div class="value">${formatCurrency(statement.incomeSplit.total)}</div></div>
    <div class="card"><div class="label">Total Expense</div><div class="value">${formatCurrency(statement.expenseSplit.total)}</div></div>
    <div class="card"><div class="label">Closing Balance</div><div class="value">${formatCurrency(statement.closingTotal)}</div></div>
  </div>
  <div class="two">
    <div><h3>Income Details</h3><table><thead><tr><th>Head</th><th>Cash</th><th>Bank</th><th>Total</th></tr></thead><tbody>
      ${incomeRows.map(r=>`<tr><td>${escapeHtml(r.head)}</td><td class="num">${formatNumber(r.cash)}</td><td class="num">${formatNumber(r.bank)}</td><td class="num">${formatNumber(r.total)}</td></tr>`).join('')}
      <tr class="total"><td>Total Income</td><td class="num">${formatNumber(statement.incomeSplit.cash)}</td><td class="num">${formatNumber(statement.incomeSplit.bank)}</td><td class="num">${formatNumber(statement.incomeSplit.total)}</td></tr>
    </tbody></table></div>
    <div class="expense"><h3>Expense Details</h3><table><thead><tr><th>Head</th><th>Cash</th><th>Bank</th><th>Total</th></tr></thead><tbody>
      ${expenseRows.map(r=>`<tr><td>${escapeHtml(r.head)}</td><td class="num">${formatNumber(r.cash)}</td><td class="num">${formatNumber(r.bank)}</td><td class="num">${formatNumber(r.total)}</td></tr>`).join('')}
      <tr class="total"><td>Total Expense</td><td class="num">${formatNumber(statement.expenseSplit.cash)}</td><td class="num">${formatNumber(statement.expenseSplit.bank)}</td><td class="num">${formatNumber(statement.expenseSplit.total)}</td></tr>
    </tbody></table></div>
  </div>
  <div class="movement"><strong>Cash deposited into bank:</strong> ${formatCurrency(statement.cashDeposited)} &nbsp;&nbsp; <strong>Cash withdrawn from bank:</strong> ${formatCurrency(statement.cashWithdrawn)}</div>
  <div class="grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="card"><div class="label">Closing Cash</div><div class="value">${formatCurrency(statement.closingCash)}</div></div>
    <div class="card"><div class="label">Closing Bank</div><div class="value">${formatCurrency(statement.closingBank)}</div></div>
    <div class="card"><div class="label">Total Closing</div><div class="value">${formatCurrency(statement.closingTotal)}</div></div>
  </div>
  <div class="footer">Generated by RWA Pocket-A Accounts Management</div>
  <script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}
