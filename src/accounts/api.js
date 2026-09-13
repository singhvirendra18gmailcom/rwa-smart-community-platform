import { supabase } from '../supabase'
import {
  monthRange,
  monthStartFromKey,
  makeSequence,
  splitByPaymentMode,
  calculateBalances
} from './utils'

function throwIfError(result) {
  if (result.error) throw result.error
  return result.data
}

function splitId(payload = {}) {
  const { id, ...data } = payload
  return { id, data }
}

export async function getSettings() {
  const result = await supabase.from('accounts_settings').select('*').eq('id', 1).maybeSingle()
  return throwIfError(result)
}

export async function saveSettings(payload) {
  const result = await supabase.from('accounts_settings').upsert({ id: 1, ...payload }).select().single()
  return throwIfError(result)
}

export async function getIncomeHeads(activeOnly = true) {
  let query = supabase.from('accounts_income_heads').select('*').order('display_order').order('name')
  if (activeOnly) query = query.eq('active', true)
  return throwIfError(await query)
}

export async function getExpenseHeads(activeOnly = true) {
  let query = supabase.from('accounts_expense_heads').select('*').order('display_order').order('name')
  if (activeOnly) query = query.eq('active', true)
  return throwIfError(await query)
}

export async function saveIncomeHead(payload) {
  const { id, data } = splitId(payload)
  const query = id
    ? supabase.from('accounts_income_heads').update(data).eq('id', id)
    : supabase.from('accounts_income_heads').insert(data)
  return throwIfError(await query.select().single())
}

export async function saveExpenseHead(payload) {
  const { id, data } = splitId(payload)
  const query = id
    ? supabase.from('accounts_expense_heads').update(data).eq('id', id)
    : supabase.from('accounts_expense_heads').insert(data)
  return throwIfError(await query.select().single())
}

export async function getMonthIncome(month) {
  const { start, end } = monthRange(month)
  return throwIfError(await supabase
    .from('accounts_income_entries')
    .select('*')
    .gte('receipt_date', start)
    .lte('receipt_date', end)
    .neq('status', 'VOID')
    .order('receipt_date', { ascending: false })
    .order('created_at', { ascending: false }))
}

export async function getMonthExpenses(month) {
  const { start, end } = monthRange(month)
  return throwIfError(await supabase
    .from('accounts_expense_entries')
    .select('*')
    .gte('expense_date', start)
    .lte('expense_date', end)
    .neq('status', 'VOID')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false }))
}

export async function getDayIncome(date) {
  return throwIfError(await supabase
    .from('accounts_income_entries')
    .select('*')
    .eq('receipt_date', date)
    .neq('status', 'VOID')
    .order('created_at', { ascending: false }))
}

export async function getDayExpenses(date) {
  return throwIfError(await supabase
    .from('accounts_expense_entries')
    .select('*')
    .eq('expense_date', date)
    .neq('status', 'VOID')
    .order('created_at', { ascending: false }))
}

async function nextDocumentNo(table, dateColumn, prefix, date) {
  const year = new Date(`${date}T00:00:00`).getFullYear()
  const result = await supabase
    .from(table)
    .select('created_at', { count: 'exact', head: true })
    .gte(dateColumn, `${year}-01-01`)
    .lte(dateColumn, `${year}-12-31`)
  if (result.error) throw result.error
  return makeSequence(prefix, date, Number(result.count || 0) + 1)
}

export async function nextReceiptNo(date, prefix = 'RCP') {
  return nextDocumentNo('accounts_income_entries', 'receipt_date', prefix, date)
}

export async function nextVoucherNo(date, prefix = 'VCH') {
  return nextDocumentNo('accounts_expense_entries', 'expense_date', prefix, date)
}

export async function saveIncomeEntry(payload) {
  const { id, data } = splitId(payload)
  const result = id
    ? await supabase.from('accounts_income_entries').update(data).eq('id', id).select().single()
    : await supabase.from('accounts_income_entries').insert(data).select().single()
  return throwIfError(result)
}

export async function saveExpenseEntry(payload) {
  const { id, data } = splitId(payload)
  const result = id
    ? await supabase.from('accounts_expense_entries').update(data).eq('id', id).select().single()
    : await supabase.from('accounts_expense_entries').insert(data).select().single()
  return throwIfError(result)
}

export async function voidIncomeEntry(id) {
  return throwIfError(await supabase.from('accounts_income_entries').update({ status: 'VOID' }).eq('id', id).select().single())
}

