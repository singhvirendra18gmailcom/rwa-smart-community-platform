import { useEffect, useState } from 'react'

import {
  Building2,
  Moon,
  Users,
  LogOut,
  ArrowRight,
  ClipboardCheck,
  MessageSquareWarning
} from 'lucide-react'

import './App.css'

import { supabase } from './supabase'

import Login from './Login'
import Attendance from './Attendance'
import ManageStaff from './ManageStaff'
import TowerInspection from './TowerInspection'
import Complaints from './Complaints'

import RwbotHome from './rwbot/RwbotHome'
import RwbotChangePassword from './rwbot/RwbotChangePassword'
import RwbotChat from './rwbot/RwbotChat'
import RwbotDocuments from './rwbot/RwbotDocuments'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [screen, setScreen] = useState('dashboard')

  const [rwbotProfile, setRwbotProfile] = useState(null)

  const [
    profileCheckedForUser,
    setProfileCheckedForUser
  ] = useState(null)

  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    const initialiseAuth = async () => {
      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession()

      setSession(currentSession)
      setAuthLoading(false)
    }

    initialiseAuth()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession)

        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT'
        ) {
          setScreen('dashboard')
        }

        if (!newSession) {
          setRwbotProfile(null)
          setProfileCheckedForUser(null)
          setProfileError('')
        }

        setAuthLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id) {
      setRwbotProfile(null)
      setProfileCheckedForUser(null)
      return
    }

    const userId = session.user.id

    let cancelled = false

    const loadProfile = async () => {
      setProfileError('')

      const {
        data,
        error
      } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          role,
          active,
          must_change_password,
          flat:flats (
            id,
            flat_no,
            tower_no,
            unit_no,
            floor_code,
            floor_name
          )
        `)
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (error) {
        console.error(
          'RWBOT profile lookup failed:',
          error
        )

        setProfileError(
          'Unable to verify user profile.'
        )

        setRwbotProfile(null)
        setProfileCheckedForUser(userId)

        return
      }

      setRwbotProfile(data)
      setProfileCheckedForUser(userId)
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const handleLogout = async () => {
    setScreen('dashboard')
    setRwbotProfile(null)
    setProfileCheckedForUser(null)
    setProfileError('')

    await supabase.auth.signOut()
  }

  const handleRwbotPasswordCompleted = () => {
    setRwbotProfile((current) => ({
      ...current,
      must_change_password: false
    }))
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

  if (
    profileCheckedForUser !==
    session.user.id
  ) {
    return (
      <div className="app-shell">
        <main className="page-content">
          <p>Loading...</p>
        </main>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="app-shell">
        <main className="page-content">

          <h2>
            Unable to load account
          </h2>

          <p>
            {profileError}
          </p>

          <button onClick={handleLogout}>
            Logout
          </button>

        </main>
      </div>
    )
  }

  /*
   * ======================================================
   * RWBOT USER
   * ======================================================
   */

  if (rwbotProfile) {
    if (!rwbotProfile.active) {
      return (
        <div className="app-shell">
          <main className="page-content">

            <h2>
              RWBOT Account Disabled
            </h2>

            <p>
              Please contact RWA Pocket-A
              for assistance.
            </p>

            <button onClick={handleLogout}>
              Logout
            </button>

          </main>
        </div>
      )
    }

    if (
      rwbotProfile.must_change_password
    ) {
      return (
        <RwbotChangePassword
          profile={rwbotProfile}
          onCompleted={
            handleRwbotPasswordCompleted
          }
        />
      )
    }

    if (screen === 'rwbot-chat') {
      return (
        <RwbotChat
          profile={rwbotProfile}
          onBack={() =>
            setScreen('dashboard')
          }
        />
      )
    }

    if (
      screen === 'rwbot-documents' &&
      rwbotProfile.role === 'RWA_MEMBER'
    ) {
      return (
        <RwbotDocuments
          profile={rwbotProfile}
          onBack={() =>
            setScreen('dashboard')
          }
        />
      )
    }

    return (
      <RwbotHome
        profile={rwbotProfile}
        onLogout={handleLogout}
        onAsk={() =>
          setScreen('rwbot-chat')
        }
        onManageDocuments={() =>
          setScreen('rwbot-documents')
        }
      />
    )
  }

  /*
   * ======================================================
   * EXISTING SUPERVISOR APP
   * ======================================================
   */

  if (screen === 'manage-staff') {
    return (
      <ManageStaff
        onBack={() =>
          setScreen('dashboard')
        }
      />
    )
  }

  if (screen === 'attendance') {
    return (
      <Attendance
        onBack={() =>
          setScreen('dashboard')
        }
        onManageStaff={() =>
          setScreen('manage-staff')
        }
      />
    )
  }

  if (screen === 'tower-inspection') {
    return (
      <TowerInspection
        onBack={() =>
          setScreen('dashboard')
        }
      />
    )
  }

  if (screen === 'complaints') {
    return (
      <Complaints
        onBack={() =>
          setScreen('dashboard')
        }
      />
    )
  }

  return (
    <div className="app-shell">

      <header className="app-hero dashboard-hero">

        <div className="brand-row">

          <div className="brand-icon">
            <Building2
              size={28}
              strokeWidth={1.8}
            />
          </div>

          <div className="brand-copy">

            <h1>
              RWA Pocket-A
            </h1>

            <p>
              Sector -105 Noida
            </p>

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

          <h2>
            Hello, Supervisor
          </h2>

          <p>
            Manage and monitor daily RWA operations
          </p>

        </div>

        <button
          className="feature-card feature-patrol"
          onClick={() => {
            window.location.href =
              'https://rwa-pocket-a.singh-virendra18.workers.dev/?view=report'
          }}
        >

          <div className="feature-icon feature-icon-purple">

            <Moon
              size={27}
              strokeWidth={1.8}
            />

          </div>

          <div className="feature-text">

            <h3>
              Night Patrol Report
            </h3>

            <p>
              View and share last night's patrol report
            </p>

          </div>

          <ArrowRight size={20} />

        </button>

        <button
          className="feature-card feature-attendance"
          onClick={() =>
            setScreen('attendance')
          }
        >

          <div className="feature-icon feature-icon-green">

            <Users
              size={27}
              strokeWidth={1.8}
            />

          </div>

          <div className="feature-text">

            <h3>
              Staff Attendance
            </h3>

            <p>
              Mark today's attendance and share on WhatsApp
            </p>

          </div>

          <ArrowRight size={20} />

        </button>

        <button
          className="feature-card feature-manage"
          onClick={() =>
            setScreen('tower-inspection')
          }
        >

          <div className="feature-icon feature-icon-blue">

            <ClipboardCheck
              size={27}
              strokeWidth={1.8}
            />

          </div>

          <div className="feature-text">

            <h3>
              Tower Inspection
            </h3>

            <p>
              Scan tower QR, verify GPS and submit inspection
            </p>

          </div>

          <ArrowRight size={20} />

        </button>

        <button
          className="feature-card feature-patrol"
          onClick={() =>
            setScreen('complaints')
          }
        >

          <div className="feature-icon feature-icon-purple">

            <MessageSquareWarning
              size={27}
              strokeWidth={1.8}
            />

          </div>

          <div className="feature-text">

            <h3>
              Complaints
            </h3>

            <p>
              View and acknowledge resident complaints
            </p>

          </div>

          <ArrowRight size={20} />

        </button>

      </main>

      <footer className="app-footer">

        <strong>
          RWA Pocket-A
        </strong>

        <span>•</span>

        <span>
          Sector -105 Noida
        </span>

      </footer>

    </div>
  )
}

export default App