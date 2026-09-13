import { useEffect, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings2,
  WalletCards,
  X
} from 'lucide-react'
import { supabase } from '../supabase'
import './Accounts.css'
import Dashboard from './pages/Dashboard'
import IncomeEntry from './pages/IncomeEntry'
import ExpenseEntry from './pages/ExpenseEntry'
import Transactions from './pages/Transactions'
import BankStatement from './pages/BankStatement'
import MonthlyStatement from './pages/MonthlyStatement'
import Reports from './pages/Reports'
import MasterData from './pages/MasterData'
import Settings from './pages/Settings'
import { currentMonthKey } from './utils'

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'income', label: 'Income Entry', icon: ArrowUpCircle },
  { id: 'expense', label: 'Expense Entry', icon: ArrowDownCircle },
  { id: 'transactions', label: 'Transactions', icon: ListChecks },
  { id: 'bank', label: 'Bank Statement', icon: Landmark },
  { id: 'statement', label: 'Monthly Statement', icon: FileText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'master', label: 'Master Data', icon: Building2 },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export default function AccountsApp({ onBack }) {
  const [screen, setScreen] = useState('dashboard')
  const [month, setMonth] = useState(currentMonthKey())
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userLabel, setUserLabel] = useState('RWA Member')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email
      if (email) setUserLabel(email.split('@')[0])
    })
  }, [])

  function navigate(id) {
    setScreen(id)
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  let content = null
  if (screen === 'dashboard') content = <Dashboard navigate={navigate} month={month} setMonth={setMonth} />
  if (screen === 'income') content = <IncomeEntry appMonth={month} setAppMonth={setMonth} />
  if (screen === 'expense') content = <ExpenseEntry appMonth={month} setAppMonth={setMonth} />
  if (screen === 'transactions') content = <Transactions month={month} setMonth={setMonth} />
  if (screen === 'bank') content = <BankStatement month={month} setMonth={setMonth} />
  if (screen === 'statement') content = <MonthlyStatement month={month} setMonth={setMonth} />
  if (screen === 'reports') content = <Reports month={month} setMonth={setMonth} />
  if (screen === 'master') content = <MasterData />
  if (screen === 'settings') content = <Settings />

  return (
    <div className={`accounts-app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`accounts-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="accounts-brand">
          <div className="accounts-brand-icon"><Building2 size={27} /></div>
          {!collapsed ? <div><strong>RWA Pocket-A</strong><span>Accounts Management</span></div> : null}
          <button className="accounts-mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>

        <nav className="accounts-nav">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)} title={collapsed ? item.label : undefined}>
                <Icon size={20} strokeWidth={1.9} />
                {!collapsed ? <span>{item.label}</span> : null}
              </button>
            )
          })}
        </nav>

        <div className="accounts-sidebar-bottom">
          <button className="accounts-back-button" onClick={onBack} title="Back to RWA Dashboard"><ArrowLeft size={18} />{!collapsed ? <span>RWA Dashboard</span> : null}</button>
          <div className="accounts-community-mark"><Building2 size={30} />{!collapsed ? <><strong>Together</strong><span>for a Better Community</span></> : null}</div>
        </div>
      </aside>

      {mobileOpen ? <button className="accounts-overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} /> : null}

      <div className="accounts-main-shell">
        <header className="accounts-topbar">
          <div className="accounts-topbar-left">
            <button className="accounts-menu-mobile" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
            <button className="accounts-collapse" onClick={() => setCollapsed((x) => !x)}>{collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}</button>
            <WalletCards size={22} />
            <div><strong>RWA Pocket-A</strong><span>Income & Expense Management</span></div>
          </div>
          <div className="accounts-user">
            <div className="accounts-avatar">{userLabel.slice(0, 2).toUpperCase()}</div>
            <div><strong>{userLabel}</strong><span>Authorised User</span></div>
          </div>
        </header>

        <main className="accounts-content">{content}</main>
        <footer className="accounts-footer"><span>RWA Pocket-A · Accounts Management</span><span>Cash + Bank · Reconciled · Transparent</span></footer>
      </div>
    </div>
  )
}
