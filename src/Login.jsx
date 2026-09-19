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
  Home,
  UserRound
} from 'lucide-react'

import { supabase } from './supabase'

import rwbotMascot from './assets/rwbot-mascot.png'

import './App.css'
import './Login.css'


function Login() {

  // RWBOT is the default login screen
  const [loginMode, setLoginMode] =
    useState('rwbot')

  const [email, setEmail] =
    useState(
      'supervisor@rwapocketa.local'
    )

  const [flatNo, setFlatNo] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [
    showPassword,
    setShowPassword
  ] = useState(false)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')


  const isRwbot =
    loginMode === 'rwbot'


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
    return /^(?:[1-9]|[1-3][0-9]|4[0-8])[ABCD]$/.test(
      value
    )
  }


  const handleLogin = async (event) => {

    event.preventDefault()

    setLoading(true)
    setError('')

    let loginEmail = email


    // =====================================================
    // RWBOT LOGIN
    // =====================================================

    if (isRwbot) {

      const normalizedFlat =
        normalizeFlatNo(flatNo)


      if (
        !isValidFlatNo(
          normalizedFlat
        )
      ) {

        setError(
          'Enter a valid flat number, for example 1A, 12B or 48D.'
        )

        setLoading(false)

        return
      }


      loginEmail =
        `${normalizedFlat.toLowerCase()}@rwbot.invalid`
    }


    // =====================================================
    // SUPABASE AUTH
    // =====================================================

    const {
      error: loginError
    } =
      await supabase.auth
        .signInWithPassword({
          email: loginEmail,
          password
        })


    if (loginError) {

      if (isRwbot) {

        setError(
          'Invalid flat number or password.'
        )

      } else {

        setError(
          'Invalid email or password.'
        )
      }


      setLoading(false)

      return
    }


    setLoading(false)
  }


  return (

    <div className="rwa-login-page">


      {/* ===================================================
          HERO
          =================================================== */}

      <section
        className={
          isRwbot
            ? 'rwa-login-hero rwa-login-hero-rwbot'
            : 'rwa-login-hero rwa-login-hero-supervisor'
        }
      >


        <div className="rwa-login-hero-copy">


          <div className="rwa-login-brand-row">


            <div className="rwa-login-brand-icon">

              {isRwbot ? (

                <img
                  src={rwbotMascot}
                  alt="RWBOT"
                />

              ) : (

                <Building2
                  size={34}
                  strokeWidth={1.8}
                />

              )}

            </div>


            <div>

              <h1>

                {isRwbot
                  ? 'RWBOT'
                  : 'RWA Pocket-A'
                }

              </h1>


              <p>

                {isRwbot
                  ? 'RWA Transparency Assistant'
                  : 'Supervisor Operations'
                }

              </p>

            </div>


          </div>


          <div className="rwa-login-tagline">

            {isRwbot
              ? 'ASK. KNOW. STAY INFORMED.'
              : 'SECURE. MANAGE. ENABLE.'
            }

          </div>


        </div>


        {/* RWBOT mascot on right */}

        {isRwbot && (

          <div className="rwa-login-hero-mascot">

            <div className="rwa-login-mascot-glow" />

            <div className="rwa-login-mascot-frame">

              <img
                src={rwbotMascot}
                alt=""
              />

            </div>

          </div>
        )}


        {/* Supervisor graphic */}

        {!isRwbot && (

          <div className="rwa-login-supervisor-art">

            <div className="rwa-login-supervisor-art-circle">

              <Building2
                size={74}
                strokeWidth={1.3}
              />

            </div>

          </div>
        )}


      </section>


      {/* ===================================================
          LOGIN CARD
          =================================================== */}

      <main className="rwa-login-main">


        <section className="rwa-login-card">


          {/* =================================================
              MODE SWITCH
              ================================================= */}

          <div className="rwa-login-mode-switch">


            <button
              type="button"
              className={
                !isRwbot
                  ? 'rwa-login-mode active'
                  : 'rwa-login-mode'
              }
              onClick={() =>
                selectMode(
                  'supervisor'
                )
              }
            >

              <ShieldCheck size={18} />

              Supervisor

            </button>


            <button
              type="button"
              className={
                isRwbot
                  ? 'rwa-login-mode active'
                  : 'rwa-login-mode'
              }
              onClick={() =>
                selectMode(
                  'rwbot'
                )
              }
            >

              <Bot size={18} />

              RWBOT

            </button>


          </div>


          {/* =================================================
              LOGIN IDENTITY
              ================================================= */}

          <div className="rwa-login-heading">


            <div className="rwa-login-heading-icon">

              {isRwbot ? (

                <img
                  src={rwbotMascot}
                  alt=""
                />

              ) : (

                <UserRound
                  size={38}
                  strokeWidth={1.7}
                />

              )}

            </div>


            <h2>

              {isRwbot
                ? 'Resident Login'
                : 'Supervisor Login'
              }

            </h2>


          </div>


          {/* =================================================
              FORM
              ================================================= */}

          <form
            className="rwa-login-form"
            onSubmit={handleLogin}
          >


            {/* ===============================================
                USERNAME / FLAT
                =============================================== */}

            {isRwbot ? (

              <div className="rwa-login-field">


                <label>
                  Flat Number
                </label>


                <div className="rwa-login-input">


                  <div className="rwa-login-input-icon">

                    <Home size={22} />

                  </div>


                  <input
                    type="text"
                    value={flatNo}
                    onChange={(event) =>
                      setFlatNo(
                        event.target.value
                          .toUpperCase()
                      )
                    }
                    placeholder="e.g. 1A"
                    autoComplete="username"
                    required
                  />


                </div>


              </div>

            ) : (

              <div className="rwa-login-field">


                <label>
                  Email
                </label>


                <div className="rwa-login-input">


                  <div className="rwa-login-input-icon">

                    <Mail size={22} />

                  </div>


                  <input
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value
                      )
                    }
                    placeholder="Supervisor email"
                    autoComplete="username"
                    required
                  />


                </div>


              </div>

            )}


            {/* ===============================================
                PASSWORD
                =============================================== */}

            <div className="rwa-login-field">


              <label>
                Password
              </label>


              <div className="rwa-login-input">


                <div className="rwa-login-input-icon">

                  <LockKeyhole size={22} />

                </div>


                <input
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />


                <button
                  type="button"
                  className="rwa-login-password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (current) =>
                        !current
                    )
                  }
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >

                  {showPassword
                    ? <EyeOff size={22} />
                    : <Eye size={22} />
                  }

                </button>


              </div>


            </div>


            {/* ===============================================
                ERROR
                =============================================== */}

            {error && (

              <div className="rwa-login-error">

                {error}

              </div>

            )}


            {/* ===============================================
                LOGIN BUTTON
                =============================================== */}

            <button
              type="submit"
              className="rwa-login-submit"
              disabled={loading}
            >


              <LogIn size={23} />


              {loading
                ? 'Signing in...'
                : isRwbot
                  ? 'Enter RWBOT'
                  : 'Sign In'
              }


            </button>


          </form>


        </section>


      </main>


      {/* ===================================================
          FOOTER
          =================================================== */}

      <footer className="rwa-login-footer">

        <strong>
          RWA Pocket-A
        </strong>

        <span>•</span>

        <span>
          Sector-105, Noida
        </span>

      </footer>


    </div>

  )
}


export default Login