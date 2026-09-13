export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'UPI']

export function paymentType(mode) {
  return mode === 'CASH' ? 'CASH' : 'BANK'
}

export function formatCurrency(value) {
  const n = Number(value || 0)
  return `₹ ${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

export function toISODate(date = new Date()) {
  const d = new Date(date)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function monthKey(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthStartFromKey(key) {
  return `${key}-01`
}

export function monthRange(key) {
  const [year, month] = key.split('-').map(Number)
  const start = `${key}-01`
  const endDate = new Date(year, month, 0)
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  return { start, end }
}

export function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  })
}

export function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function firstDayOfMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return toISODate(d)
}

export function lastDayOfMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return toISODate(d)
}

export function sum(items, selector = (x) => x) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0)
}

export function splitByPaymentMode(items) {
  const cash = sum(items.filter((x) => x.payment_mode === 'CASH'), (x) => x.amount)
  const bank = sum(items.filter((x) => x.payment_mode !== 'CASH'), (x) => x.amount)
  return { cash, bank, total: cash + bank }
}

export function groupByHead(items, headField) {
  const map = new Map()
  items.forEach((item) => {
    const head = item[headField] || 'Other'
    const current = map.get(head) || { head, cash: 0, bank: 0, total: 0 }
    const amount = Number(item.amount || 0)
    if (item.payment_mode === 'CASH') current.cash += amount
    else current.bank += amount
    current.total += amount
    map.set(head, current)
  })
  return [...map.values()].sort((a, b) => a.head.localeCompare(b.head))
}

export function currentMonthKey() {
  return monthKey(new Date())
}

export function makeSequence(prefix, date, sequence) {
  const d = new Date(`${date}T00:00:00`)
  const year = d.getFullYear()
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`
}

export function parseMoney(value) {
  if (typeof value === 'number') return value
  if (value == null) return 0
  const cleaned = String(value)
    .replace(/[₹,$\s]/g, '')
    .replace(/\((.*?)\)/, '-$1')
    .trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}


function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCsvText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

function parsePossibleDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISODate(value)

  // Excel serial date
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86400000)
    return d.toISOString().slice(0, 10)
  }

  const text = String(value).trim()
  const iso = text.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/)
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`
  }

  const dmy = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{2,4})$/)
  if (dmy) {
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    return `${year}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return toISODate(parsed)
  return null
}

function findColumn(headers, candidates) {
  const normalized = headers.map(normalizeHeader)
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate)
    const exact = normalized.findIndex((x) => x === target)
    if (exact >= 0) return headers[exact]
  }
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate)
    const includes = normalized.findIndex((x) => x.includes(target) || target.includes(x))
    if (includes >= 0) return headers[includes]
  }
  return null
}

