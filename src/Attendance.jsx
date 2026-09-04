import { useEffect, useState } from 'react'
import {
  UserRound,
  Wrench,
  Sparkles,
  Recycle,
  Sprout,
  Zap,
  Settings
} from 'lucide-react'

import './App.css'
import { supabase } from './supabase'

function Attendance({ onBack, onManageStaff }) {

  const [staff, setStaff] = useState([])
  const [authoritySweepers, setAuthoritySweepers] = useState(0)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadStaff()
  }, [])

  const getTodayDate = () => {
    const now = new Date()

    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const loadStaff = async () => {
    setLoading(true)
    setError(null)

    const today = getTodayDate()

    // --------------------------------
    // Load active RWA staff
    // --------------------------------

    const {
      data: staffData,
      error: staffError
    } = await supabase
      .from('staff')
      .select('*')
      .eq('active', true)
      .order('display_order', { ascending: true })

    if (staffError) {
      console.error(staffError)
      setError(staffError.message)
      setLoading(false)
      return
    }

    // --------------------------------
    // Load today's saved RWA attendance
    // --------------------------------

    const {
      data: attendanceData,
      error: attendanceError
    } = await supabase
      .from('daily_attendance')
      .select('*')
      .eq('attendance_date', today)

    if (attendanceError) {
      console.error(attendanceError)
      setError(attendanceError.message)
      setLoading(false)
      return
    }

    // --------------------------------
    // Load today's Noida Authority sweepers
    // --------------------------------

    const {
      data: externalStaffData,
      error: externalStaffError
    } = await supabase
      .from('daily_external_staff')
      .select('*')
      .eq('work_date', today)
      .eq('staff_type', 'Noida Authority Sweeper')
      .maybeSingle()

    if (externalStaffError) {
      console.error(externalStaffError)
      setError(externalStaffError.message)
      setLoading(false)
      return
    }

    // --------------------------------
    // Merge saved attendance with staff
    // --------------------------------

    const attendanceStaff = staffData.map((person) => {

      const savedAttendance = attendanceData.find(
        (attendance) => attendance.staff_id === person.id
      )

      return {
        ...person,

        present: savedAttendance
          ? savedAttendance.present
          : true
      }
    })

    setStaff(attendanceStaff)

    setAuthoritySweepers(
      externalStaffData
        ? externalStaffData.staff_count
        : 0
    )

    const hasSavedAttendance =
      attendanceData.length > 0 ||
      externalStaffData !== null

    setSaved(hasSavedAttendance)

    setDirty(false)
    setLoading(false)
  }

  // --------------------------------
  // Toggle RWA Staff Attendance
  // --------------------------------

  const toggleAttendance = (index) => {
    setStaff((current) =>
      current.map((person, i) =>
        i === index
          ? {
              ...person,
              present: !person.present
            }
          : person
      )
    )

    setDirty(true)
  }

  // --------------------------------
  // Noida Authority Sweeper Counter
  // --------------------------------

  const decreaseAuthoritySweepers = () => {
    setAuthoritySweepers((count) =>
      Math.max(0, count - 1)
    )

    setDirty(true)
  }

  const increaseAuthoritySweepers = () => {
    setAuthoritySweepers((count) =>
      count + 1
    )

    setDirty(true)
  }

  // --------------------------------
  // Save Attendance
  // --------------------------------

  const saveAttendance = async () => {
    setSaving(true)
    setError(null)

    const today = getTodayDate()

    // --------------------------------
    // Save RWA staff attendance
    // --------------------------------

    const attendanceRecords = staff.map((person) => ({
      attendance_date: today,
      staff_id: person.id,

      // Snapshot values preserve historical data
      staff_name: person.name,
      profession: person.profession,

      present: person.present,
      updated_at: new Date().toISOString()
    }))

    const {
      error: attendanceSaveError
    } = await supabase
      .from('daily_attendance')
      .upsert(
        attendanceRecords,
        {
          onConflict: 'attendance_date,staff_id'
        }
      )

    if (attendanceSaveError) {
      console.error(attendanceSaveError)
      setError(attendanceSaveError.message)
      setSaving(false)
      return
    }

    // --------------------------------
    // Save Noida Authority sweepers
    // --------------------------------

    const {
      error: externalStaffSaveError
    } = await supabase
      .from('daily_external_staff')
      .upsert(
        {
          work_date: today,
          staff_type: 'Noida Authority Sweeper',
          staff_count: authoritySweepers,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'work_date,staff_type'
        }
      )

    if (externalStaffSaveError) {
      console.error(externalStaffSaveError)
      setError(externalStaffSaveError.message)
      setSaving(false)
      return
    }

    setSaved(true)
    setDirty(false)
    setSaving(false)

    alert('Attendance saved successfully')
  }

  // --------------------------------
  // Profession Icons
  // --------------------------------

  const getProfessionIcon = (profession) => {
    const props = {
      size: 22,
      strokeWidth: 1.8
    }

    switch (profession) {

      case 'Supervisor':
        return <UserRound {...props} />

      case 'Plumber':
        return <Wrench {...props} />

      case 'Sweeper':
        return <Sparkles {...props} />

      case 'Housekeeping':
        return <Recycle {...props} />

      case 'Gardener':
        return <Sprout {...props} />

      case 'Electrician':
        return <Zap {...props} />

      default:
        return <UserRound {...props} />
    }
  }

  const presentCount =
    staff.filter((person) => person.present).length

  const absentCount =
    staff.length - presentCount

  // --------------------------------
  // WhatsApp Attendance Report
  // --------------------------------

  const shareOnWhatsApp = () => {

    const dateText = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

    const pad = (value, length) =>
      String(value).padEnd(length, ' ')

    const rows = staff.map((person, index) => {

      const attendanceIcon =
        person.present ? '✓' : '✗'

      const no =
        String(index + 1).padStart(2, '0')

      const name =
        pad(person.name, 17)

      const profession =
        pad(person.profession, 16)

      return (
        `${no}  ${name}${profession}${attendanceIcon}`
      )
    })

    const table = [
      'No  Name             Profession      Att.',
      '------------------------------------------',
      ...rows,
      '------------------------------------------',
      `Present: ${presentCount}   Absent: ${absentCount}   Total: ${staff.length}`
    ].join('\n')

    const message = [
      '*RWA Pocket-A*',
      '*Today\'s Staff Attendance*',
      dateText,
      '',
      '```',
      table,
      '```',
      '',
      `*Noida Authority Sweepers:* ${authoritySweepers}`,
      '',
      '_Powered by the RWA Pocket-A in-house Attendance App — a step towards smarter, transparent & technology-driven RWA management._'
    ].join('\n')

    const whatsappUrl =
      `https://wa.me/?text=${encodeURIComponent(message)}`

    window.open(
      whatsappUrl,
      '_blank'
    )
  }

  // --------------------------------
  // Loading
  // --------------------------------

  if (loading) {
    return (
      <div className="app">

        <main className="dashboard">
          <p>
            Loading staff...
          </p>
        </main>

      </div>
    )
  }

  // --------------------------------
  // Error
  // --------------------------------

  if (error) {
    return (
      <div className="app">

        <main className="dashboard">

          <p>
            Error loading staff: {error}
          </p>

        </main>

      </div>
    )
  }

  // --------------------------------
  // Attendance Screen
  // --------------------------------

  return (
    <div className="app">

      <header className="header attendance-header">

        <button
          className="back-button"
          onClick={onBack}
        >
          ←
        </button>

        <div className="attendance-header-title">

          <h1>
            Staff Attendance
          </h1>

          <p>
            RWA Pocket-A
          </p>

        </div>

        <button
          className="manage-staff-button"
          onClick={onManageStaff}
          title="Manage Staff"
        >
          <Settings size={20} />
        </button>

      </header>

      <main className="dashboard">

        <div className="attendance-title">

          <h2>
            Today's Attendance
          </h2>

          <p>
            {new Date().toLocaleDateString(
              'en-IN',
              {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }
            )}
          </p>

        </div>

        {/* --------------------------------
            RWA Staff Attendance Table
        -------------------------------- */}

        <div className="attendance-table">

          <div className="attendance-row attendance-table-header">

            <div></div>

            <div>
              Name
            </div>

            <div>
              Profession
            </div>

            <div>
              Att.
            </div>

          </div>

          {staff.map((person, index) => (

            <div
              className="attendance-row"
              key={person.id}
            >

              <div className="employee-icon-wrap">

                {getProfessionIcon(
                  person.profession
                )}

              </div>

              <div className="employee-name">

                {person.name}

              </div>

              <div className="employee-profession">

                {person.profession}

              </div>

              <div>

                <button
                  className={`attendance-toggle ${
                    person.present
                      ? 'is-present'
                      : 'is-absent'
                  }`}
                  onClick={() =>
                    toggleAttendance(index)
                  }
                >

                  {person.present
                    ? '✅'
                    : '❌'
                  }

                </button>

              </div>

            </div>

          ))}

        </div>

        {/* --------------------------------
            RWA Staff Summary
        -------------------------------- */}

        <div className="attendance-summary">

          <span>
            ✅ {presentCount}
          </span>

          <span>
            ❌ {absentCount}
          </span>

          <span>
            Total: {staff.length}
          </span>

        </div>

        {/* --------------------------------
            Noida Authority Sweepers
        -------------------------------- */}

        <div className="external-staff-card">

          <div>

            <h3>
              Noida Authority Sweepers
            </h3>

            <p>
              Working today
            </p>

          </div>

          <div className="counter-control">

            <button
              type="button"
              onClick={decreaseAuthoritySweepers}
            >
              −
            </button>

            <span>
              {authoritySweepers}
            </span>

            <button
              type="button"
              onClick={increaseAuthoritySweepers}
            >
              +
            </button>

          </div>

        </div>

        {/* --------------------------------
            Save Attendance
        -------------------------------- */}

        <button
          className="save-attendance-button"
          onClick={saveAttendance}
          disabled={
            saving ||
            (saved && !dirty)
          }
        >

          {saving
            ? 'Saving...'

            : !saved
              ? 'Save Attendance'

              : dirty
                ? 'Update Attendance'

                : 'Attendance Saved'
          }

        </button>

        {/* --------------------------------
            WhatsApp Share
        -------------------------------- */}

        <button
          className="whatsapp-button"
          onClick={shareOnWhatsApp}
          disabled={
            !saved ||
            dirty
          }
        >

          🟢 Share on WhatsApp

        </button>

      </main>

    </div>
  )
}

export default Attendance