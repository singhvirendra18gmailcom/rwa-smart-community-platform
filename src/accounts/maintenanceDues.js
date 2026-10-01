function normalizeMonth(value) {
  if (!value) return ''
  return String(value).slice(0, 7)
}

function monthToIndex(month) {
  const [year, mon] = normalizeMonth(month).split('-').map(Number)
  if (!year || !mon) return null
  return year * 12 + (mon - 1)
}

function indexToMonth(index) {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthsInclusive(fromMonth, toMonth) {
  const start = monthToIndex(fromMonth)
  const end = monthToIndex(toMonth)
  if (start == null || end == null || end < start) return []

  const result = []
  for (let i = start; i <= end; i += 1) {
    result.push(indexToMonth(i))
  }
  return result
}

export function rateForMonth(rates, month) {
  const target = monthToIndex(month)
  if (target == null) return null

  let selected = null
  for (const rate of rates || []) {
    if (rate.active === false) continue
    const effective = monthToIndex(rate.effective_from)
    if (effective == null || effective > target) continue

    if (!selected || effective > monthToIndex(selected.effective_from)) {
      selected = rate
    }
  }

  return selected ? Number(selected.monthly_amount || 0) : null
}

export function maintenanceTrackingStart(rates) {
  const active = (rates || [])
    .filter((rate) => rate.active !== false && normalizeMonth(rate.effective_from))
    .sort((a, b) => normalizeMonth(a.effective_from).localeCompare(normalizeMonth(b.effective_from)))

  return active[0] ? normalizeMonth(active[0].effective_from) : ''
}

export function buildPaidMonths(entries) {
  const paidByFlat = new Map()

  for (const entry of entries || []) {
    const flatNo = String(entry.flat_no || '').trim().toUpperCase()
    if (!flatNo) continue

    const fromMonth = normalizeMonth(entry.maintenance_from)
    const toMonth = normalizeMonth(entry.maintenance_to)
    if (!fromMonth || !toMonth) continue

    const set = paidByFlat.get(flatNo) || new Set()
    for (const month of monthsInclusive(fromMonth, toMonth)) {
      set.add(month)
    }
    paidByFlat.set(flatNo, set)
  }

  return paidByFlat
}

export function calculateMaintenanceDues({ flats, entries, rates, reportMonth }) {
  const startMonth = maintenanceTrackingStart(rates)
  const targetMonth = normalizeMonth(reportMonth)

  if (!startMonth || !targetMonth || targetMonth < startMonth) {
    return []
  }

  const paidByFlat = buildPaidMonths(entries)
  const chargeMonths = monthsInclusive(startMonth, targetMonth)
    .map((month) => ({ month, amount: rateForMonth(rates, month) }))
    .filter((item) => item.amount != null)

  return (flats || [])
    .filter((flat) => flat.active !== false)
    .map((flat) => {
      const flatNo = String(flat.flat_no || '').trim().toUpperCase()
      const paid = paidByFlat.get(flatNo) || new Set()
      const due = chargeMonths.filter((item) => !paid.has(item.month))
      const paidChargeMonths = chargeMonths.filter((item) => paid.has(item.month))

      const flatEntries = (entries || []).filter(
        (entry) => String(entry.flat_no || '').trim().toUpperCase() === flatNo
      )

      const paidThrough = flatEntries.reduce((latest, entry) => {
        const value = normalizeMonth(entry.maintenance_to)
        return value && (!latest || value > latest) ? value : latest
      }, '')

      const totalPaid = flatEntries.reduce(
        (sum, entry) => sum + Number(entry.amount || 0),
        0
      )

      return {
        ...flat,
        owner_name: flat.owner_name || flat.resident_name || '',
        due_months: due.map((item) => item.month),
        due_month_count: due.length,
        due_amount: due.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        oldest_due_month: due[0]?.month || '',
        paid_month_count: paidChargeMonths.length,
        paid_through: paidThrough,
        total_maintenance_paid: totalPaid,
        maintenance_receipts: flatEntries
      }
    })
    .sort((a, b) => {
      if (b.due_amount !== a.due_amount) return b.due_amount - a.due_amount
      return String(a.flat_no).localeCompare(String(b.flat_no), undefined, { numeric: true })
    })
}

export function flatPaymentRecord(entries, flatNo) {
  const normalized = String(flatNo || '').trim().toUpperCase()

  return (entries || [])
    .filter((entry) => String(entry.flat_no || '').trim().toUpperCase() === normalized)
    .sort((a, b) => {
      const byDate = String(b.receipt_date || '').localeCompare(String(a.receipt_date || ''))
      if (byDate) return byDate
      return String(b.receipt_no || '').localeCompare(String(a.receipt_no || ''))
    })
}
