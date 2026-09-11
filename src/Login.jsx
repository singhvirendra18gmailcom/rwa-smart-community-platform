import { useState } from 'react'
import {
  Building2,
  Mail,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Eye,
  EyeOff,
  Bot,
  Home
} from 'lucide-react'

import { supabase } from './supabase'
import './App.css'
import './rwbot/Rwbot.css'

function Login() {
  const [loginMode, setLoginMode] = useState('supervisor')

  const [email, setEmail] = useState(
    'supervisor@rwapocketa.local'
  )

  const [flatNo, setFlatNo] = useState('')

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectMode = (mode) => {
    setLoginMode(mode)
    setPassword('')
    setError('')
    setShowPassword(false)
  }

  const normalizeFlatNo = (value) => {
    return value
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase()
  }

  const isValidFlatNo = (value) => {
    return /^(?:[1-9]|[1-3][0-9]|4[0-8])[ABCD]$/.test(value)
  }

  const handleLogin = async (e) => {
    e.preventDefault()

    setLoading(true)
    setError('')

    let loginEmail = email

    if (loginMode === 'rwbot') {
      const normalizedFlat = normalizeFlatNo(flatNo)

      if (!isValidFlatNo(normalizedFlat)) {
        setError(
          'Please enter a valid flat number, for example 1A, 12C or 48D.'
        )
        setLoading(false)
        return
      }

      loginEmail =
        `${normalizedFlat.toLowerCase()}@rwbot.invalid`
    }

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: loginEmail,
        password
      })

    if (loginError) {
      if (loginMode === 'rwbot') {
        setError(
          'Invalid flat number or password. Please contact RWA if you need login access.'
        )
      } else {
        setError('Invalid email or password')
      }

      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <div className="login-page">

      <header className="login-hero">

        <div className="login-brand-icon">
          {loginMode === 'rwbot'
            ? (
              <Bot size={36} strokeWidth={1.8} />
            )
            : (
              <Building2 size={36} strokeWidth={1.8} />
            )
          }
        </div>

        <div className="login-brand-text">

          {loginMode === 'rwbot' ? (
            <>
              <h1>RWBOT</h1>

              <p>
                RWA Transparency Assistant
              </p>

              <span>
                Ask. Know. Stay Informed.
              </span>
            </>
          ) : (
            <>
              <h1>RWA Pocket-A</h1>

              <p>
                Sector -105 Noida
              </p>

              <span>
                Safer Homes • Stronger Community
              </span>
            </>
          )}

        </div>

      </header>

      <main className="login-main">

        <div className="login-card">

          <div className="login-mode-switch">

            <button
              type="button"
              className={
                loginMode === 'supervisor'
                  ? 'login-mode-button active'
                  : 'login-mode-button'
              }
              onClick={() =>
                selectMode('supervisor')
              }
            >
              <ShieldCheck size={18} />
              Supervisor
            </button>

            <button
              type="button"
              className={
                loginMode === 'rwbot'
                  ? 'login-mode-button active'
                  : 'login-mode-button'
              }
              onClick={() =>
                selectMode('rwbot')
              }
            >
              <Bot size={18} />
              RWBOT
            </button>

          </div>

          <div className="login-user-icon">

            {loginMode === 'rwbot'
              ? (
                <Bot
                  size={42}
                  strokeWidth={1.7}
                />
              )
              : (
                <ShieldCheck
                  size={42}
                  strokeWidth={1.7}
                />
              )
            }

          </div>

          <h2>
            {loginMode === 'rwbot'
              ? 'Resident Login'
              : 'Supervisor Login'
            }
          </h2>

          <p className="login-subtitle">

            {loginMode === 'rwbot'
              ? 'Residents and RWA members can access RWBOT'
              : 'Sign in to manage daily RWA operations'
            }

          </p>

          <form onSubmit={handleLogin}>

            {loginMode === 'supervisor' ? (
              <>
                <label>Email</label>

                <div className="login-input-wrap">

                  <Mail size={20} />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    required
                  />

                </div>
              </>
            ) : (
              <>
                <label>Flat Number</label>

                <div className="login-input-wrap">

                  <Home size={20} />

                  <input
                    type="text"
                    value={flatNo}
                    onChange={(e) =>
                      setFlatNo(
                        e.target.value.toUpperCase()
                      )
                    }
                    placeholder="e.g. 1A"
                    autoComplete="username"
                    required
                  />

                </div>

                <p className="rwbot-flat-help">
                  Example: 1A, 12B, 37C
                </p>
              </>
            )}

            <label>Password</label>

            <div className="login-input-wrap">

              <LockKeyhole size={20} />

              <input
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (value) => !value
                  )
                }
                aria-label="Toggle password visibility"
              >
                {showPassword
                  ? <EyeOff size={20} />
                  : <Eye size={20} />
                }
              </button>

            </div>

            {error && (
              <p className="login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              <LogIn size={20} />

              {loading
                ? 'Signing in...'
                : 'Sign In'
              }
            </button>

          </form>

          <div className="login-divider">

            <span>
              {loginMode === 'rwbot'
                ? 'RWA Pocket-A'
                : 'RWA AI'
              }
            </span>

          </div>

          <p className="login-tagline">

            {loginMode === 'rwbot'
              ? 'RWA Transparency Assistant'
              : 'For a Better, Safer and Cleaner Society'
            }

          </p>

        </div>

      </main>

      <footer className="login-footer">

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

export default Login