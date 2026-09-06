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


// =========================================================
// Canvas Helpers
// =========================================================

function drawRoundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fillColor,
  strokeColor = null,
  lineWidth = 1
) {
  const r = Math.min(
    radius,
    width / 2,
    height / 2
  )

  ctx.beginPath()

  ctx.moveTo(x + r, y)

  ctx.lineTo(
    x + width - r,
    y
  )

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  )

  ctx.lineTo(
    x + width,
    y + height - r
  )

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  )

  ctx.lineTo(
    x + r,
    y + height
  )

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  )

  ctx.lineTo(
    x,
    y + r
  )

  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  )

  ctx.closePath()

  if (fillColor) {
    ctx.fillStyle = fillColor
    ctx.fill()
  }

  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}


function wrapCanvasText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  lineHeight
) {
  const words = text.split(' ')

  let line = ''
  let currentY = y

  words.forEach((word) => {
    const testLine =
      line
        ? `${line} ${word}`
        : word

    const width =
      ctx.measureText(
        testLine
      ).width

    if (
      width > maxWidth &&
      line
    ) {
      ctx.fillText(
        line,
        x,
        currentY
      )

      line = word
      currentY += lineHeight
    } else {
      line = testLine
    }
  })

  if (line) {
    ctx.fillText(
      line,
      x,
      currentY
    )
  }
}


