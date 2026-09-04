import { useState } from 'react'
import {
  Building2,
  Mail,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react'

import { supabase } from './supabase'
import './App.css'

function Login() {
  const [email, setEmail] = useState('supervisor@rwapocketa.local')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <div className="login-page">

      <header className="login-hero">

        <div className="login-brand-icon">
          <Building2 size={36} strokeWidth={1.8} />
        </div>

        <div className="login-brand-text">
          <h1>RWA Pocket-A</h1>
          <p>Sector -105 Noida</p>
          <span>Safer Homes • Stronger Community</span>
        </div>

      </header>

      <main className="login-main">

        <div className="login-card">

          <div className="login-user-icon">
            <ShieldCheck size={42} strokeWidth={1.7} />
          </div>

          <h2>Supervisor Login</h2>

          <p className="login-subtitle">
            Sign in to manage daily RWA operations
          </p>

          <form onSubmit={handleLogin}>

            <label>Email</label>

            <div className="login-input-wrap">
              <Mail size={20} />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <label>Password</label>

            <div className="login-input-wrap">

              <LockKeyhole size={20} />

              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
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
            <span>RWA AI</span>
          </div>

          <p className="login-tagline">
            For a Better, Safer and Cleaner Society
          </p>

        </div>

      </main>

      <footer className="login-footer">
        <strong>RWA Pocket-A</strong>
        <span>•</span>
        <span>Sector -105 Noida</span>
      </footer>

    </div>
  )
}

export default Login