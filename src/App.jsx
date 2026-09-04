import { useEffect, useState } from 'react'
import {
  Building2,
  Moon,
  Users,
  Settings,
  LogOut,
  ArrowRight
} from 'lucide-react'

import './App.css'

import { supabase } from './supabase'
import Login from './Login'
import Attendance from './Attendance'
import ManageStaff from './ManageStaff'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [screen, setScreen] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setAuthLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setScreen('dashboard')
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <main className="page-content">
          <p>Loading...</p>
        </main>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (screen === 'manage-staff') {
    return (
      <ManageStaff
        onBack={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'attendance') {
    return (
      <Attendance
        onBack={() => setScreen('dashboard')}
        onManageStaff={() => setScreen('manage-staff')}
      />
    )
  }

  return (
    <div className="app-shell">

      <header className="app-hero dashboard-hero">

        <div className="brand-row">

          <div className="brand-icon">
            <Building2 size={28} strokeWidth={1.8} />
          </div>

          <div className="brand-copy">
            <h1>RWA Pocket-A</h1>
            <p>Sector -105 Noida</p>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Logout
          </button>

        </div>

        <div className="brand-tagline">
          Safer Homes • Stronger Community
        </div>

      </header>

      <main className="page-content">

        <div className="dashboard-welcome">
          <h2>Hello, Supervisor</h2>
          <p>Manage and monitor daily RWA operations</p>
        </div>

        <button
          className="feature-card feature-patrol"
          onClick={() => {
            window.location.href =
              'https://rwa-pocket-a.singh-virendra18.workers.dev/?view=report'
          }}
        >
          <div className="feature-icon feature-icon-purple">
            <Moon size={27} strokeWidth={1.8} />
          </div>

          <div className="feature-text">
            <h3>Night Patrol Report</h3>
            <p>
              View and share last night's patrol report
            </p>
          </div>

          <ArrowRight size={20} />
        </button>

        <button
          className="feature-card feature-attendance"
          onClick={() => setScreen('attendance')}
        >
          <div className="feature-icon feature-icon-green">
            <Users size={27} strokeWidth={1.8} />
          </div>

          <div className="feature-text">
            <h3>Staff Attendance</h3>
            <p>
              Mark today's attendance and share on WhatsApp
            </p>
          </div>

          <ArrowRight size={20} />
        </button>

        <button
          className="feature-card feature-manage"
          onClick={() => setScreen('manage-staff')}
        >
          <div className="feature-icon feature-icon-blue">
            <Settings size={27} strokeWidth={1.8} />
          </div>

          <div className="feature-text">
            <h3>Manage Staff</h3>
            <p>
              Add or update staff details
            </p>
          </div>

          <ArrowRight size={20} />
        </button>

      </main>

      <footer className="app-footer">
        <strong>RWA Pocket-A</strong>
        <span>•</span>
        <span>Sector -105 Noida</span>
      </footer>

    </div>
  )
}

export default App