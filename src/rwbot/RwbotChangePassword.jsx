import { useState } from 'react'
import {
  Bot,
  LockKeyhole,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react'

import { supabase } from '../supabase'
import './Rwbot.css'

function RwbotChangePassword({
  profile,
  onCompleted
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [showPassword, setShowPassword] =
    useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    setError('')

    if (password.length < 8) {
      setError(
        'Password must contain at least 8 characters.'
      )
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const {
      error: passwordError
    } = await supabase.auth.updateUser({
      password
    })

    if (passwordError) {
      setError(
        'Unable to change password. Please try again.'
      )
      setLoading(false)
      return
    }

    const {
      error: profileError
    } = await supabase.rpc(
      'mark_password_changed'
    )

    if (profileError) {
      console.error(profileError)

      setError(
        'Password changed, but profile update failed. Please contact RWA.'
      )

      setLoading(false)
      return
    }

    setLoading(false)

    onCompleted()
  }

  return (
    <div className="rwbot-auth-page">

      <div className="rwbot-auth-card">

        <div className="rwbot-logo">
          <Bot size={34} />
        </div>

        <h1>RWBOT</h1>

        <h2>
          Create Your Password
        </h2>

        <p className="rwbot-tagline">
          Ask. Know. Stay Informed.
        </p>

        <div className="rwbot-first-login">

          <CheckCircle2 size={20} />

          <div>
            <strong>
              Welcome, {profile.full_name}
            </strong>

            <span>
              This is your first RWBOT login.
            </span>
          </div>

        </div>

        <form
          className="rwbot-password-form"
          onSubmit={handleSubmit}
        >

          <label>
            New Password
          </label>

          <div className="rwbot-password-input">

            <LockKeyhole size={19} />

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
              placeholder="Minimum 8 characters"
              required
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword(
                  (value) => !value
                )
              }
            >
              {showPassword
                ? <EyeOff size={19} />
                : <Eye size={19} />
              }
            </button>

          </div>

          <label>
            Confirm Password
          </label>

          <div className="rwbot-password-input">

            <LockKeyhole size={19} />

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value
                )
              }
              placeholder="Enter password again"
              required
            />

          </div>

          {error && (
            <div className="rwbot-error">
              {error}
            </div>
          )}

          <button
            className="rwbot-primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Saving...'
              : 'Set Password'
            }
          </button>

        </form>

      </div>

    </div>
  )
}

export default RwbotChangePassword