export async function voidExpenseEntry(id) {
  return throwIfError(await supabase.from('accounts_expense_entries').update({ status: 'VOID' }).eq('id', id).select().single())
}

export async function getTransfers(month) {
  const { start, end } = monthRange(month)
  return throwIfError(await supabase
    .from('accounts_cash_bank_transfers')
    .select('*')
    .gte('transfer_date', start)
    .lte('transfer_date', end)
    .order('transfer_date', { ascending: false }))
}

export async function saveTransfer(payload) {
  const { data } = splitId(payload)
  return throwIfError(await supabase.from('accounts_cash_bank_transfers').insert(data).select().single())
}

export async function deleteTransfer(id) {
  return throwIfError(await supabase.from('accounts_cash_bank_transfers').delete().eq('id', id).select().single())
}

export async function getBankStatements(month) {
  return throwIfError(await supabase
    .from('accounts_bank_statements')
    .select('*')
    .eq('statement_month', monthStartFromKey(month))
    .order('uploaded_at', { ascending: false }))
}

export async function saveBankStatement(payload) {
  const { data } = splitId(payload)
  return throwIfError(await supabase.from('accounts_bank_statements').upsert(data, { onConflict: 'statement_month,file_name' }).select().single())
}

export async function clearBankTransactionsForMonth(month) {
  const result = await supabase.from('accounts_bank_transactions').delete().eq('statement_month', monthStartFromKey(month))
  if (result.error) throw result.error
  return true
}

export async function clearBankTransactionsForStatement(statementId) {
  const result = await supabase.from('accounts_bank_transactions').delete().eq('bank_statement_id', statementId)
  if (result.error) throw result.error
  return true
}

export async function saveBankTransactions(rows) {
  if (!rows.length) return []
  const cleanRows = rows.map((row) => splitId(row).data)
  return throwIfError(await supabase.from('accounts_bank_transactions').insert(cleanRows).select())
}

export async function getBankTransactions(month) {
  return throwIfError(await supabase
    .from('accounts_bank_transactions')
    .select('*')
    .eq('statement_month', monthStartFromKey(month))
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true }))
}

export async function matchBankTransaction(bankId, entryId, type, method = 'MANUAL') {
  return throwIfError(await supabase
    .from('accounts_bank_transactions')
    .update({
      reconciliation_status: 'MATCHED',
      matched_type: type,
      matched_entry_id: entryId,
      match_method: method
    })
    .eq('id', bankId)
    .select()
    .single())
}

export async function unmatchBankTransaction(bankId) {
  return throwIfError(await supabase
    .from('accounts_bank_transactions')
    .update({
      reconciliation_status: 'UNMATCHED',
      matched_type: null,
      matched_entry_id: null,
      match_method: null
    })
    .eq('id', bankId)
    .select()
    .single())
}

export async function ignoreBankTransaction(bankId) {
  return throwIfError(await supabase
    .from('accounts_bank_transactions')
    .update({ reconciliation_status: 'IGNORED' })
    .eq('id', bankId)
    .select()
    .single())
}

export async function uploadAccountsDocument(file, path) {
  const result = await supabase.storage.from('accounts-documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined
  })
  if (result.error) throw result.error
  return result.data.path
}

export async function getMonthClosing(month) {
  const result = await supabase
    .from('accounts_month_closings')
    .select('*')
    .eq('statement_month', monthStartFromKey(month))
    .maybeSingle()
  return throwIfError(result)
}

