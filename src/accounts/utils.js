import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker


// =========================================================
// Payment helpers
// =========================================================

export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'UPI']

export function paymentType(mode) {
  return mode === 'CASH' ? 'CASH' : 'BANK'
}


// =========================================================
// Formatting helpers
// =========================================================

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


// =========================================================
// Date helpers
// =========================================================

export function toISODate(date = new Date()) {
  const d = new Date(date)

  const local = new Date(
    d.getTime() - d.getTimezoneOffset() * 60000
  )

  return local.toISOString().slice(0, 10)
}

export function monthKey(date = new Date()) {
  const d = new Date(date)

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, '0')}`
}

export function monthStartFromKey(key) {
  return `${key}-01`
}

export function monthRange(key) {
  const [year, month] = key.split('-').map(Number)

  const start = `${key}-01`

  const endDate = new Date(year, month, 0)

  const end = `${year}-${String(month).padStart(
    2,
    '0'
  )}-${String(endDate.getDate()).padStart(2, '0')}`

  return {
    start,
    end
  }
}

export function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)

  return new Date(
    year,
    month - 1,
    1
  ).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  })
}

export function formatDate(value) {
  if (!value) return '—'

  const [year, month, day] = String(value)
    .slice(0, 10)
    .split('-')
    .map(Number)

  if (!year || !month || !day) return value

  return new Date(
    year,
    month - 1,
    day
  ).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function firstDayOfMonth(date = new Date()) {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  )

  return toISODate(d)
}

export function lastDayOfMonth(date = new Date()) {
  const d = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  )

  return toISODate(d)
}


// =========================================================
// Calculation helpers
// =========================================================

export function sum(items, selector = (x) => x) {
  return items.reduce(
    (total, item) =>
      total + Number(selector(item) || 0),
    0
  )
}

export function splitByPaymentMode(items) {
  const cash = sum(
    items.filter(
      (x) => x.payment_mode === 'CASH'
    ),
    (x) => x.amount
  )

  const bank = sum(
    items.filter(
      (x) => x.payment_mode !== 'CASH'
    ),
    (x) => x.amount
  )

  return {
    cash,
    bank,
    total: cash + bank
  }
}

export function groupByHead(items, headField) {
  const map = new Map()

  items.forEach((item) => {
    const head =
      item[headField] || 'Other'

    const current =
      map.get(head) || {
        head,
        cash: 0,
        bank: 0,
        total: 0
      }

    const amount =
      Number(item.amount || 0)

    if (item.payment_mode === 'CASH') {
      current.cash += amount
    } else {
      current.bank += amount
    }

    current.total += amount

    map.set(head, current)
  })

  return [...map.values()].sort(
    (a, b) =>
      a.head.localeCompare(b.head)
  )
}

export function currentMonthKey() {
  return monthKey(new Date())
}


// =========================================================
// Receipt / voucher numbering
// =========================================================

export function makeSequence(
  prefix,
  date,
  sequence
) {
  const d = new Date(
    `${date}T00:00:00`
  )

  const year = d.getFullYear()

  return `${prefix}-${year}-${String(
    sequence
  ).padStart(5, '0')}`
}


// =========================================================
// Money / text normalization
// =========================================================

export function parseMoney(value) {
  if (typeof value === 'number') {
    return value
  }

  if (value == null) {
    return 0
  }

  const cleaned = String(value)
    .replace(/[₹,$\s]/g, '')
    .replace(/\((.*?)\)/, '-$1')
    .trim()

  const n = Number(cleaned)

  return Number.isFinite(n)
    ? n
    : 0
}

export function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}


// =========================================================
// CSV parsing
// =========================================================

function parseCsvLine(line) {
  const cells = []

  let current = ''
  let quoted = false

  for (
    let i = 0;
    i < line.length;
    i += 1
  ) {
    const ch = line[i]

    if (ch === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (
      ch === ',' &&
      !quoted
    ) {
      cells.push(
        current.trim()
      )

      current = ''
    } else {
      current += ch
    }
  }

  cells.push(
    current.trim()
  )

  return cells
}

function parseCsvText(text) {
  const lines = String(
    text || ''
  )
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim()
    )

  if (!lines.length) {
    return []
  }

  const headers =
    parseCsvLine(lines[0])

  return lines
    .slice(1)
    .map((line) => {
      const cells =
        parseCsvLine(line)

      return Object.fromEntries(
        headers.map(
          (header, index) => [
            header,
            cells[index] ?? ''
          ]
        )
      )
    })
}


// =========================================================
// Date parsing
// =========================================================

function parsePossibleDate(value) {
  if (!value) {
    return null
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime()
    )
  ) {
    return toISODate(value)
  }

  // Excel serial date
  if (
    typeof value === 'number' &&
    value > 20000 &&
    value < 80000
  ) {
    const epoch =
      new Date(
        Date.UTC(
          1899,
          11,
          30
        )
      )

    const d =
      new Date(
        epoch.getTime() +
        value * 86400000
      )

    return d
      .toISOString()
      .slice(0, 10)
  }

  const text =
    String(value).trim()

  const iso =
    text.match(
      /^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/
    )

  if (iso) {
    return `${iso[1]}-${String(
      Number(iso[2])
    ).padStart(
      2,
      '0'
    )}-${String(
      Number(iso[3])
    ).padStart(
      2,
      '0'
    )}`
  }

  const dmy =
    text.match(
      /^([0-3]?\d)[-/]([01]?\d)[-/](\d{2,4})$/
    )

  if (dmy) {
    let year =
      Number(dmy[3])

    if (year < 100) {
      year += 2000
    }

    return `${year}-${String(
      Number(dmy[2])
    ).padStart(
      2,
      '0'
    )}-${String(
      Number(dmy[1])
    ).padStart(
      2,
      '0'
    )}`
  }

  const parsed =
    new Date(text)

  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {
    return toISODate(parsed)
  }

  return null
}


// =========================================================
// Spreadsheet column detection
// =========================================================

function findColumn(
  headers,
  candidates
) {
  const normalized =
    headers.map(
      normalizeHeader
    )

  for (
    const candidate of candidates
  ) {
    const target =
      normalizeHeader(
        candidate
      )

    const exact =
      normalized.findIndex(
        (x) => x === target
      )

    if (exact >= 0) {
      return headers[exact]
    }
  }

  for (
    const candidate of candidates
  ) {
    const target =
      normalizeHeader(
        candidate
      )

    const includes =
      normalized.findIndex(
        (x) =>
          x.includes(target) ||
          target.includes(x)
      )

    if (includes >= 0) {
      return headers[
        includes
      ]
    }
  }

  return null
}


// =========================================================
// PDF helpers
// =========================================================

function isPdfTransactionDate(text) {
  return /^([0-3]?\d)[-/]([01]?\d)[-/](\d{2,4})\b/.test(
    String(text || '').trim()
  )
}

function isMoneyText(value) {
  const text =
    String(value || '')
      .replace(/[₹,\s]/g, '')
      .trim()

  return /^-?\d+\.\d{2}$/.test(
    text
  )
}

function moneyFromPdfText(value) {
  return parseMoney(
    String(value || '')
      .replace(/CR$/i, '')
      .replace(/DR$/i, '')
  )
}

function extractReference(
  description
) {
  const text =
    String(
      description || ''
    )

  const patterns = [
    /\bUTR[:\s/-]*([A-Z0-9]{8,})\b/i,
    /\bUPI[:\s/-]*([A-Z0-9]{8,})\b/i,
    /\bNEFT[:\s/-]*([A-Z0-9]{8,})\b/i,
    /\bIMPS[:\s/-]*([A-Z0-9]{8,})\b/i,
    /\bRTGS[:\s/-]*([A-Z0-9]{8,})\b/i,
    /\b(?:REF|REFERENCE)[:\s/-]*([A-Z0-9]{8,})\b/i
  ]

  for (
    const pattern of patterns
  ) {
    const match =
      text.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  // Often UPI / NEFT references occur as
  // long standalone numeric/alphanumeric tokens.
  const longToken =
    text.match(
      /\b[A-Z0-9]{12,}\b/i
    )

  return longToken?.[0] || ''
}


// =========================================================
// Extract PDF content into visually grouped lines
// =========================================================

async function extractPdfLines(
  file
) {
  const buffer =
    await file.arrayBuffer()

  const loadingTask =
    pdfjsLib.getDocument({
      data: buffer
    })

  const pdf =
    await loadingTask.promise

  const pages = []

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const page =
      await pdf.getPage(
        pageNumber
      )

    const content =
      await page.getTextContent()

    const rawItems =
      content.items
        .filter(
          (item) =>
            String(
              item.str || ''
            ).trim()
        )
        .map(
          (item) => ({
            text: String(
              item.str || ''
            ).trim(),

            x:
              Number(
                item.transform?.[4] ||
                0
              ),

            y:
              Number(
                item.transform?.[5] ||
                0
              )
          })
        )

    const groups = []

    rawItems
      .sort(
        (a, b) =>
          b.y - a.y ||
          a.x - b.x
      )
      .forEach(
        (item) => {
          let group =
            groups.find(
              (line) =>
                Math.abs(
                  line.y -
                  item.y
                ) <= 2
            )

          if (!group) {
            group = {
              y: item.y,
              items: []
            }

            groups.push(
              group
            )
          }

          group.items.push(
            item
          )
        }
      )

    const lines =
      groups
        .sort(
          (a, b) =>
            b.y - a.y
        )
        .map(
          (line) => {
            const items =
              line.items.sort(
                (a, b) =>
                  a.x - b.x
              )

            return {
              page:
                pageNumber,

              y:
                line.y,

              items,

              text:
                items
                  .map(
                    (item) =>
                      item.text
                  )
                  .join(' ')
                  .replace(
                    /\s+/g,
                    ' '
                  )
                  .trim()
            }
          }
        )

    pages.push(...lines)
  }

  return pages
}


// =========================================================
// Find PNB / common bank PDF column positions
// =========================================================

function detectPdfColumns(lines) {
  const columns = {
    withdrawal: null,
    deposit: null,
    balance: null
  }

  for (
    const line of lines
  ) {
    const normalized =
      normalizeHeader(
        line.text
      )

    const looksLikeHeader =
      normalized.includes(
        'withdraw'
      ) &&
      (
        normalized.includes(
          'deposit'
        ) ||
        normalized.includes(
          'credit'
        )
      ) &&
      normalized.includes(
        'balance'
      )

    if (
      !looksLikeHeader
    ) {
      continue
    }

    for (
      const item of line.items
    ) {
      const value =
        normalizeHeader(
          item.text
        )

      if (
        value.includes(
          'withdraw'
        ) ||
        value === 'debit' ||
        value.includes(
          'debit amount'
        )
      ) {
        columns.withdrawal =
          item.x
      }

      if (
        value.includes(
          'deposit'
        ) ||
        value === 'credit' ||
        value.includes(
          'credit amount'
        )
      ) {
        columns.deposit =
          item.x
      }

      if (
        value.includes(
          'balance'
        )
      ) {
        columns.balance =
          item.x
      }
    }

    if (
      columns.withdrawal !== null ||
      columns.deposit !== null
    ) {
      break
    }
  }

  return columns
}


// =========================================================
// Opening balance from PDF
// =========================================================

function findPdfOpeningBalance(
  lines
) {
  for (
    const line of lines
  ) {
    const text =
      normalizeHeader(
        line.text
      )

    if (
      text.includes(
        'opening balance'
      ) ||
      text.includes(
        'balance brought forward'
      ) ||
      text.includes(
        'brought forward'
      )
    ) {
      const moneyItems =
        line.items.filter(
          (item) =>
            isMoneyText(
              item.text
            )
        )

      if (
        moneyItems.length
      ) {
        return moneyFromPdfText(
          moneyItems[
            moneyItems.length - 1
          ].text
        )
      }
    }
  }

  return null
}


// =========================================================
// Parse PDF statement transaction blocks
// =========================================================

function buildPdfTransactionBlocks(
  lines
) {
  const blocks = []

  let current = null

  for (
    const line of lines
  ) {
    const first =
      line.items?.[0]?.text ||
      ''

    const lineStartsWithDate =
      isPdfTransactionDate(
        first
      ) ||
      isPdfTransactionDate(
        line.text
      )

    if (
      lineStartsWithDate
    ) {
      if (current) {
        blocks.push(
          current
        )
      }

      current = {
        lines: [line]
      }

      continue
    }

    if (current) {
      // Stop obvious footer/header content
      const normalized =
        normalizeHeader(
          line.text
        )

      const shouldIgnore =
        normalized.includes(
          'page no'
        ) ||
        normalized.includes(
          'statement of account'
        ) ||
        normalized.includes(
          'tran date'
        )

      if (!shouldIgnore) {
        current.lines.push(
          line
        )
      }
    }
  }

  if (current) {
    blocks.push(current)
  }

  return blocks
}


// =========================================================
// Get nearest money cell to expected PDF column
// =========================================================

function findMoneyNearX(
  items,
  targetX
) {
  if (
    targetX == null
  ) {
    return null
  }

  const candidates =
    items
      .filter(
        (item) =>
          isMoneyText(
            item.text
          )
      )
      .map(
        (item) => ({
          ...item,
          distance:
            Math.abs(
              item.x -
              targetX
            )
        })
      )
      .sort(
        (a, b) =>
          a.distance -
          b.distance
      )

  if (
    !candidates.length
  ) {
    return null
  }

  // Avoid accidentally selecting a value
  // from another far-away column.
  if (
    candidates[0].distance >
    80
  ) {
    return null
  }

  return moneyFromPdfText(
    candidates[0].text
  )
}


// =========================================================
// Parse a PNB-style PDF bank statement
// =========================================================

async function parsePdfBankStatement(
  file,
  selectedMonth
) {
  const lines =
    await extractPdfLines(
      file
    )

  if (
    !lines.length
  ) {
    return {
      rows: [],
      skipped: 0,
      message:
        'No readable text was found in the PDF statement.'
    }
  }

  const columns =
    detectPdfColumns(
      lines
    )

  const blocks =
    buildPdfTransactionBlocks(
      lines
    )

  if (
    !blocks.length
  ) {
    return {
      rows: [],
      skipped: 0,
      message:
        'No transaction rows could be identified in the PDF.'
    }
  }

  let previousBalance =
    findPdfOpeningBalance(
      lines
    )

  const rows = []

  let skipped = 0

  for (
    const block of blocks
  ) {
    const firstLine =
      block.lines[0]

    const firstText =
      firstLine.text

    const dateMatch =
      firstText.match(
        /^([0-3]?\d[-/][01]?\d[-/]\d{2,4})/
      )

    if (
      !dateMatch
    ) {
      skipped += 1
      continue
    }

    const transactionDate =
      parsePossibleDate(
        dateMatch[1]
      )

    if (
      !transactionDate ||
      !transactionDate.startsWith(
        selectedMonth
      )
    ) {
      skipped += 1
      continue
    }

    const allItems =
      block.lines.flatMap(
        (line) =>
          line.items
      )

    let debit =
      findMoneyNearX(
        allItems,
        columns.withdrawal
      ) || 0

    let credit =
      findMoneyNearX(
        allItems,
        columns.deposit
      ) || 0

    let balance =
      findMoneyNearX(
        allItems,
        columns.balance
      )

    const moneyItems =
      allItems.filter(
        (item) =>
          isMoneyText(
            item.text
          )
      )

    const moneyValues =
      moneyItems.map(
        (item) =>
          moneyFromPdfText(
            item.text
          )
      )

    if (
      balance == null &&
      moneyValues.length
    ) {
      balance =
        moneyValues[
          moneyValues.length - 1
        ]
    }

    /*
      Fallback based on movement in balance.

      This is useful for PDF layouts where blank
      Withdrawal / Deposit columns are not preserved
      perfectly by PDF text extraction.
    */

    if (
      balance != null &&
      previousBalance != null
    ) {
      const difference =
        Number(
          (
            balance -
            previousBalance
          ).toFixed(2)
        )

      if (
        difference > 0
      ) {
        credit =
          Math.abs(
            difference
          )

        debit = 0
      } else if (
        difference < 0
      ) {
        debit =
          Math.abs(
            difference
          )

        credit = 0
      }
    }

    /*
      First transaction fallback.

      PNB generally gives:
      Withdrawal | Deposit | Balance.
    */

    if (
      !credit &&
      !debit &&
      moneyValues.length >= 3
    ) {
      debit =
        Number(
          moneyValues[
            moneyValues.length - 3
          ] || 0
        )

      credit =
        Number(
          moneyValues[
            moneyValues.length - 2
          ] || 0
        )
    }

    /*
      If exactly one amount plus balance is
      available, use narration hints.
    */

    if (
      !credit &&
      !debit &&
      moneyValues.length >= 2
    ) {
      const possibleAmount =
        Number(
          moneyValues[
            moneyValues.length - 2
          ] || 0
        )

      const normalizedText =
        normalizeHeader(
          block.lines
            .map(
              (line) =>
                line.text
            )
            .join(' ')
        )

      if (
        normalizedText.includes(
          'deposit'
        ) ||
        normalizedText.includes(
          'credit'
        ) ||
        normalizedText.includes(
          'by transfer'
        )
      ) {
        credit =
          possibleAmount
      } else {
        debit =
          possibleAmount
      }
    }

    if (
      !credit &&
      !debit
    ) {
      skipped += 1

      if (
        balance != null
      ) {
        previousBalance =
          balance
      }

      continue
    }

    const descriptionParts =
      []

    for (
      const line of block.lines
    ) {
      for (
        const item of line.items
      ) {
        const value =
          String(
            item.text || ''
          ).trim()

        if (!value) {
          continue
        }

        if (
          isMoneyText(value)
        ) {
          continue
        }

        if (
          parsePossibleDate(
            value
          )
        ) {
          continue
        }

        descriptionParts.push(
          value
        )
      }
    }

    let description =
      descriptionParts
        .join(' ')
        .replace(
          /\s+/g,
          ' '
        )
        .trim()

    // Remove transaction date from narration
    description =
      description
        .replace(
          dateMatch[1],
          ''
        )
        .trim()

    const referenceNo =
      extractReference(
        description
      )

    rows.push({
      transaction_date:
        transactionDate,

      description,

      reference_no:
        referenceNo,

      credit:
        Number(
          credit || 0
        ),

      debit:
        Number(
          debit || 0
        ),

      balance:
        balance == null
          ? null
          : Number(balance)
    })

    if (
      balance != null
    ) {
      previousBalance =
        balance
    }
  }

  return {
    rows,

    skipped,

    message:
      `${rows.length} transaction(s) from ${monthLabel(
        selectedMonth
      )} were extracted from the PDF statement.`
  }
}


// =========================================================
// Parse CSV / Excel bank statement
// =========================================================

async function parseSpreadsheetBankStatement(
  file,
  selectedMonth,
  ext
) {
  let raw = []

  if (
    ext === 'csv'
  ) {
    raw =
      parseCsvText(
        await file.text()
      )
  } else {
    const XLSX =
      globalThis.XLSX

    if (!XLSX) {
      throw new Error(
        'Excel parser is not loaded. Please check the internet connection, reload the app, or upload the statement as CSV.'
      )
    }

    const buffer =
      await file.arrayBuffer()

    const workbook =
      XLSX.read(
        buffer,
        {
          type: 'array',
          cellDates: true
        }
      )

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ]

    raw =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: ''
        }
      )
  }

  if (
    !raw.length
  ) {
    return {
      rows: [],
      skipped: 0,
      message:
        'No rows found in the statement.'
    }
  }

  const headers =
    Object.keys(raw[0])

  const dateCol =
    findColumn(
      headers,
      [
        'transaction date',
        'txn date',
        'tran date',
        'date',
        'value date',
        'posting date'
      ]
    )

  const descCol =
    findColumn(
      headers,
      [
        'description',
        'narration',
        'particulars',
        'transaction remarks',
        'remarks',
        'details'
      ]
    )

  const refCol =
    findColumn(
      headers,
      [
        'reference no',
        'reference',
        'ref no',
        'utr',
        'cheque no',
        'chq no',
        'transaction id'
      ]
    )

  const creditCol =
    findColumn(
      headers,
      [
        'credit amount',
        'credit',
        'deposit',
        'deposit amount',
        'cr amount',
        'cr'
      ]
    )

  const debitCol =
    findColumn(
      headers,
      [
        'debit amount',
        'debit',
        'withdrawal',
        'withdrawal amount',
        'dr amount',
        'dr'
      ]
    )

  const amountCol =
    findColumn(
      headers,
      [
        'amount',
        'transaction amount'
      ]
    )

  const typeCol =
    findColumn(
      headers,
      [
        'type',
        'transaction type',
        'dr cr',
        'debit credit'
      ]
    )

  const balanceCol =
    findColumn(
      headers,
      [
        'balance',
        'closing balance',
        'running balance'
      ]
    )

  if (!dateCol) {
    throw new Error(
      'Could not identify the transaction date column. Please export the bank statement with a Date/Transaction Date column.'
    )
  }

  const rows = []

  let skipped = 0

  raw.forEach(
    (item) => {
      const transactionDate =
        parsePossibleDate(
          item[dateCol]
        )

      if (
        !transactionDate ||
        !transactionDate.startsWith(
          selectedMonth
        )
      ) {
        skipped += 1
        return
      }

      let credit =
        creditCol
          ? parseMoney(
              item[
                creditCol
              ]
            )
          : 0

      let debit =
        debitCol
          ? parseMoney(
              item[
                debitCol
              ]
            )
          : 0

      if (
        !credit &&
        !debit &&
        amountCol
      ) {
        const rawAmount =
          parseMoney(
            item[
              amountCol
            ]
          )

        const amount =
          Math.abs(
            rawAmount
          )

        const type =
          typeCol
            ? normalizeHeader(
                item[
                  typeCol
                ]
              )
            : ''

        if (
          type.includes(
            'cr'
          ) ||
          type.includes(
            'credit'
          ) ||
          type.includes(
            'deposit'
          )
        ) {
          credit =
            amount
        } else if (
          type.includes(
            'dr'
          ) ||
          type.includes(
            'debit'
          ) ||
          type.includes(
            'withdraw'
          )
        ) {
          debit =
            amount
        } else if (
          rawAmount < 0
        ) {
          debit =
            amount
        } else {
          credit =
            amount
        }
      }

      if (
        !credit &&
        !debit
      ) {
        skipped += 1
        return
      }

      const description =
        descCol
          ? String(
              item[
                descCol
              ] || ''
            )
          : ''

      rows.push({
        transaction_date:
          transactionDate,

        description,

        reference_no:
          refCol
            ? String(
                item[
                  refCol
                ] || ''
              )
            : extractReference(
                description
              ),

        credit,

        debit,

        balance:
          balanceCol
            ? parseMoney(
                item[
                  balanceCol
                ]
              )
            : null
      })
    }
  )

  return {
    rows,

    skipped,

    message:
      `${rows.length} transaction(s) from ${monthLabel(
        selectedMonth
      )} were found.`
  }
}


// =========================================================
// Main Bank Statement parser
// =========================================================

export async function parseBankStatementFile(
  file,
  selectedMonth
) {
  if (!file) {
    throw new Error(
      'Bank statement file is required.'
    )
  }

  const ext =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()

  if (
    ext === 'pdf'
  ) {
    return parsePdfBankStatement(
      file,
      selectedMonth
    )
  }

  if (
    ['csv', 'xls', 'xlsx'].includes(
      ext
    )
  ) {
    return parseSpreadsheetBankStatement(
      file,
      selectedMonth,
      ext
    )
  }

  throw new Error(
    'Unsupported bank statement file. Please upload PDF, CSV, XLS or XLSX.'
  )
}


// =========================================================
// Bank reconciliation
// =========================================================

export function reconcileCandidate(
  bankTxn,
  entries,
  kind
) {
  const amount =
    kind === 'INCOME'
      ? Number(
          bankTxn.credit || 0
        )
      : Number(
          bankTxn.debit || 0
        )

  const ref =
    normalizeHeader(
      bankTxn.reference_no
    )

  const bankDate =
    new Date(
      `${bankTxn.transaction_date}T00:00:00`
    )

  const candidates =
    entries
      .filter(
        (e) =>
          e.payment_mode !==
          'CASH'
      )
      .filter(
        (e) =>
          Math.abs(
            Number(
              e.amount || 0
            ) -
            amount
          ) < 0.01
      )
      .map(
        (entry) => {
          const entryRef =
            normalizeHeader(
              entry.reference_no ||
              entry.cheque_no
            )

          const entryDateValue =
            kind === 'INCOME'
              ? (
                  entry.payment_date ||
                  entry.receipt_date
                )
              : entry.expense_date

          const entryDate =
            new Date(
              `${entryDateValue}T00:00:00`
            )

          const days =
            Math.abs(
              Math.round(
                (
                  bankDate -
                  entryDate
                ) /
                86400000
              )
            )

          let score = 0

          let method =
            'AMOUNT'

          if (
            ref &&
            entryRef &&
            (
              ref.includes(
                entryRef
              ) ||
              entryRef.includes(
                ref
              )
            )
          ) {
            score += 100

            method =
              'REFERENCE'
          }

          if (
            days === 0
          ) {
            score += 25
          } else if (
            days <= 2
          ) {
            score += 15
          } else if (
            days <= 5
          ) {
            score += 5
          }

          return {
            entry,
            score,
            method,
            days
          }
        }
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      )

  return (
    candidates[0] ||
    null
  )
}


// =========================================================
// Cash / bank balances
// =========================================================

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
  const closingCash =
    Number(openingCash) +
    Number(incomeCash) +
    Number(cashWithdrawn) -
    Number(expenseCash) -
    Number(cashDeposited)

  const closingBank =
    Number(openingBank) +
    Number(incomeBank) +
    Number(cashDeposited) -
    Number(expenseBank) -
    Number(cashWithdrawn)

  return {
    closingCash,

    closingBank,

    closingTotal:
      closingCash +
      closingBank,

    openingTotal:
      Number(
        openingCash
      ) +
      Number(
        openingBank
      ),

    netMovement:
      Number(
        incomeCash
      ) +
      Number(
        incomeBank
      ) -
      Number(
        expenseCash
      ) -
      Number(
        expenseBank
      )
  }
}