import { lazy, Suspense, useEffect, useState } from 'react'

import {
  Building2,
  Moon,
  Users,
  LogOut,
  ArrowRight,
  ClipboardCheck,
  MessageSquareWarning,
  WalletCards
} from 'lucide-react'

import './App.css'

import { supabase } from './supabase'

import Login from './Login'
import Attendance from './Attendance'
import ManageStaff from './ManageStaff'
import SocietyInspection from './SocietyInspection'
import { useInspectionConfig } from './inspectionConfig'
import Complaints from './Complaints'
import ComplaintLiveDisplay from './ComplaintLiveDisplay'

import RwbotHome from './rwbot/RwbotHome'
import RwbotChangePassword from './rwbot/RwbotChangePassword'
import RwbotChat from './rwbot/RwbotChat'
import RwbotDocuments from './rwbot/RwbotDocuments'

const AccountsApp = lazy(() => import('./accounts/AccountsApp'))

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [screen, setScreen] = useState(() =>
    sessionStorage.getItem('rwa-resume-society-inspection') === 'true'
      ? 'society-inspection'
      : 'dashboard'
  )

  const [rwbotProfile, setRwbotProfile] = useState(null)
  const { config: inspectionConfig } = useInspectionConfig()

  useEffect(() => {
    if (screen === 'society-inspection') {
      sessionStorage.setItem('rwa-resume-society-inspection', 'true')
    } else {
      sessionStorage.removeItem('rwa-resume-society-inspection')
    }
  }, [screen])

  const [
    profileCheckedForUser,
    setProfileCheckedForUser
  ] = useState(null)

  const [profileError, setProfileError] = useState('')
  const [operationsRole, setOperationsRole] = useState(null)

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

        // Do not reset the active module on SIGNED_IN.
        // Supabase can emit SIGNED_IN again when the browser/tab regains focus
        // (for example after returning from the mobile file picker). Resetting
        // here used to kick users out of Accounts back to the home dashboard.
        if (event === 'SIGNED_OUT') {
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
      setOperationsRole(null)
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

      const { data: appUser } = await supabase
        .from('app_users')
        .select('role, active')
        .eq('auth_user_id', userId)
        .maybeSingle()

      setOperationsRole(
        appUser?.active === false
          ? null
          : (appUser?.role || null)
      )

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

  if (operationsRole === 'PLUMBER') {
    return (
      <ComplaintLiveDisplay
        workerMode
        onBack={handleLogout}
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

  if (screen === 'society-inspection') {
    return (
      <SocietyInspection
        onBack={() =>
          setScreen('dashboard')
        }
      />
    )
  }

  if (screen === 'accounts') {
    return (
      <Suspense
        fallback={
          <div className="app-shell">
            <main className="page-content">
              <p>Loading Accounts & Finance...</p>
            </main>
          </div>
        }
      >
        <AccountsApp
          onBack={() =>
            setScreen('dashboard')
          }
        />
      </Suspense>
    )
  }

  if (screen === 'plumber-complaints') {
    return (
      <ComplaintLiveDisplay
        workerMode
        onBack={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'complaint-live') {
    return (
      <ComplaintLiveDisplay
        onBack={() => setScreen('dashboard')}
        onOpenComplaints={() => setScreen('complaints')}
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

        <div className="dashboard-module-grid">
          <button
            className="dashboard-module-card module-patrol"
            onClick={() => {
              window.location.href =
                'https://rwa-pocket-a.singh-virendra18.workers.dev/?view=report'
            }}
          >
            <div className="dashboard-module-icon module-icon-purple">
              <Moon size={24} strokeWidth={1.9} />
            </div>

            <div className="dashboard-module-copy">
              <h3>Night Patrol</h3>
              <p>View night patrol report</p>
            </div>

            <ArrowRight className="dashboard-module-arrow" size={18} />
          </button>

          <button
            className="dashboard-module-card module-attendance"
            onClick={() =>
              setScreen('attendance')
            }
          >
            <div className="dashboard-module-icon module-icon-green">
              <Users size={24} strokeWidth={1.9} />
            </div>

            <div className="dashboard-module-copy">
              <h3>Staff Attendance</h3>
              <p>Mark daily attendance</p>
            </div>

            <ArrowRight className="dashboard-module-arrow" size={18} />
          </button>

          <button
            className="dashboard-module-card module-inspection"
            onClick={() =>
              setScreen('society-inspection')
            }
          >
            <div className="dashboard-module-icon module-icon-blue">
              <ClipboardCheck size={24} strokeWidth={1.9} />
            </div>

            <div className="dashboard-module-copy">
              <h3>{inspectionConfig.module_name}</h3>
              <p>Society inspection</p>
            </div>

            <ArrowRight className="dashboard-module-arrow" size={18} />
          </button>

          <button
            className="dashboard-module-card module-complaints"
            onClick={() =>
              setScreen('complaint-live')
            }
          >
            <div className="dashboard-module-icon module-icon-violet">
              <MessageSquareWarning size={24} strokeWidth={1.9} />
            </div>

            <div className="dashboard-module-copy">
              <h3>Complaint Center</h3>
              <p>Track resident complaints</p>
            </div>

            <ArrowRight className="dashboard-module-arrow" size={18} />
          </button>

          <button
            className="dashboard-module-card dashboard-module-wide module-accounts"
            onClick={() => setScreen('accounts')}
          >
            <div className="dashboard-module-icon module-icon-teal">
              <WalletCards size={25} strokeWidth={1.9} />
            </div>

            <div className="dashboard-module-copy">
              <h3>Accounts &amp; Finance</h3>
              <p>Income · Expenses · Bank · Reports</p>
            </div>

            <ArrowRight className="dashboard-module-arrow" size={19} />
          </button>
        </div>
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
