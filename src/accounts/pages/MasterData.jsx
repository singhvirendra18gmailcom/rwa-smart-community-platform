import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Tags,
} from 'lucide-react'
import {
  getBankAccounts,
  getExpenseHeads,
  getFlatsWithResidents,
  getIncomeHeads,
  saveBankAccount,
  saveExpenseHead,
  saveIncomeHead
} from '../api'
import { EmptyState, Field, LoadingBlock, Message, PageHeader, Section, StatusBadge } from '../components/Common'

export default function MasterData() {
  const [tab, setTab] = useState('income')
  const [incomeHeads, setIncomeHeads] = useState([])
  const [expenseHeads, setExpenseHeads] = useState([])
  const [flats, setFlats] = useState([])
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')
  const [headForm, setHeadForm] = useState({ id: null, name: '', display_order: 100, active: true })
  const [bankForm, setBankForm] = useState({ id: null, bank_name: '', account_name: 'RWA Pocket-A', account_no_last4: '', ifsc: '', active: true })

  async function refresh() {
    setLoading(true)
    try {
      const [i, e, f, b] = await Promise.all([
        getIncomeHeads(false),
        getExpenseHeads(false),
        getFlatsWithResidents(),
        getBankAccounts()
      ])
      setIncomeHeads(i)
      setExpenseHeads(e)
      setFlats(f)
      setBanks(b)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to load master data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const currentHeads = tab === 'income' ? incomeHeads : expenseHeads
  const filteredHeads = currentHeads.filter((x) => !search.trim() || x.name.toLowerCase().includes(search.toLowerCase()))
  const filteredFlats = useMemo(() => flats.filter((x) => !search.trim() || `${x.flat_no} ${x.flat_code} ${x.resident_name}`.toLowerCase().includes(search.toLowerCase())), [flats, search])

  function changeTab(next) {
    setTab(next)
    setSearch('')
    setHeadForm({ id: null, name: '', display_order: 100, active: true })
    setBankForm({ id: null, bank_name: '', account_name: 'RWA Pocket-A', account_no_last4: '', ifsc: '', active: true })
  }

  async function saveHead(e) {
    e.preventDefault()
    if (!headForm.name.trim()) return
    try {
      const payload = { ...headForm, name: headForm.name.trim(), display_order: Number(headForm.display_order || 100) }
      if (tab === 'income') await saveIncomeHead(payload)
      else await saveExpenseHead(payload)
      setMessage({ type: 'success', text: `${tab === 'income' ? 'Income' : 'Expense'} head saved.` })
      setHeadForm({ id: null, name: '', display_order: 100, active: true })
      await refresh()
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save head.' })
    }
  }

  async function toggleHead(row) {
    try {
      const payload = { ...row, active: !row.active }
      if (tab === 'income') await saveIncomeHead(payload)
      else await saveExpenseHead(payload)
      await refresh()
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to update head.' })
    }
  }

  async function submitBank(e) {
    e.preventDefault()
    if (!bankForm.bank_name.trim()) return
    try {
      await saveBankAccount({ ...bankForm, bank_name: bankForm.bank_name.trim(), account_name: bankForm.account_name.trim() || 'RWA Pocket-A' })
      setMessage({ type: 'success', text: 'Bank account saved.' })
      setBankForm({ id: null, bank_name: '', account_name: 'RWA Pocket-A', account_no_last4: '', ifsc: '', active: true })
      await refresh()
    } catch (e2) {
      setMessage({ type: 'error', text: e2.message || 'Unable to save bank account.' })
    }
  }

  return (
    <>
      <PageHeader title="Master Data" subtitle="Manage the lists used by the Accounts module" />
      {message ? <Message type={message.type} onClose={() => setMessage(null)}>{message.text}</Message> : null}

      <div className="acc-master-tabs">
        <button className={tab === 'income' ? 'active' : ''} onClick={() => changeTab('income')}><Tags size={20} /><span>Income Heads</span><small>{incomeHeads.length}</small></button>
        <button className={tab === 'expense' ? 'active' : ''} onClick={() => changeTab('expense')}><Tags size={20} /><span>Expense Heads</span><small>{expenseHeads.length}</small></button>
        <button className={tab === 'flats' ? 'active' : ''} onClick={() => changeTab('flats')}><Building2 size={20} /><span>Flats & Residents</span><small>{flats.length}</small></button>
        <button className={tab === 'banks' ? 'active' : ''} onClick={() => changeTab('banks')}><Landmark size={20} /><span>Bank Accounts</span><small>{banks.length}</small></button>
      </div>

      {loading ? <LoadingBlock text="Loading master data..." /> : null}

      {!loading && (tab === 'income' || tab === 'expense') ? (
        <div className="acc-master-layout">
          <Section
            title={tab === 'income' ? 'Income Heads' : 'Expense Heads'}
            subtitle="These heads are used in daily entries and monthly reports"
            actions={<div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search heads" /></div>}
          >
            {filteredHeads.length ? (
              <div className="acc-table-wrap"><table className="acc-table"><thead><tr><th>#</th><th>Head Name</th><th>Order</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredHeads.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td><strong>{row.name}</strong></td><td>{row.display_order}</td><td><StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /></td><td><div className="acc-row-actions"><button onClick={() => setHeadForm({ ...row })}><Pencil size={15} /></button><button className="acc-mini-button secondary" onClick={() => toggleHead(row)}>{row.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div>
            ) : <EmptyState>No matching heads.</EmptyState>}
          </Section>

          <Section title={headForm.id ? 'Edit Head' : 'Add New Head'}>
            <form className="acc-stack-form" onSubmit={saveHead}>
              <Field label="Head Name" required><input value={headForm.name} onChange={(e) => setHeadForm({ ...headForm, name: e.target.value })} placeholder={tab === 'income' ? 'e.g. Community Hall Charges' : 'e.g. Lift Maintenance'} /></Field>
              <Field label="Display Order"><input type="number" value={headForm.display_order} onChange={(e) => setHeadForm({ ...headForm, display_order: e.target.value })} /></Field>
              <label className="acc-toggle-row"><input type="checkbox" checked={headForm.active} onChange={(e) => setHeadForm({ ...headForm, active: e.target.checked })} /><span><strong>Active</strong><small>Show this head in entry screens</small></span></label>
              <button className="acc-button primary"><Plus size={16} /> {headForm.id ? 'Update Head' : 'Add Head'}</button>
            </form>
          </Section>
        </div>
      ) : null}

      {!loading && tab === 'flats' ? (
        <Section title="Flats & Residents" subtitle="Read from the existing RWA flats/profiles master so Accounts does not duplicate resident data" actions={<div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flat or resident" /></div>}>
          {filteredFlats.length ? (
            <div className="acc-table-wrap"><table className="acc-table"><thead><tr><th>#</th><th>Tower</th><th>Flat No.</th><th>Flat Code</th><th>Resident Name</th><th>Status</th></tr></thead><tbody>{filteredFlats.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td>{row.tower_no}</td><td><strong>{row.flat_no}</strong></td><td>{row.flat_code}</td><td>{row.resident_name || '—'}</td><td><StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /></td></tr>)}</tbody></table></div>
          ) : <EmptyState>No flats available. The Accounts module will still allow manual resident/flat entry.</EmptyState>}
        </Section>
      ) : null}

      {!loading && tab === 'banks' ? (
        <div className="acc-master-layout">
          <Section title="RWA Bank Accounts" subtitle="Basic bank details used for statements and reports">
            {banks.length ? <div className="acc-bank-card-list">{banks.map((row) => <button key={row.id} className="acc-bank-card" onClick={() => setBankForm({ ...row })}><Landmark size={24} /><div><strong>{row.bank_name}</strong><span>{row.account_name}</span><small>{row.account_no_last4 ? `Account ending ${row.account_no_last4}` : 'Account number not stored'} {row.ifsc ? `· ${row.ifsc}` : ''}</small></div><StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /></button>)}</div> : <EmptyState>No bank account configured.</EmptyState>}
          </Section>
          <Section title={bankForm.id ? 'Edit Bank Account' : 'Add Bank Account'}>
            <form className="acc-stack-form" onSubmit={submitBank}>
              <Field label="Bank Name" required><input value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} placeholder="e.g. HDFC Bank" /></Field>
              <Field label="Account Name"><input value={bankForm.account_name} onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })} /></Field>
              <Field label="Account Number - Last 4 digits"><input maxLength="4" value={bankForm.account_no_last4 || ''} onChange={(e) => setBankForm({ ...bankForm, account_no_last4: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="IFSC"><input value={bankForm.ifsc || ''} onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value.toUpperCase() })} /></Field>
              <label className="acc-toggle-row"><input type="checkbox" checked={bankForm.active} onChange={(e) => setBankForm({ ...bankForm, active: e.target.checked })} /><span><strong>Active account</strong><small>Use for current RWA banking</small></span></label>
              <button className="acc-button primary"><Plus size={16} /> {bankForm.id ? 'Update Bank' : 'Add Bank'}</button>
            </form>
          </Section>
        </div>
      ) : null}
    </>
  )
}