export async function getPreviousClosedMonth(month) {
  const monthStart = monthStartFromKey(month)
  const result = await supabase
    .from('accounts_month_closings')
    .select('*')
    .lt('statement_month', monthStart)
    .eq('is_closed', true)
    .order('statement_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  return throwIfError(result)
}

export async function getOpeningBalances(month, settings) {
  const existing = await getMonthClosing(month)
  if (existing) return { cash: Number(existing.opening_cash || 0), bank: Number(existing.opening_bank || 0), source: 'MONTH_RECORD' }

  const previous = await getPreviousClosedMonth(month)
  if (previous) return { cash: Number(previous.closing_cash || 0), bank: Number(previous.closing_bank || 0), source: 'PREVIOUS_MONTH' }

  if (settings?.initial_opening_month && settings.initial_opening_month.slice(0, 7) === month) {
    return { cash: Number(settings.initial_opening_cash || 0), bank: Number(settings.initial_opening_bank || 0), source: 'SETTINGS' }
  }

  return { cash: 0, bank: 0, source: 'DEFAULT' }
}

export async function buildMonthlyStatement(month) {
  const [settings, income, expenses, transfers, bankTransactions] = await Promise.all([
    getSettings(),
    getMonthIncome(month),
    getMonthExpenses(month),
    getTransfers(month),
    getBankTransactions(month)
  ])

  const opening = await getOpeningBalances(month, settings)
  const incomeSplit = splitByPaymentMode(income)
  const expenseSplit = splitByPaymentMode(expenses)
  const cashDeposited = transfers
    .filter((x) => x.transfer_type === 'CASH_TO_BANK')
    .reduce((a, x) => a + Number(x.amount || 0), 0)
  const cashWithdrawn = transfers
    .filter((x) => x.transfer_type === 'BANK_TO_CASH')
    .reduce((a, x) => a + Number(x.amount || 0), 0)

  const balances = calculateBalances({
    openingCash: opening.cash,
    openingBank: opening.bank,
    incomeCash: incomeSplit.cash,
    incomeBank: incomeSplit.bank,
    expenseCash: expenseSplit.cash,
    expenseBank: expenseSplit.bank,
    cashDeposited,
    cashWithdrawn
  })

  const credits = bankTransactions.filter((x) => Number(x.credit) > 0)
  const debits = bankTransactions.filter((x) => Number(x.debit) > 0)
  const matchedCredits = credits.filter((x) => x.reconciliation_status === 'MATCHED')
  const matchedDebits = debits.filter((x) => x.reconciliation_status === 'MATCHED')

  return {
    month,
    settings,
    income,
    expenses,
    transfers,
    bankTransactions,
    opening,
    incomeSplit,
    expenseSplit,
    cashDeposited,
    cashWithdrawn,
    ...balances,
    reconciliation: {
      creditsTotal: credits.reduce((a, x) => a + Number(x.credit || 0), 0),
      debitsTotal: debits.reduce((a, x) => a + Number(x.debit || 0), 0),
      matchedCredits: matchedCredits.reduce((a, x) => a + Number(x.credit || 0), 0),
      matchedDebits: matchedDebits.reduce((a, x) => a + Number(x.debit || 0), 0),
      unmatchedCount: bankTransactions.filter((x) => x.reconciliation_status === 'UNMATCHED').length
    }
  }
}

export async function closeMonth(month, statement) {
  const payload = {
    statement_month: monthStartFromKey(month),
    opening_cash: statement.opening.cash,
    opening_bank: statement.opening.bank,
    income_cash: statement.incomeSplit.cash,
    income_bank: statement.incomeSplit.bank,
    expense_cash: statement.expenseSplit.cash,
    expense_bank: statement.expenseSplit.bank,
    cash_deposited_to_bank: statement.cashDeposited,
    cash_withdrawn_from_bank: statement.cashWithdrawn,
    closing_cash: statement.closingCash,
    closing_bank: statement.closingBank,
    is_closed: true,
    closed_by: (await supabase.auth.getUser()).data.user?.id || null,
    closed_at: new Date().toISOString()
  }
  return throwIfError(await supabase.from('accounts_month_closings').upsert(payload, { onConflict: 'statement_month' }).select().single())
}

export async function getFlatsWithResidents() {
  const result = await supabase
    .from('flats')
    .select(`
      id,
      unit_no,
      floor_code,
      flat_no,
      floor_name,
      tower_no,
      owner_name,
      active
    `)
    .eq('active', true)
    .order('unit_no', { ascending: true })
    .order('floor_code', { ascending: true })

  if (result.error) {
    console.error('Error loading flats:', result.error)
    throw result.error
  }

  return (result.data || []).map((flat) => ({
    ...flat,
    flat_code: flat.floor_code,
    resident_name: flat.owner_name || ''
  }))
}

export async function reopenMonth(month) {
  return throwIfError(await supabase
    .from('accounts_month_closings')
    .update({ is_closed: false, closed_by: null, closed_at: null })
    .eq('statement_month', monthStartFromKey(month))
    .select()
    .single())
}

export async function getBankAccounts() {
  return throwIfError(await supabase.from('accounts_bank_accounts').select('*').order('created_at'))
}

export async function saveBankAccount(payload) {
  const { id, data } = splitId(payload)
  const query = id
    ? supabase.from('accounts_bank_accounts').update(data).eq('id', id)
    : supabase.from('accounts_bank_accounts').insert(data)
  return throwIfError(await query.select().single())
}
