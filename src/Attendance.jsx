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
// Canvas Helper
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
  const r = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()

  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)

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
      ctx.measureText(testLine).width

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


// =========================================================
// Simple Community / People Icon
// =========================================================

function drawPeopleIcon(
  ctx,
  centerX,
  centerY
) {
  ctx.save()

  ctx.fillStyle = '#d9ecff'

  // Centre head
  ctx.beginPath()
  ctx.arc(
    centerX,
    centerY - 18,
    13,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Left head
  ctx.beginPath()
  ctx.arc(
    centerX - 31,
    centerY - 8,
    10,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Right head
  ctx.beginPath()
  ctx.arc(
    centerX + 31,
    centerY - 8,
    10,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Centre body
  drawRoundedRect(
    ctx,
    centerX - 23,
    centerY,
    46,
    34,
    15,
    '#d9ecff'
  )

  // Left body
  drawRoundedRect(
    ctx,
    centerX - 48,
    centerY + 3,
    28,
    27,
    12,
    '#d9ecff'
  )

  // Right body
  drawRoundedRect(
    ctx,
    centerX + 20,
    centerY + 3,
    28,
    27,
    12,
    '#d9ecff'
  )

  ctx.restore()
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
    const now = new Date()

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

    return `${year}-${month}-${day}`
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


    // ---------------------------------------------------------
    // Load active RWA staff
    // ---------------------------------------------------------

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


    // ---------------------------------------------------------
    // Load today's attendance
    // ---------------------------------------------------------

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


    // ---------------------------------------------------------
    // Load Noida Authority sweepers
    // ---------------------------------------------------------

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


    // ---------------------------------------------------------
    // Merge staff + attendance
    // ---------------------------------------------------------

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
  // Attendance Toggle
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
  // Authority Sweeper Counter
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
  // Profession Icon
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
  // Generate PNG
  // =========================================================

  const generateAttendancePng =
    async () => {

      const width = 1080

      // -------------------------------------------------------
      // Layout dimensions
      // -------------------------------------------------------

      const headerY = 25
      const headerHeight = 205

      const tableHeaderY = 245
      const tableHeaderHeight = 58

      const rowHeight = 76

      const tableRowsHeight =
        staff.length *
        rowHeight

      const summaryY =
        tableHeaderY +
        tableHeaderHeight +
        tableRowsHeight +
        20

      const summaryHeight = 165

      const authorityY =
        summaryY +
        summaryHeight +
        18

      const authorityHeight = 120

      const footerY =
        authorityY +
        authorityHeight +
        18

      const footerHeight = 185

      const height =
        footerY +
        footerHeight +
        30


      const canvas =
        document.createElement(
          'canvas'
        )

      canvas.width = width
      canvas.height = height


      const ctx =
        canvas.getContext(
          '2d'
        )


      if (!ctx) {
        throw new Error(
          'Unable to create attendance image.'
        )
      }


      // =====================================================
      // Background
      // =====================================================

      ctx.fillStyle =
        '#ffffff'

      ctx.fillRect(
        0,
        0,
        width,
        height
      )


      // =====================================================
      // Header
      // =====================================================

      const headerX = 15
      const headerWidth = 1050


      const headerGradient =
        ctx.createLinearGradient(
          headerX,
          headerY,
          headerX +
            headerWidth,
          headerY
        )


      headerGradient.addColorStop(
        0,
        '#174879'
      )

      headerGradient.addColorStop(
        1,
        '#1670ad'
      )


      drawRoundedRect(
        ctx,
        headerX,
        headerY,
        headerWidth,
        headerHeight,
        24,
        headerGradient
      )


      // -----------------------------------------------------
      // Left people/community icon
      // -----------------------------------------------------

      drawPeopleIcon(
        ctx,
        100,
        112
      )


      // -----------------------------------------------------
      // Header centred content
      // -----------------------------------------------------

      ctx.textAlign =
        'center'

      ctx.fillStyle =
        '#ffffff'


      ctx.font =
        '700 47px Arial, sans-serif'

      ctx.fillText(
        'RWA POCKET-A',
        width / 2,
        93
      )


      ctx.font =
        '700 31px Arial, sans-serif'

      ctx.fillText(
        'STAFF DAILY ATTENDANCE',
        width / 2,
        145
      )


      ctx.fillStyle =
        '#d9ebfa'

      ctx.font =
        '400 28px Arial, sans-serif'

      ctx.fillText(
        getDisplayDate(),
        width / 2,
        195
      )


      // -----------------------------------------------------
      // Right slogan
      // -----------------------------------------------------

      ctx.strokeStyle =
        '#65b9e8'

      ctx.lineWidth = 2

      ctx.beginPath()

      ctx.moveTo(
        870,
        60
      )

      ctx.lineTo(
        870,
        190
      )

      ctx.stroke()


      ctx.textAlign =
        'left'

      ctx.fillStyle =
        '#cce8f7'

      ctx.font =
        '700 15px Arial, sans-serif'


      ctx.fillText(
        'CLEANER',
        905,
        90
      )

      ctx.fillText(
        'SAFER',
        905,
        119
      )

      ctx.fillText(
        'GREENER',
        905,
        148
      )

      ctx.fillText(
        'TOGETHER',
        905,
        177
      )


      // =====================================================
      // Table Header
      // =====================================================

      drawRoundedRect(
        ctx,
        15,
        tableHeaderY,
        1050,
        tableHeaderHeight,
        15,
        '#eaf5ff',
        '#71b9f3',
        1.5
      )


      ctx.fillStyle =
        '#142f57'

      ctx.font =
        '700 21px Arial, sans-serif'

      ctx.textAlign =
        'left'


      ctx.fillText(
        '#',
        58,
        tableHeaderY + 37
      )


      ctx.fillText(
        'Name',
        150,
        tableHeaderY + 37
      )


      ctx.fillText(
        'Role',
        510,
        tableHeaderY + 37
      )


      ctx.fillText(
        'Attendance',
        835,
        tableHeaderY + 37
      )


      // =====================================================
      // Staff Rows
      // =====================================================

      staff.forEach(
        (
          person,
          index
        ) => {

          const y =
            tableHeaderY +
            tableHeaderHeight +
            index *
              rowHeight


          const rowBackground =
            index % 2 === 0
              ? '#ffffff'
              : '#f7fbfe'


          drawRoundedRect(
            ctx,
            15,
            y,
            1050,
            rowHeight - 4,
            14,
            rowBackground,
            '#d2e1ee',
            1.2
          )


          // -------------------------------------------------
          // Number circle
          // -------------------------------------------------

          ctx.beginPath()

          ctx.fillStyle =
            '#dcefff'

          ctx.arc(
            67,
            y + 35,
            26,
            0,
            Math.PI * 2
          )

          ctx.fill()


          ctx.textAlign =
            'center'

          ctx.textBaseline =
            'middle'

          ctx.fillStyle =
            '#1767b3'

          ctx.font =
            '600 21px Arial, sans-serif'


          ctx.fillText(
            String(
              index + 1
            ),
            67,
            y + 35
          )


          ctx.textBaseline =
            'alphabetic'

          ctx.textAlign =
            'left'


          // -------------------------------------------------
          // Name
          // -------------------------------------------------

          ctx.fillStyle =
            '#112e56'

          ctx.font =
            '700 23px Arial, sans-serif'


          ctx.fillText(
            person.name,
            150,
            y + 43
          )


          // -------------------------------------------------
          // Role
          // -------------------------------------------------

          ctx.fillStyle =
            '#334f77'

          ctx.font =
            '400 22px Arial, sans-serif'


          ctx.fillText(
            person.profession,
            510,
            y + 43
          )


          // -------------------------------------------------
          // Attendance badge
          // -------------------------------------------------

          const badgeX = 815
          const badgeY = y + 13
          const badgeWidth = 225
          const badgeHeight = 47


          if (
            person.present
          ) {

            drawRoundedRect(
              ctx,
              badgeX,
              badgeY,
              badgeWidth,
              badgeHeight,
              24,
              '#ddf8e7'
            )


            ctx.beginPath()

            ctx.fillStyle =
              '#08965a'

            ctx.arc(
              badgeX + 27,
              badgeY + 23,
              10,
              0,
              Math.PI * 2
            )

            ctx.fill()


            ctx.fillStyle =
              '#087e4b'

            ctx.font =
              '700 19px Arial, sans-serif'


            ctx.fillText(
              'PRESENT',
              badgeX + 56,
              badgeY + 31
            )

          } else {

            drawRoundedRect(
              ctx,
              badgeX,
              badgeY,
              badgeWidth,
              badgeHeight,
              24,
              '#fde0e7'
            )


            ctx.beginPath()

            ctx.fillStyle =
              '#e31b35'

            ctx.arc(
              badgeX + 27,
              badgeY + 23,
              10,
              0,
              Math.PI * 2
            )

            ctx.fill()


            ctx.fillStyle =
              '#d81f35'

            ctx.font =
              '700 19px Arial, sans-serif'


            ctx.fillText(
              'ABSENT',
              badgeX + 56,
              badgeY + 31
            )
          }
        }
      )


      // =====================================================
      // Today's Summary
      // =====================================================

      drawRoundedRect(
        ctx,
        15,
        summaryY,
        1050,
        summaryHeight,
        18,
        '#eef7ff',
        '#54b2f4',
        2
      )


      ctx.textAlign =
        'left'

      ctx.fillStyle =
        '#102d58'

      ctx.font =
        '700 25px Arial, sans-serif'


      ctx.fillText(
        "TODAY'S SUMMARY",
        50,
        summaryY + 42
      )


      // -----------------------------------------------------
      // Present
      // -----------------------------------------------------

      ctx.textAlign =
        'center'


      ctx.fillStyle =
        '#079954'

      ctx.font =
        '700 28px Arial, sans-serif'


      ctx.fillText(
        String(
          presentCount
        ),
        190,
        summaryY + 100
      )


      ctx.fillStyle =
        '#3e5473'

      ctx.font =
        '400 18px Arial, sans-serif'


      ctx.fillText(
        'Present',
        190,
        summaryY + 128
      )


      // Divider 1

      ctx.fillStyle =
        '#aed7f3'

      ctx.fillRect(
        370,
        summaryY + 70,
        2,
        70
      )


      // -----------------------------------------------------
      // Absent
      // -----------------------------------------------------

      ctx.fillStyle =
        '#dc2935'

      ctx.font =
        '700 28px Arial, sans-serif'


      ctx.fillText(
        String(
          absentCount
        ),
        540,
        summaryY + 100
      )


      ctx.fillStyle =
        '#3e5473'

      ctx.font =
        '400 18px Arial, sans-serif'


      ctx.fillText(
        'Absent',
        540,
        summaryY + 128
      )


      // Divider 2

      ctx.fillStyle =
        '#aed7f3'

      ctx.fillRect(
        710,
        summaryY + 70,
        2,
        70
      )


      // -----------------------------------------------------
      // Total
      // -----------------------------------------------------

      ctx.fillStyle =
        '#126bd1'

      ctx.font =
        '700 28px Arial, sans-serif'


      ctx.fillText(
        String(
          staff.length
        ),
        890,
        summaryY + 100
      )


      ctx.fillStyle =
        '#3e5473'

      ctx.font =
        '400 18px Arial, sans-serif'


      ctx.fillText(
        'Total Staff',
        890,
        summaryY + 128
      )


      // =====================================================
      // Noida Authority Sweepers
      // =====================================================

      drawRoundedRect(
        ctx,
        15,
        authorityY,
        1050,
        authorityHeight,
        18,
        '#effcf5',
        '#59dc9b',
        2
      )


      // People icon

      drawPeopleIcon(
        ctx,
        105,
        authorityY + 60
      )


      // Vertical separator

      ctx.fillStyle =
        '#62d7a2'

      ctx.fillRect(
        185,
        authorityY + 26,
        2,
        68
      )


      ctx.textAlign =
        'left'

      ctx.fillStyle =
        '#102d58'

      ctx.font =
        '700 23px Arial, sans-serif'


      ctx.fillText(
        'Noida Authority Sweepers available today :',
        225,
        authorityY + 70
      )


      // Count badge

      drawRoundedRect(
        ctx,
        875,
        authorityY + 18,
        160,
        84,
        17,
        '#d7f7e4',
        '#68dfa6',
        1.5
      )


      ctx.textAlign =
        'center'

      ctx.fillStyle =
        '#079954'

      ctx.font =
        '700 38px Arial, sans-serif'


      ctx.fillText(
        String(
          authoritySweepers
        ),
        955,
        authorityY + 70
      )


      // =====================================================
      // Footer
      // =====================================================

      drawRoundedRect(
        ctx,
        15,
        footerY,
        1050,
        footerHeight,
        18,
        '#fffaf0',
        '#e5b42d',
        2
      )


      // -----------------------------------------------------
      // Small gear style icon
      // -----------------------------------------------------

      ctx.beginPath()

      ctx.fillStyle =
        '#f3aa11'

      ctx.arc(
        105,
        footerY + 68,
        26,
        0,
        Math.PI * 2
      )

      ctx.fill()


      ctx.beginPath()

      ctx.fillStyle =
        '#ffffff'

      ctx.arc(
        105,
        footerY + 68,
        9,
        0,
        Math.PI * 2
      )

      ctx.fill()


      // Vertical separator

      ctx.fillStyle =
        '#94aac0'

      ctx.fillRect(
        185,
        footerY + 30,
        2,
        75
      )


      // Footer message

      ctx.textAlign =
        'left'

      ctx.fillStyle =
        '#17365e'

      ctx.font =
        '400 19px Arial, sans-serif'


      wrapCanvasText(
        ctx,
        'Powered by the RWA Pocket-A in-house App — a step towards smarter, transparent & technology-driven RWA management.',
        225,
        footerY + 55,
        785,
        30
      )


      // Horizontal divider

      ctx.fillStyle =
        '#9baebe'

      ctx.fillRect(
        55,
        footerY + 128,
        970,
        1.5
      )


      // Supervisor

      ctx.textAlign =
        'center'

      ctx.fillStyle =
        '#2c486c'

      ctx.font =
        '700 21px Arial, sans-serif'


      ctx.fillText(
        'Supervisor Pocket-A',
        width / 2,
        footerY + 166
      )


      // =====================================================
      // Canvas → PNG
      // =====================================================

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
              type:
                'image/png'
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


        // -----------------------------------------------------
        // Mobile share sheet
        // -----------------------------------------------------

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


        // -----------------------------------------------------
        // Desktop fallback
        // -----------------------------------------------------

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


      } catch (
        shareError
      ) {

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


        {/* =====================================================
            RWA Staff Attendance
        ====================================================== */}

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
              Role
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


        {/* =====================================================
            Summary
        ====================================================== */}

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


        {/* =====================================================
            Noida Authority Sweepers
        ====================================================== */}

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


        {/* =====================================================
            Save
        ====================================================== */}

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


        {/* =====================================================
            Share PNG
        ====================================================== */}

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