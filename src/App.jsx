import { useEffect, useState } from 'react'
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
      <div className="app">
        <main className="dashboard">
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
        onBack={() => setScreen('attendance')}
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
    <div className="app">

      <header className="header dashboard-header">

        <div>
          <h1>RWA Pocket-A</h1>
          <p>RWA AI</p>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Logout
        </button>

      </header>

      <main className="dashboard">

        <div className="welcome">
          <h2>Supervisor Dashboard</h2>
          <p>Select an activity</p>
        </div>

        <button
          className="card patrol"
          onClick={() => {
            window.location.href =
              'https://rwa-pocket-a.singh-virendra18.workers.dev/?view=report'
          }}
        >
          <span className="icon">🌙</span>

          <div className="cardText">
            <h3>Night Patrol Report</h3>
            <p>View and share last night's patrol report</p>
          </div>

          <span className="arrow">›</span>
        </button>

        <button
          className="card attendance"
          onClick={() => setScreen('attendance')}
        >
          <span className="icon">👥</span>

          <div className="cardText">
            <h3>Staff Attendance</h3>
            <p>Mark today's attendance and share on WhatsApp</p>
          </div>

          <span className="arrow">›</span>
        </button>

      </main>

      <footer>
        RWA Pocket-A Sector -105 Noida
      </footer>

    </div>
  )
}

export default App