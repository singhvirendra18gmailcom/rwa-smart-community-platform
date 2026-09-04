import { useState } from 'react'
import './App.css'

import Attendance from './Attendance'
import ManageStaff from './ManageStaff'

function App() {
  const [screen, setScreen] = useState('dashboard')

  // Manage Staff screen
  if (screen === 'manage-staff') {
    return (
      <ManageStaff
        onBack={() => setScreen('attendance')}
      />
    )
  }

  // Staff Attendance screen
  if (screen === 'attendance') {
    return (
      <Attendance
        onBack={() => setScreen('dashboard')}
        onManageStaff={() => setScreen('manage-staff')}
      />
    )
  }

  // Supervisor Dashboard
  return (
    <div className="app">

      <header className="header">
        <div>
          <h1>RWA Pocket-A</h1>
          <p>RWA AI</p>
        </div>
      </header>

      <main className="dashboard">

        <div className="welcome">
          <h2>Supervisor Dashboard</h2>
          <p>Select an activity</p>
        </div>

        {/* NIGHT PATROL */}
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

        {/* STAFF ATTENDANCE */}
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