function Attendance({
  onBack,
  onManageStaff
}) {

  const [staff, setStaff] =
    useState([])

  const [
    authoritySweepers,
    setAuthoritySweepers
  ] = useState(0)

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [sharing, setSharing] =
    useState(false)

  const [saved, setSaved] =
    useState(false)

  const [dirty, setDirty] =
    useState(false)

  const [error, setError] =
    useState(null)


  useEffect(() => {
    loadStaff()
  }, [])


  // =========================================================
  // Date Helpers
  // =========================================================

  const getTodayDate = () => {
    const now =
      new Date()

    const year =
      now.getFullYear()

    const month =
      String(
        now.getMonth() + 1
      ).padStart(
        2,
        '0'
      )

    const day =
      String(
        now.getDate()
      ).padStart(
        2,
        '0'
      )

    return (
      `${year}-${month}-${day}`
    )
  }


  const getDisplayDate = () => {
    return new Date()
      .toLocaleDateString(
        'en-GB',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }
      )
      .toUpperCase()
  }


  // =========================================================
  // Load Attendance
  // =========================================================

  const loadStaff = async () => {

    setLoading(true)
    setError(null)

    const today =
      getTodayDate()


    const {
      data: staffData,
      error: staffError
    } = await supabase
      .from('staff')
      .select('*')
      .eq(
        'active',
        true
      )
      .order(
        'display_order',
        {
          ascending: true
        }
      )


    if (staffError) {
      console.error(
        staffError
      )

      setError(
        staffError.message
      )

      setLoading(false)

      return
    }


    const {
      data: attendanceData,
      error: attendanceError
    } = await supabase
      .from(
        'daily_attendance'
      )
      .select('*')
      .eq(
        'attendance_date',
        today
      )


    if (attendanceError) {
      console.error(
        attendanceError
      )

      setError(
        attendanceError.message
      )

      setLoading(false)

      return
    }


    const {
      data: externalStaffData,
      error: externalStaffError
    } = await supabase
      .from(
        'daily_external_staff'
      )
      .select('*')
      .eq(
        'work_date',
        today
      )
      .eq(
        'staff_type',
        'Noida Authority Sweeper'
      )
      .maybeSingle()


    if (externalStaffError) {
      console.error(
        externalStaffError
      )

      setError(
        externalStaffError.message
      )

      setLoading(false)

      return
    }


    const attendanceStaff =
      staffData.map(
        (person) => {

          const savedAttendance =
            attendanceData.find(
              (attendance) =>
                attendance.staff_id ===
                person.id
            )

          return {
            ...person,

            present:
              savedAttendance
                ? savedAttendance.present
                : true
          }
        }
      )


    setStaff(
      attendanceStaff
    )


    setAuthoritySweepers(
      externalStaffData
        ? externalStaffData.staff_count
        : 0
    )


    const hasSavedAttendance =
      attendanceData.length > 0 ||
      externalStaffData !== null


    setSaved(
      hasSavedAttendance
    )

    setDirty(false)
    setLoading(false)
  }


  // =========================================================
  // Toggle Attendance
  // =========================================================

  const toggleAttendance = (
    index
  ) => {

    setStaff(
      (current) =>
        current.map(
          (person, i) =>
            i === index
              ? {
                  ...person,
                  present:
                    !person.present
                }
              : person
        )
    )

    setDirty(true)
  }


  // =========================================================
  // Noida Authority Sweepers
  // =========================================================

  const decreaseAuthoritySweepers =
    () => {

      setAuthoritySweepers(
        (count) =>
          Math.max(
            0,
            count - 1
          )
      )

      setDirty(true)
    }


  const increaseAuthoritySweepers =
    () => {

      setAuthoritySweepers(
        (count) =>
          count + 1
      )

      setDirty(true)
    }


  // =========================================================
  // Save Attendance
  // =========================================================

  const saveAttendance =
    async () => {

      setSaving(true)
      setError(null)

      const today =
        getTodayDate()


      const attendanceRecords =
        staff.map(
          (person) => ({
            attendance_date:
              today,

            staff_id:
              person.id,

            staff_name:
              person.name,

            profession:
              person.profession,

            present:
              person.present,

            updated_at:
              new Date()
                .toISOString()
          })
        )


      const {
        error:
          attendanceSaveError
      } = await supabase
        .from(
          'daily_attendance'
        )
        .upsert(
          attendanceRecords,
          {
            onConflict:
              'attendance_date,staff_id'
          }
        )


      if (
        attendanceSaveError
      ) {
        console.error(
          attendanceSaveError
        )

        setError(
          attendanceSaveError.message
        )

        setSaving(false)

        return
      }


      const {
        error:
          externalStaffSaveError
      } = await supabase
        .from(
          'daily_external_staff'
        )
        .upsert(
          {
            work_date:
              today,

            staff_type:
              'Noida Authority Sweeper',

            staff_count:
              authoritySweepers,

            updated_at:
              new Date()
                .toISOString()
          },
          {
            onConflict:
              'work_date,staff_type'
          }
        )


      if (
        externalStaffSaveError
      ) {
        console.error(
          externalStaffSaveError
        )

        setError(
          externalStaffSaveError.message
        )

        setSaving(false)

        return
      }


      setSaved(true)
      setDirty(false)
      setSaving(false)

      alert(
        'Attendance saved successfully'
      )
    }


  // =========================================================
  // Profession Icons
  // =========================================================

  const getProfessionIcon = (
    profession
  ) => {

    const props = {
      size: 22,
      strokeWidth: 1.8
    }


    switch (profession) {

      case 'Supervisor':
        return (
          <UserRound
            {...props}
          />
        )

      case 'Plumber':
        return (
          <Wrench
            {...props}
          />
        )

      case 'Sweeper':
        return (
          <Sparkles
            {...props}
          />
        )

      case 'Housekeeping':
        return (
          <Recycle
            {...props}
          />
        )

      case 'Gardener':
        return (
          <Sprout
            {...props}
          />
        )

      case 'Electrician':
        return (
          <Zap
            {...props}
          />
        )

      default:
        return (
          <UserRound
            {...props}
          />
        )
    }
  }


  const presentCount =
    staff.filter(
      (person) =>
        person.present
    ).length


  const absentCount =
    staff.length -
    presentCount


  // =========================================================
  // Generate Attendance PNG
  // =========================================================

  const generateAttendancePng =
    async () => {

      const width = 1080
      const rowHeight = 92
      const listStartY = 300

      const listHeight =
        staff.length *
        rowHeight

      const summaryY =
        listStartY +
        listHeight +
        20

      const authorityY =
        summaryY +
        155 +
        20

      const footerY =
        authorityY +
        105 +
        20

      const supervisorY =
        footerY +
        135 +
        20

      const height =
        supervisorY +
        85


      const canvas =
        document.createElement(
          'canvas'
        )

      canvas.width =
        width

      canvas.height =
        height


      const ctx =
        canvas.getContext(
          '2d'
        )


      if (!ctx) {
        throw new Error(
          'Unable to create attendance image.'
        )
      }


      // -------------------------------------------------------
      // Background
      // -------------------------------------------------------

      ctx.fillStyle =
        '#ffffff'

      ctx.fillRect(
        0,
        0,
        width,
        height
      )


      // -------------------------------------------------------
      // Header
      // -------------------------------------------------------

      const headerX = 45
      const headerY = 35
      const headerWidth = 990
      const headerHeight = 215


      const gradient =
        ctx.createLinearGradient(
          headerX,
          headerY,
          headerX +
            headerWidth,
          headerY
        )


      gradient.addColorStop(
        0,
        '#17375e'
      )

      gradient.addColorStop(
        1,
        '#174f83'
      )


      drawRoundedRect(
        ctx,
        headerX,
        headerY,
        headerWidth,
        headerHeight,
        28,
        gradient
      )


      // Header centered

      ctx.textAlign =
        'center'


      ctx.fillStyle =
        '#ffffff'


      ctx.font =
        '700 48px Arial, sans-serif'

      ctx.fillText(
        'RWA POCKET-A',
        width / 2,
        105
      )


      ctx.font =
        '700 33px Arial, sans-serif'

      ctx.fillText(
        'STAFF DAILY ATTENDANCE',
        width / 2,
        160
      )


      ctx.font =
        '400 31px Arial, sans-serif'

      ctx.fillStyle =
        '#e5eef7'

      ctx.fillText(
        getDisplayDate(),
        width / 2,
        211
      )


      ctx.textAlign =
        'left'


      // -------------------------------------------------------
      // Staff Rows
      // -------------------------------------------------------

      staff.forEach(
        (
          person,
          index
        ) => {

          const y =
            listStartY +
            index *
              rowHeight


          const rowX = 55
          const rowWidth = 970
          const rowBoxHeight = 80


          const rowBackground =
            index % 2 === 0
              ? '#ffffff'
              : '#f7fafc'


          drawRoundedRect(
            ctx,
            rowX,
            y,
            rowWidth,
            rowBoxHeight,
            18,
            rowBackground,
            '#d9e2ec',
            2
          )


          ctx.beginPath()

          ctx.fillStyle =
            '#e8f3ff'

          ctx.arc(
            100,
            y + 40,
            25,
            0,
            Math.PI * 2
          )

          ctx.fill()


          ctx.fillStyle =
            '#1473d1'

          ctx.font =
            '500 25px Arial, sans-serif'

          ctx.textAlign =
            'center'

          ctx.textBaseline =
            'middle'

          ctx.fillText(
            String(
              index + 1
            ),
            100,
            y + 40
          )


          ctx.textAlign =
            'left'

          ctx.textBaseline =
            'alphabetic'


          ctx.fillStyle =
            '#102a4c'

          ctx.font =
            '700 29px Arial, sans-serif'

          ctx.fillText(
            person.name,
            150,
            y + 34
          )


          ctx.fillStyle =
            '#64748b'

          ctx.font =
            '400 23px Arial, sans-serif'

          ctx.fillText(
            person.profession,
            150,
            y + 65
          )


          const statusX = 785
          const statusY = y + 17
          const statusWidth = 195
          const statusHeight = 48


          if (
            person.present
          ) {

            drawRoundedRect(
              ctx,
              statusX,
              statusY,
              statusWidth,
              statusHeight,
              24,
              '#dcfce7'
            )


            ctx.beginPath()

            ctx.fillStyle =
              '#059669'

            ctx.arc(
              statusX + 24,
              statusY + 24,
              9,
              0,
              Math.PI * 2
            )

            ctx.fill()


            ctx.fillStyle =
              '#078c56'

            ctx.font =
              '700 24px Arial, sans-serif'

            ctx.fillText(
              'PRESENT',
              statusX + 43,
              statusY + 32
            )

          } else {

            drawRoundedRect(
              ctx,
              statusX,
              statusY,
              statusWidth,
              statusHeight,
              24,
              '#fee2e2'
            )


            ctx.beginPath()

            ctx.fillStyle =
              '#dc2626'

            ctx.arc(
              statusX + 24,
              statusY + 24,
              9,
              0,
              Math.PI * 2
            )

            ctx.fill()


            ctx.fillStyle =
              '#dc2626'

            ctx.font =
              '700 24px Arial, sans-serif'

            ctx.fillText(
              'ABSENT',
              statusX + 47,
              statusY + 32
            )
          }
        }
      )


      // -------------------------------------------------------
      // Today's Summary
      // -------------------------------------------------------

      drawRoundedRect(
        ctx,
        55,
        summaryY,
        970,
        155,
        22,
        '#eef7ff',
        '#71b9ff',
        2
      )


      ctx.fillStyle =
        '#102a4c'

      ctx.font =
        '700 31px Arial, sans-serif'

      ctx.fillText(
        "TODAY'S SUMMARY",
        85,
        summaryY + 48
      )


      ctx.fillStyle =
        '#079455'

      ctx.font =
        '700 36px Arial, sans-serif'

      ctx.fillText(
        String(
          presentCount
        ),
        105,
        summaryY + 112
      )


      ctx.fillStyle =
        '#425b78'

      ctx.font =
        '400 25px Arial, sans-serif'

      ctx.fillText(
        'Present',
        160,
        summaryY + 111
      )


      ctx.fillStyle =
        '#c8dbea'

      ctx.fillRect(
        340,
        summaryY + 74,
        2,
        47
      )


      ctx.fillStyle =
        '#dc2626'

      ctx.font =
        '700 36px Arial, sans-serif'

      ctx.fillText(
        String(
          absentCount
        ),
        410,
        summaryY + 112
      )


      ctx.fillStyle =
        '#425b78'

      ctx.font =
        '400 25px Arial, sans-serif'

      ctx.fillText(
        'Absent',
        465,
        summaryY + 111
      )


      ctx.fillStyle =
        '#c8dbea'

      ctx.fillRect(
        650,
        summaryY + 74,
        2,
        47
      )


      ctx.fillStyle =
        '#1266d3'

      ctx.font =
        '700 36px Arial, sans-serif'

      ctx.fillText(
        String(
          staff.length
        ),
        720,
        summaryY + 112
      )


      ctx.fillStyle =
        '#425b78'

      ctx.font =
        '400 25px Arial, sans-serif'

      ctx.fillText(
        'Total Staff',
        775,
        summaryY + 111
      )


      // -------------------------------------------------------
      // Noida Authority Sweepers
      // -------------------------------------------------------

      drawRoundedRect(
        ctx,
        55,
        authorityY,
        970,
        105,
        20,
        '#effcf5',
        '#7dd9ac',
        2
      )


      ctx.fillStyle =
        '#102a4c'

      ctx.font =
        '700 27px Arial, sans-serif'

      ctx.fillText(
        'Noida Authority Sweepers available today :',
        110,
        authorityY + 63
      )


      ctx.fillStyle =
        '#079455'

      ctx.font =
        '700 32px Arial, sans-serif'

      ctx.fillText(
        String(
          authoritySweepers
        ),
        835,
        authorityY + 64
      )


      // -------------------------------------------------------
      // Common RWA Footer
      // -------------------------------------------------------

      drawRoundedRect(
        ctx,
        55,
        footerY,
        970,
        135,
        20,
        '#fffaf0',
        '#e6b94c',
        2
      )


      ctx.fillStyle =
        '#17375e'

      ctx.font =
        '400 24px Arial, sans-serif'


      wrapCanvasText(
        ctx,
        'Powered by the RWA Pocket-A in-house App — a step towards smarter, transparent & technology-driven RWA management.',
        90,
        footerY + 52,
        900,
        34
      )


      // -------------------------------------------------------
      // Supervisor line
      // -------------------------------------------------------

      ctx.textAlign =
        'center'

      ctx.fillStyle =
        '#526579'

      ctx.font =
        '600 24px Arial, sans-serif'

      ctx.fillText(
        'Supervisor Pocket-A',
        width / 2,
        supervisorY + 38
      )


      ctx.textAlign =
        'left'


      // -------------------------------------------------------
      // Canvas → PNG Blob
      // -------------------------------------------------------

      const blob =
        await new Promise(
          (
            resolve,
            reject
          ) => {

            canvas.toBlob(
              (result) => {

                if (
                  result
                ) {
                  resolve(
                    result
                  )

                } else {
                  reject(
                    new Error(
                      'Unable to generate PNG report.'
                    )
                  )
                }
              },
              'image/png',
              1
            )
          }
        )


      return blob
    }


  // =========================================================
  // Share PNG
  // =========================================================

  const shareOnWhatsApp =
    async () => {

      if (
        !saved ||
        dirty
      ) {
        alert(
          'Please save the latest attendance before sharing.'
        )

        return
      }


      setSharing(true)

      try {

        const blob =
          await generateAttendancePng()


        const today =
          getTodayDate()


        const fileName =
          `staff-attendance-${today}.png`


        const file =
          new File(
            [blob],
            fileName,
            {
              type: 'image/png'
            }
          )


        const shareData = {

          title:
            'RWA Pocket-A Staff Daily Attendance',

          text:
            `RWA Pocket-A - Staff Daily Attendance - ${getDisplayDate()}`,

          files: [
            file
          ]
        }


        let canShareFiles =
          false


        try {

          canShareFiles =
            Boolean(
              navigator.share &&
              (
                !navigator.canShare ||
                navigator.canShare(
                  shareData
                )
              )
            )

        } catch {
          canShareFiles =
            false
        }


        if (
          canShareFiles
        ) {
          try {

            await navigator.share(
              shareData
            )

            return

          } catch (
            shareError
          ) {

            if (
              shareError?.name ===
              'AbortError'
            ) {
              return
            }

            console.error(
              shareError
            )
          }
        }


        const downloadUrl =
          URL.createObjectURL(
            blob
          )


        const link =
          document.createElement(
            'a'
          )

        link.href =
          downloadUrl

        link.download =
          fileName


        document.body.appendChild(
          link
        )

        link.click()

        document.body.removeChild(
          link
        )


        URL.revokeObjectURL(
          downloadUrl
        )


        alert(
          'Attendance PNG downloaded. Attach this image in WhatsApp.'
        )


      } catch (shareError) {

        console.error(
          shareError
        )

        alert(
          shareError?.message ||
          'Unable to generate attendance PNG.'
        )

      } finally {

        setSharing(false)
      }
    }


  // =========================================================
  // Loading
  // =========================================================

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


  // =========================================================
  // Error
  // =========================================================

  if (error) {

    return (
      <div className="app">

        <main className="dashboard">

          <p>
            Error loading staff:
            {' '}
            {error}
          </p>

        </main>

      </div>
    )
  }


  // =========================================================
  // Attendance Screen
  // =========================================================

  return (

    <div className="app">

      <header
        className="header attendance-header"
      >

        <button
          className="back-button"
          onClick={onBack}
        >
          ←
        </button>


        <div
          className="attendance-header-title"
        >

          <h1>
            Staff Attendance
          </h1>

          <p>
            RWA Pocket-A
          </p>

        </div>


        <button
          className="manage-staff-button"
          onClick={
            onManageStaff
          }
          title="Manage Staff"
        >

          <Settings
            size={20}
          />

        </button>

      </header>


      <main className="dashboard">


        <div
          className="attendance-title"
        >

          <h2>
            Today's Attendance
          </h2>


          <p>

            {new Date()
              .toLocaleDateString(
                'en-IN',
                {
                  day:
                    '2-digit',

                  month:
                    'short',

                  year:
                    'numeric'
                }
              )}

          </p>

        </div>


        <div
          className="attendance-table"
        >

          <div
            className="
              attendance-row
              attendance-table-header
            "
          >

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


          {staff.map(
            (
              person,
              index
            ) => (

              <div
                className="attendance-row"
                key={
                  person.id
                }
              >

                <div
                  className="employee-icon-wrap"
                >

                  {getProfessionIcon(
                    person.profession
                  )}

                </div>


                <div
                  className="employee-name"
                >

                  {person.name}

                </div>


                <div
                  className="employee-profession"
                >

                  {person.profession}

                </div>


                <div>

                  <button
                    className={
                      `attendance-toggle ${
                        person.present
                          ? 'is-present'
                          : 'is-absent'
                      }`
                    }
                    onClick={
                      () =>
                        toggleAttendance(
                          index
                        )
                    }
                  >

                    {person.present
                      ? '✅'
                      : '❌'
                    }

                  </button>

                </div>

              </div>

            )
          )}

        </div>


        <div
          className="attendance-summary"
        >

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


        <div
          className="external-staff-card"
        >

          <div>

            <h3>
              Noida Authority Sweepers
            </h3>

            <p>
              Available today
            </p>

          </div>


          <div
            className="counter-control"
          >

            <button
              type="button"
              onClick={
                decreaseAuthoritySweepers
              }
            >
              −
            </button>


            <span>
              {authoritySweepers}
            </span>


            <button
              type="button"
              onClick={
                increaseAuthoritySweepers
              }
            >
              +
            </button>

          </div>

        </div>


        <button
          className="save-attendance-button"
          onClick={
            saveAttendance
          }
          disabled={
            saving ||
            (
              saved &&
              !dirty
            )
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


        <button
          className="whatsapp-button"
          onClick={
            shareOnWhatsApp
          }
          disabled={
            !saved ||
            dirty ||
            sharing
          }
        >

          {sharing
            ? 'Generating PNG...'
            : '🟢 Share Attendance PNG'
          }

        </button>

      </main>

    </div>
  )
}


export default Attendance