export async function parseBankStatementFile(file, selectedMonth) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') {
    return {
      rows: [],
      skipped: 0,
      message: 'PDF stored as a supporting document. Automatic transaction extraction is enabled for CSV/XLS/XLSX files.'
    }
  }

  let raw = []
  if (ext === 'csv') {
    raw = parseCsvText(await file.text())
  } else {
    const XLSX = globalThis.XLSX
    if (!XLSX) {
      throw new Error('Excel parser is not loaded. Please check the internet connection, reload the app, or upload the statement as CSV.')
    }
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  }
  if (!raw.length) return { rows: [], skipped: 0, message: 'No rows found in the statement.' }

  const headers = Object.keys(raw[0])
  const dateCol = findColumn(headers, ['transaction date', 'txn date', 'date', 'value date', 'posting date'])
  const descCol = findColumn(headers, ['description', 'narration', 'particulars', 'transaction remarks', 'remarks', 'details'])
  const refCol = findColumn(headers, ['reference no', 'reference', 'ref no', 'utr', 'cheque no', 'chq no', 'transaction id'])
  const creditCol = findColumn(headers, ['credit amount', 'credit', 'deposit', 'cr amount', 'cr'])
  const debitCol = findColumn(headers, ['debit amount', 'debit', 'withdrawal', 'dr amount', 'dr'])
  const amountCol = findColumn(headers, ['amount', 'transaction amount'])
  const typeCol = findColumn(headers, ['type', 'transaction type', 'dr cr', 'debit credit'])
  const balanceCol = findColumn(headers, ['balance', 'closing balance', 'running balance'])

  if (!dateCol) {
    throw new Error('Could not identify the transaction date column. Please export the bank statement with a Date/Transaction Date column.')
  }

  const rows = []
  let skipped = 0
  raw.forEach((item) => {
    const transactionDate = parsePossibleDate(item[dateCol])
    if (!transactionDate || !transactionDate.startsWith(selectedMonth)) {
      skipped += 1
      return
    }

    let credit = creditCol ? parseMoney(item[creditCol]) : 0
    let debit = debitCol ? parseMoney(item[debitCol]) : 0

    if (!credit && !debit && amountCol) {
      const amount = Math.abs(parseMoney(item[amountCol]))
      const type = typeCol ? normalizeHeader(item[typeCol]) : ''
      if (type.includes('cr') || type.includes('credit') || type.includes('deposit')) credit = amount
      else if (type.includes('dr') || type.includes('debit') || type.includes('withdraw')) debit = amount
      else if (parseMoney(item[amountCol]) < 0) debit = amount
      else credit = amount
    }

    if (!credit && !debit) {
      skipped += 1
      return
    }

    rows.push({
      transaction_date: transactionDate,
      description: descCol ? String(item[descCol] || '') : '',
      reference_no: refCol ? String(item[refCol] || '') : '',
      credit,
      debit,
      balance: balanceCol ? parseMoney(item[balanceCol]) : null
    })
  })

  return {
    rows,
    skipped,
    message: `${rows.length} transaction(s) from ${monthLabel(selectedMonth)} were found.`
  }
}

export function reconcileCandidate(bankTxn, entries, kind) {
  const amount = kind === 'INCOME' ? Number(bankTxn.credit || 0) : Number(bankTxn.debit || 0)
  const ref = normalizeHeader(bankTxn.reference_no)
  const bankDate = new Date(`${bankTxn.transaction_date}T00:00:00`)

  const candidates = entries
    .filter((e) => e.payment_mode !== 'CASH')
    .filter((e) => Math.abs(Number(e.amount || 0) - amount) < 0.01)
    .map((entry) => {
      const entryRef = normalizeHeader(entry.reference_no || entry.cheque_no)
      const entryDateValue = kind === 'INCOME' ? entry.payment_date || entry.receipt_date : entry.expense_date
      const entryDate = new Date(`${entryDateValue}T00:00:00`)
      const days = Math.abs(Math.round((bankDate - entryDate) / 86400000))
      let score = 0
      let method = 'AMOUNT'
      if (ref && entryRef && (ref.includes(entryRef) || entryRef.includes(ref))) {
        score += 100
        method = 'REFERENCE'
      }
      if (days === 0) score += 25
      else if (days <= 2) score += 15
      else if (days <= 5) score += 5
      return { entry, score, method, days }
    })
    .sort((a, b) => b.score - a.score)

  return candidates[0] || null
}

export function calculateBalances({
  openingCash = 0,
  openingBank = 0,
  incomeCash = 0,
  incomeBank = 0,
  expenseCash = 0,
  expenseBank = 0,
  cashDeposited = 0,
  cashWithdrawn = 0
}) {
  const closingCash = Number(openingCash) + Number(incomeCash) + Number(cashWithdrawn) - Number(expenseCash) - Number(cashDeposited)
  const closingBank = Number(openingBank) + Number(incomeBank) + Number(cashDeposited) - Number(expenseBank) - Number(cashWithdrawn)
  return {
    closingCash,
    closingBank,
    closingTotal: closingCash + closingBank,
    openingTotal: Number(openingCash) + Number(openingBank),
    netMovement: Number(incomeCash) + Number(incomeBank) - Number(expenseCash) - Number(expenseBank)
  }
}
