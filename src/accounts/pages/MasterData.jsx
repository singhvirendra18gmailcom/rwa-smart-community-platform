import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Tags,
  WalletCards,
} from 'lucide-react'
import {
  getBankAccounts,
  getExpenseHeads,
  getIncomeHeads,
  getMaintenanceRates,
  saveBankAccount,
  saveExpenseHead,
  saveIncomeHead,
  saveMaintenanceRate
} from '../api'
import { deriveFlatDetails, getFlatMaster, saveFlat } from '../flatMasterApi'
import { EmptyState, Field, LoadingBlock, Message, PageHeader, Section, StatusBadge } from '../components/Common'

const emptyFlatForm = () => ({
  id: null,
  flat_no: '',
  owner_name: '',
  active: true
})

export default function MasterData() {
  const [tab, setTab] = useState('income')
  const [incomeHeads, setIncomeHeads] = useState([])
  const [expenseHeads, setExpenseHeads] = useState([])
  const [flats, setFlats] = useState([])
  const [banks, setBanks] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')
  const [headForm, setHeadForm] = useState({ id: null, name: '', display_order: 100, active: true })
  const [bankForm, setBankForm] = useState({ id: null, bank_name: '', account_name: 'RWA Pocket-A', account_no_last4: '', ifsc: '', active: true })
  const [flatForm, setFlatForm] = useState(emptyFlatForm())
  const [rateForm, setRateForm] = useState({ id: null, effective_from: '', monthly_amount: '', notes: '', active: true })
  const [savingFlat, setSavingFlat] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [i, e, f, b, r] = await Promise.all([
        getIncomeHeads(false),
        getExpenseHeads(false),
        getFlatMaster(),
        getBankAccounts(),
        getMaintenanceRates(false)
      ])
      setIncomeHeads(i)
      setExpenseHeads(e)
      setFlats(f)
      setBanks(b)
      setRates(r)
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Unable to load master data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const currentHeads = tab === 'income' ? incomeHeads : expenseHeads
  const filteredHeads = currentHeads.filter((x) => !search.trim() || x.name.toLowerCase().includes(search.toLowerCase()))
  const filteredFlats = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return flats
    return flats.filter((x) => `${x.flat_no} ${x.owner_name || ''} ${x.tower_no} ${x.floor_name || ''}`.toLowerCase().includes(q))
  }, [flats, search])

  const flatPreview = useMemo(() => deriveFlatDetails(flatForm.flat_no), [flatForm.flat_no])

  function changeTab(next) {
    setTab(next)
    setSearch('')
    setHeadForm({ id: null, name: '', display_order: 100, active: true })
    setBankForm({ id: null, bank_name: '', account_name: 'RWA Pocket-A', account_no_last4: '', ifsc: '', active: true })
    setFlatForm(emptyFlatForm())
    setRateForm({ id: null, effective_from: '', monthly_amount: '', notes: '', active: true })
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

  async function submitFlat(e) {
    e.preventDefault()
    if (!flatForm.flat_no.trim()) {
      setMessage({ type: 'error', text: 'Flat number is required.' })
      return
    }

    if (!flatPreview) {
      setMessage({ type: 'error', text: 'Enter a valid flat number such as 1A, 12C or 36D.' })
      return
    }

    setSavingFlat(true)
    try {
      await saveFlat(flatForm)
      setMessage({ type: 'success', text: flatForm.id ? 'Flat and resident updated.' : 'Flat and resident added.' })
      setFlatForm(emptyFlatForm())
      await refresh()
    } catch (e2) {
      const duplicate = e2.code === '23505'
      setMessage({
        type: 'error',
        text: duplicate ? 'This flat number already exists. Use Edit to update it.' : (e2.message || 'Unable to save flat and resident.')
      })
    } finally {
      setSavingFlat(false)
    }
  }

  function editFlat(row) {
    setFlatForm({
      id: row.id,
      flat_no: row.flat_no || '',
      owner_name: row.owner_name || '',
      active: row.active !== false
    })
  }

  async function submitRate(e) {
    e.preventDefault()

    if (!rateForm.effective_from || Number(rateForm.monthly_amount || 0) <= 0) {
      setMessage({ type: 'error', text: 'Effective month and monthly maintenance amount are required.' })
      return
    }

    try {
      await saveMaintenanceRate({
        ...rateForm,
        effective_from: rateForm.effective_from + '-01',
        monthly_amount: Number(rateForm.monthly_amount)
      })

      setMessage({ type: 'success', text: rateForm.id ? 'Maintenance rate updated.' : 'Maintenance rate added.' })
      setRateForm({ id: null, effective_from: '', monthly_amount: '', notes: '', active: true })
      await refresh()
    } catch (e2) {
      const duplicate = e2.code === '23505'
      setMessage({
        type: 'error',
        text: duplicate
          ? 'A maintenance rate already exists for this effective month. Edit the existing rate.'
          : (e2.message || 'Unable to save maintenance rate.')
      })
    }
  }

  function editRate(row) {
    setRateForm({
      id: row.id,
      effective_from: row.effective_from ? row.effective_from.slice(0, 7) : '',
      monthly_amount: row.monthly_amount ?? '',
      notes: row.notes || '',
      active: row.active !== false
    })
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
        <button className={tab === 'rates' ? 'active' : ''} onClick={() => changeTab('rates')}><WalletCards size={20} /><span>Maintenance Rates</span><small>{rates.length}</small></button>
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
        <div className="acc-master-layout acc-master-layout-wide">
          <Section
            title="Flats & Residents"
            subtitle="Existing RWA flat master with owner/resident information"
            actions={<div className="acc-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flat or owner" /></div>}
          >
            {filteredFlats.length ? (
              <div className="acc-table-wrap"><table className="acc-table"><thead><tr><th>#</th><th>Tower</th><th>Flat No.</th><th>Floor</th><th>Owner / Resident Name</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredFlats.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td>{row.tower_no}</td><td><strong>{row.flat_no}</strong></td><td>{row.floor_name || row.floor_code || '—'}</td><td>{row.owner_name || '—'}</td><td><StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /></td><td><button className="acc-mini-button secondary" onClick={() => editFlat(row)}><Pencil size={14} /> Edit</button></td></tr>)}</tbody></table></div>
            ) : <EmptyState>No matching flats.</EmptyState>}
          </Section>

          <Section title={flatForm.id ? 'Edit Flat / Resident' : 'Add Flat / Resident'} subtitle="Tower and floor are calculated automatically from the flat number">
            <form className="acc-stack-form" onSubmit={submitFlat}>
              <Field label="Flat No." required>
                <input
                  value={flatForm.flat_no}
                  onChange={(e) => setFlatForm({ ...flatForm, flat_no: e.target.value.toUpperCase() })}
                  placeholder="e.g. 36D"
                />
              </Field>

              <Field label="Owner / Resident Name">
                <input
                  value={flatForm.owner_name}
                  onChange={(e) => setFlatForm({ ...flatForm, owner_name: e.target.value })}
                  placeholder="Enter owner name"
                />
              </Field>

              <div className="acc-flat-preview">
                <div><span>Unit No.</span><strong>{flatPreview?.unit_no ?? '—'}</strong></div>
                <div><span>Tower</span><strong>{flatPreview?.tower_no ?? '—'}</strong></div>
                <div><span>Floor</span><strong>{flatPreview?.floor_name ?? '—'}</strong></div>
              </div>

              <label className="acc-toggle-row"><input type="checkbox" checked={flatForm.active} onChange={(e) => setFlatForm({ ...flatForm, active: e.target.checked })} /><span><strong>Active flat</strong><small>Active flats are available in income entry screens</small></span></label>

              <div className="acc-form-actions-inline">
                {flatForm.id ? <button type="button" className="acc-button secondary" onClick={() => setFlatForm(emptyFlatForm())}>Cancel</button> : null}
                <button className="acc-button primary" disabled={savingFlat}><Plus size={16} /> {savingFlat ? 'Saving...' : (flatForm.id ? 'Update Flat / Resident' : 'Add Flat / Resident')}</button>
              </div>
            </form>
          </Section>
        </div>
      ) : null}

      {!loading && tab === 'rates' ? (
        <div className="acc-master-layout">
          <Section
            title="Maintenance Rate History"
            subtitle="Dues are calculated month-by-month using the rate effective for each month"
          >
            {rates.length ? (
              <div className="acc-table-wrap">
                <table className="acc-table compact">
                  <thead><tr><th>#</th><th>Effective From</th><th className="num">Monthly Amount</th><th>Notes</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {rates.map((row, i) => (
                      <tr key={row.id}>
                        <td>{i + 1}</td>
                        <td><strong>{row.effective_from ? row.effective_from.slice(0, 7) : '—'}</strong></td>
                        <td className="num"><strong>₹ {Number(row.monthly_amount || 0).toLocaleString('en-IN')}</strong></td>
                        <td>{row.notes || '—'}</td>
                        <td><StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                        <td><button className="acc-mini-button secondary" onClick={() => editRate(row)}><Pencil size={14} /> Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState>No maintenance rate configured yet.</EmptyState>}
          </Section>

          <Section
            title={rateForm.id ? 'Edit Maintenance Rate' : 'Add Maintenance Rate'}
            subtitle="The earliest active rate becomes the start month for dues tracking"
          >
            <form className="acc-stack-form" onSubmit={submitRate}>
              <Field label="Effective From" required>
                <input
                  type="month"
                  value={rateForm.effective_from}
                  onChange={(e) => setRateForm({ ...rateForm, effective_from: e.target.value })}
                />
              </Field>

              <Field label="Monthly Maintenance Amount" required>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rateForm.monthly_amount}
                  onChange={(e) => setRateForm({ ...rateForm, monthly_amount: e.target.value })}
                  placeholder="e.g. 1300"
                />
              </Field>

              <Field label="Notes">
                <input
                  value={rateForm.notes}
                  onChange={(e) => setRateForm({ ...rateForm, notes: e.target.value })}
                  placeholder="Optional reason / GBM reference"
                />
              </Field>

              <label className="acc-toggle-row">
                <input
                  type="checkbox"
                  checked={rateForm.active}
                  onChange={(e) => setRateForm({ ...rateForm, active: e.target.checked })}
                />
                <span><strong>Active rate</strong><small>Use this rate in dues calculations</small></span>
              </label>

              <div className="acc-form-actions-inline">
                {rateForm.id ? <button type="button" className="acc-button secondary" onClick={() => setRateForm({ id: null, effective_from: '', monthly_amount: '', notes: '', active: true })}>Cancel</button> : null}
                <button className="acc-button primary"><Plus size={16} /> {rateForm.id ? 'Update Rate' : 'Add Rate'}</button>
              </div>
            </form>
          </Section>
        </div>
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
