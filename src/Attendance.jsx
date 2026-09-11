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
// WhatsApp Icon
// =========================================================

function WhatsAppIcon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="#25D366"
      />

      <path
        d="M8.2 7.4c.2-.5.4-.5.8-.5h.6c.2 0 .4.1.5.4l.9 2.1c.1.3.1.5-.1.7l-.7.9c-.2.2-.2.4 0 .7.5.9 1.2 1.6 2 2.1.3.2.5.2.7 0l.9-1.1c.2-.2.4-.3.7-.2l2.2 1c.3.1.4.3.4.6 0 .4-.2 1.4-1 2-.8.7-1.8 1-2.8.8-1.1-.2-2.3-.7-3.4-1.5-1-.7-1.9-1.6-2.6-2.6-.8-1.1-1.3-2.3-1.5-3.4-.2-.8.1-1.6.5-2Z"
        fill="#ffffff"
      />

      <path
        d="M5.7 18.1 6.4 15.8"
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}


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

      // =======================================================
      // Mobile-first WhatsApp attendance report
      // =======================================================
      // This changes ONLY the generated PNG.
      // Attendance screen UI remains unchanged.
      // =======================================================

      const width = 1080
      const pagePadding = 20
      const contentWidth = width - pagePadding * 2

      const reportDate = new Date()
      const weekday = reportDate
        .toLocaleDateString('en-GB', { weekday: 'short' })
        .toUpperCase()
      const reportDisplayDate = `${getDisplayDate()} (${weekday})`

      // -------------------------------------------------------
      // Layout
      // -------------------------------------------------------

      const headerY = 20
      const headerHeight = 198

      const summaryY = headerY + headerHeight + 14
      const summaryHeight = 136
      const summaryGap = 16
      const summaryCardWidth =
        (contentWidth - summaryGap * 2) / 3

      const tableHeaderY = summaryY + summaryHeight + 16
      const tableHeaderHeight = 66

      const rowHeight = 82
      const rowsHeight = staff.length * rowHeight

      const authorityY =
        tableHeaderY +
        tableHeaderHeight +
        rowsHeight +
        16
      const authorityHeight = 122

      const poweredY = authorityY + authorityHeight + 16
      const poweredHeight = 122

      const footerY = poweredY + poweredHeight + 14
      const footerHeight = 112

      const height = footerY + footerHeight + 20

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Unable to create attendance image.')
      }

      // -------------------------------------------------------
      // Local drawing helpers used only by the PNG
      // -------------------------------------------------------

      const drawCheck = (cx, cy, radius) => {
        ctx.save()
        ctx.beginPath()
        ctx.fillStyle = '#10a565'
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - radius * 0.45, cy)
        ctx.lineTo(cx - radius * 0.10, cy + radius * 0.34)
        ctx.lineTo(cx + radius * 0.50, cy - radius * 0.40)
        ctx.stroke()
        ctx.restore()
      }

      const drawCross = (cx, cy, radius) => {
        ctx.save()
        ctx.beginPath()
        ctx.fillStyle = '#ef3340'
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - radius * 0.38, cy - radius * 0.38)
        ctx.lineTo(cx + radius * 0.38, cy + radius * 0.38)
        ctx.moveTo(cx + radius * 0.38, cy - radius * 0.38)
        ctx.lineTo(cx - radius * 0.38, cy + radius * 0.38)
        ctx.stroke()
        ctx.restore()
      }

      const drawPeopleBadge = (cx, cy, scale = 1, fill = '#d9ecff') => {
        ctx.save()
        ctx.fillStyle = fill

        ctx.beginPath()
        ctx.arc(cx, cy - 12 * scale, 12 * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx - 26 * scale, cy - 4 * scale, 9 * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx + 26 * scale, cy - 4 * scale, 9 * scale, 0, Math.PI * 2)
        ctx.fill()

        drawRoundedRect(
          ctx,
          cx - 23 * scale,
          cy + 2 * scale,
          46 * scale,
          30 * scale,
          14 * scale,
          fill
        )
        drawRoundedRect(
          ctx,
          cx - 44 * scale,
          cy + 5 * scale,
          25 * scale,
          23 * scale,
          11 * scale,
          fill
        )
        drawRoundedRect(
          ctx,
          cx + 19 * scale,
          cy + 5 * scale,
          25 * scale,
          23 * scale,
          11 * scale,
          fill
        )
        ctx.restore()
      }

      const drawRoleIcon = (profession, cx, cy) => {
        ctx.save()

        // soft icon background
        let bg = '#edf5ff'
        let fg = '#2469aa'

        if (profession === 'Electrician') {
          bg = '#fff7df'
          fg = '#e7a100'
        } else if (profession === 'Gardener') {
          bg = '#eff9e8'
          fg = '#5eaf38'
        } else if (profession === 'Sweeper') {
          bg = '#fff5e6'
          fg = '#e48a17'
        } else if (profession === 'Housekeeping') {
          bg = '#f4ecff'
          fg = '#8544b1'
        } else if (profession === 'Plumber') {
          bg = '#eaf6ff'
          fg = '#3a86c8'
        }

        drawRoundedRect(
          ctx,
          cx - 24,
          cy - 24,
          48,
          48,
          18,
          bg
        )

        ctx.strokeStyle = fg
        ctx.fillStyle = fg
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        switch (profession) {
          case 'Supervisor': {
            ctx.beginPath()
            ctx.arc(cx, cy - 7, 8, 0, Math.PI * 2)
            ctx.fill()
            drawRoundedRect(ctx, cx - 11, cy + 3, 22, 15, 7, fg)
            ctx.beginPath()
            ctx.moveTo(cx - 13, cy + 15)
            ctx.lineTo(cx + 13, cy + 15)
            ctx.stroke()
            break
          }

          case 'Electrician': {
            ctx.beginPath()
            ctx.moveTo(cx + 3, cy - 20)
            ctx.lineTo(cx - 11, cy + 2)
            ctx.lineTo(cx - 1, cy + 2)
            ctx.lineTo(cx - 7, cy + 21)
            ctx.lineTo(cx + 13, cy - 5)
            ctx.lineTo(cx + 3, cy - 5)
            ctx.closePath()
            ctx.fill()
            break
          }

          case 'Plumber': {
            ctx.beginPath()
            ctx.arc(cx - 6, cy - 5, 8, 0.45, Math.PI * 1.55)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(cx - 1, cy + 1)
            ctx.lineTo(cx + 13, cy + 15)
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(cx + 13, cy + 15, 4, 0, Math.PI * 2)
            ctx.fill()
            break
          }

          case 'Gardener': {
            ctx.beginPath()
            ctx.ellipse(cx + 2, cy - 3, 12, 7, -0.6, 0, Math.PI * 2)
            ctx.fill()
            ctx.beginPath()
            ctx.moveTo(cx - 10, cy + 16)
            ctx.lineTo(cx + 7, cy - 7)
            ctx.stroke()
            break
          }

          case 'Sweeper': {
            ctx.beginPath()
            ctx.moveTo(cx + 8, cy - 18)
            ctx.lineTo(cx - 2, cy + 6)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(cx - 11, cy + 4)
            ctx.lineTo(cx + 2, cy + 9)
            ctx.lineTo(cx - 3, cy + 20)
            ctx.lineTo(cx - 16, cy + 15)
            ctx.closePath()
            ctx.fill()
            break
          }

          case 'Housekeeping': {
            ctx.beginPath()
            ctx.moveTo(cx - 14, cy - 1)
            ctx.lineTo(cx, cy - 14)
            ctx.lineTo(cx + 14, cy - 1)
            ctx.stroke()
            drawRoundedRect(ctx, cx - 10, cy - 1, 20, 18, 2, fg)
            break
          }

          default: {
            ctx.beginPath()
            ctx.arc(cx, cy - 6, 8, 0, Math.PI * 2)
            ctx.fill()
            drawRoundedRect(ctx, cx - 11, cy + 4, 22, 14, 7, fg)
          }
        }

        ctx.restore()
      }

      const drawSummaryCard = ({
        x,
        icon,
        value,
        label,
        background,
        border,
        valueColor
      }) => {
        drawRoundedRect(
          ctx,
          x,
          summaryY,
          summaryCardWidth,
          summaryHeight,
          22,
          background,
          border,
          1.5
        )

        if (icon === 'check') {
          drawCheck(x + 67, summaryY + 58, 32)
        } else if (icon === 'cross') {
          drawCross(x + 67, summaryY + 58, 32)
        } else {
          drawRoundedRect(
            ctx,
            x + 34,
            summaryY + 26,
            66,
            66,
            28,
            '#d8ecff'
          )
          drawPeopleBadge(
            x + 67,
            summaryY + 59,
            0.6,
            '#1670c7'
          )
        }

        ctx.textAlign = 'left'
        ctx.fillStyle = valueColor
        ctx.font = '700 52px Arial, sans-serif'
        ctx.fillText(
          String(value),
          x + 122,
          summaryY + 69
        )

        ctx.font = '700 27px Arial, sans-serif'
        ctx.fillText(
          label,
          x + 122,
          summaryY + 107
        )
      }

      // =====================================================
      // Background
      // =====================================================

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      // =====================================================
      // Header
      // =====================================================

      const headerGradient = ctx.createLinearGradient(
        pagePadding,
        headerY,
        pagePadding + contentWidth,
        headerY
      )
      headerGradient.addColorStop(0, '#0f4c84')
      headerGradient.addColorStop(1, '#0884c4')

      drawRoundedRect(
        ctx,
        pagePadding,
        headerY,
        contentWidth,
        headerHeight,
        26,
        headerGradient
      )

      drawPeopleBadge(
        105,
        headerY + 96,
        1.1,
        '#d9ecff'
      )

      ctx.fillStyle = '#70b8df'
      ctx.fillRect(205, headerY + 30, 2, 138)
      ctx.fillRect(820, headerY + 30, 2, 138)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 48px Arial, sans-serif'
      ctx.fillText('RWA POCKET-A', 510, headerY + 60)

      ctx.font = '700 31px Arial, sans-serif'
      ctx.fillText(
        'STAFF DAILY ATTENDANCE',
        510,
        headerY + 106
      )

      drawRoundedRect(
        ctx,
        355,
        headerY + 127,
        310,
        46,
        16,
        'rgba(255,255,255,0.10)',
        '#66b8e8',
        1.4
      )

      // Date text must be reset to solid white because
      // drawRoundedRect above changes ctx.fillStyle.
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 23px Arial, sans-serif'
      ctx.fillText(
        reportDisplayDate,
        510,
        headerY + 158
      )

      ctx.textAlign = 'left'
      ctx.fillStyle = '#dff2ff'
      ctx.font = '700 18px Arial, sans-serif'
      ctx.fillText('CLEANER', 866, headerY + 60)
      ctx.fillText('SAFER', 866, headerY + 88)
      ctx.fillText('GREENER', 866, headerY + 116)
      ctx.fillText('TOGETHER', 866, headerY + 144)

      // =====================================================
      // Summary cards
      // =====================================================

      drawSummaryCard({
        x: pagePadding,
        icon: 'check',
        value: presentCount,
        label: 'Present',
        background: '#f0fbf5',
        border: '#b2e8ca',
        valueColor: '#0e8f57'
      })

      drawSummaryCard({
        x: pagePadding + summaryCardWidth + summaryGap,
        icon: 'cross',
        value: absentCount,
        label: 'Absent',
        background: '#fff3f4',
        border: '#f2c2c8',
        valueColor: '#d71929'
      })

      drawSummaryCard({
        x: pagePadding + (summaryCardWidth + summaryGap) * 2,
        icon: 'people',
        value: staff.length,
        label: 'Total Staff',
        background: '#f1f7ff',
        border: '#bcdcff',
        valueColor: '#0f63b3'
      })

      // =====================================================
      // Table header
      // =====================================================

      const tableGradient = ctx.createLinearGradient(
        pagePadding,
        tableHeaderY,
        pagePadding + contentWidth,
        tableHeaderY
      )
      tableGradient.addColorStop(0, '#0c4f87')
      tableGradient.addColorStop(1, '#087fbd')

      drawRoundedRect(
        ctx,
        pagePadding,
        tableHeaderY,
        contentWidth,
        tableHeaderHeight,
        18,
        tableGradient
      )

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 24px Arial, sans-serif'
      ctx.fillText('#', 59, tableHeaderY + tableHeaderHeight / 2)
      ctx.fillText(
        'STAFF  (Name & Role)',
        155,
        tableHeaderY + tableHeaderHeight / 2
      )
      ctx.fillText(
        'ATTENDANCE',
        803,
        tableHeaderY + tableHeaderHeight / 2
      )
      ctx.textBaseline = 'alphabetic'

      // =====================================================
      // Staff rows
      // =====================================================

      staff.forEach((person, index) => {
        const y =
          tableHeaderY +
          tableHeaderHeight +
          index * rowHeight

        const fill = index % 2 === 0
          ? '#ffffff'
          : '#f8fbfd'

        drawRoundedRect(
          ctx,
          pagePadding,
          y,
          contentWidth,
          rowHeight - 2,
          15,
          fill,
          '#cfe0ec',
          1.2
        )

        drawRoundedRect(
          ctx,
          38,
          y + 16,
          50,
          50,
          20,
          '#e7f4ff'
        )

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#0f68b2'
        ctx.font = '700 23px Arial, sans-serif'
        ctx.fillText(String(index + 1), 63, y + 41)

        drawRoleIcon(
          person.profession,
          130,
          y + 41
        )

        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'

        const staffTextY = y + rowHeight / 2
        const staffNameX = 185

        ctx.fillStyle = '#11355f'
        ctx.font = '700 34px Arial, sans-serif'
        ctx.fillText(
          person.name,
          staffNameX,
          staffTextY
        )

        const staffNameWidth =
          ctx.measureText(
            person.name
          ).width

        ctx.fillStyle = '#536b86'
        ctx.font = '500 21px Arial, sans-serif'
        ctx.fillText(
          `— ${person.profession}`,
          staffNameX +
            staffNameWidth +
            18,
          staffTextY
        )

        const badgeX = 785
        const badgeY = y + 18
        const badgeWidth = 245
        const badgeHeight = 48

        if (person.present) {
          drawRoundedRect(
            ctx,
            badgeX,
            badgeY,
            badgeWidth,
            badgeHeight,
            24,
            '#dcf7e7'
          )

          ctx.beginPath()
          ctx.fillStyle = '#0fa15f'
          ctx.arc(
            badgeX + 25,
            badgeY + 24,
            9,
            0,
            Math.PI * 2
          )
          ctx.fill()

          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#087d4a'
          ctx.font = '700 23px Arial, sans-serif'
          ctx.fillText(
            'PRESENT',
            badgeX + 50,
            badgeY + 25
          )
        } else {
          drawRoundedRect(
            ctx,
            badgeX,
            badgeY,
            badgeWidth,
            badgeHeight,
            24,
            '#fde4e8'
          )

          ctx.beginPath()
          ctx.fillStyle = '#df2f42'
          ctx.arc(
            badgeX + 25,
            badgeY + 24,
            9,
            0,
            Math.PI * 2
          )
          ctx.fill()

          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#ca2335'
          ctx.font = '700 23px Arial, sans-serif'
          ctx.fillText(
            'ABSENT',
            badgeX + 50,
            badgeY + 25
          )
        }

        ctx.textBaseline = 'alphabetic'
      })

      // =====================================================
      // Noida Authority Sweepers
      // =====================================================

      drawRoundedRect(
        ctx,
        pagePadding,
        authorityY,
        contentWidth,
        authorityHeight,
        22,
        '#f0fbf5',
        '#55cf8f',
        1.8
      )

      drawPeopleBadge(
        92,
        authorityY + 64,
        0.85,
        '#2eb774'
      )

      ctx.fillStyle = '#43c684'
      ctx.fillRect(
        170,
        authorityY + 26,
        2,
        72
      )

      ctx.textAlign = 'left'
      ctx.fillStyle = '#11355f'
      ctx.font = '700 28px Arial, sans-serif'
      ctx.fillText(
        'Noida Authority Sweepers',
        205,
        authorityY + 52
      )

      ctx.fillStyle = '#536b86'
      ctx.font = '500 21px Arial, sans-serif'
      ctx.fillText(
        'Available today',
        205,
        authorityY + 82
      )

      drawRoundedRect(
        ctx,
        860,
        authorityY + 22,
        170,
        78,
        20,
        '#d9f6e4',
        '#70d8a2',
        1.5
      )

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#079552'
      ctx.font = '700 42px Arial, sans-serif'
      ctx.fillText(
        String(authoritySweepers),
        945,
        authorityY + 61
      )
      ctx.textBaseline = 'alphabetic'

      // =====================================================
      // Powered-by panel
      // =====================================================

      drawRoundedRect(
        ctx,
        pagePadding,
        poweredY,
        contentWidth,
        poweredHeight,
        22,
        '#fffaf0',
        '#eab62c',
        1.8
      )

      ctx.beginPath()
      ctx.fillStyle = '#f3aa11'
      ctx.arc(
        82,
        poweredY + 55,
        26,
        0,
        Math.PI * 2
      )
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.font = '700 24px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('★', 82, poweredY + 56)

      ctx.fillStyle = '#98a8b8'
      ctx.fillRect(
        155,
        poweredY + 24,
        2,
        72
      )

      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#14365e'
      ctx.font = '700 22px Arial, sans-serif'
      ctx.fillText(
        'Powered by the RWA Pocket-A in-house App —',
        192,
        poweredY + 48
      )

      ctx.fillStyle = '#3f5872'
      ctx.font = '500 20px Arial, sans-serif'
      ctx.fillText(
        'a step towards smarter, transparent & technology-driven RWA management.',
        192,
        poweredY + 80
      )

      // =====================================================
      // Footer
      // =====================================================

      const footerGradient = ctx.createLinearGradient(
        pagePadding,
        footerY,
        pagePadding + contentWidth,
        footerY
      )
      footerGradient.addColorStop(0, '#075596')
      footerGradient.addColorStop(1, '#0677b7')

      drawRoundedRect(
        ctx,
        pagePadding,
        footerY,
        contentWidth,
        footerHeight,
        22,
        footerGradient
      )

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 30px Arial, sans-serif'
      ctx.fillText(
        'RWA Pocket-A',
        width / 2,
        footerY + 45
      )

      ctx.fillStyle = '#d8eefc'
      ctx.font = '500 18px Arial, sans-serif'
      ctx.fillText(
        'T O G E T H E R   F O R   A   B E T T E R   C O M M U N I T Y',
        width / 2,
        footerY + 78
      )

      // =====================================================
      // Canvas → PNG
      // =====================================================

      // Use toDataURL -> Blob instead of canvas.toBlob().
      // Some mobile/PWA browsers can leave toBlob callbacks pending,
      // which makes the button stay on "Generating PNG..." forever.
      const dataUrl = canvas.toDataURL(
        'image/png',
        1
      )

      const base64Data =
        dataUrl.split(',')[1]

      if (!base64Data) {
        throw new Error(
          'Unable to generate PNG report.'
        )
      }

      const binary =
        atob(base64Data)

      const bytes =
        new Uint8Array(
          binary.length
        )

      for (
        let i = 0;
        i < binary.length;
        i += 1
      ) {
        bytes[i] =
          binary.charCodeAt(i)
      }

      return new Blob(
        [bytes],
        {
          type: 'image/png'
        }
      )
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


        // PNG is ready now. Do not keep the UI stuck on
        // "Generating PNG..." while the native share sheet is open.
        setSharing(false)


        const downloadPng = () => {

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


          // Do not revoke immediately. Some mobile/desktop browsers
          // need a little time to start the actual file download.
          window.setTimeout(
            () => {
              URL.revokeObjectURL(
                downloadUrl
              )
            },
            30000
          )
        }


        const isMobileDevice =
          /Android|iPhone|iPad|iPod/i.test(
            navigator.userAgent
          )


        // -----------------------------------------------------
        // Mobile: use native share sheet when file sharing works
        // -----------------------------------------------------

        if (
          isMobileDevice &&
          navigator.share
        ) {

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
            true


          if (
            navigator.canShare
          ) {
            try {
              canShareFiles =
                navigator.canShare({
                  files: [file]
                })
            } catch {
              canShareFiles =
                false
            }
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
                'Native share failed:',
                shareError
              )
            }
          }
        }


        // -----------------------------------------------------
        // Desktop / unsupported mobile share: download PNG
        // -----------------------------------------------------

        downloadPng()

        alert(
          'Attendance PNG generated successfully. The image has been downloaded.'
        )


      } catch (
        shareError
      ) {

        console.error(
          'Attendance PNG error:',
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
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >

          {sharing ? (
            'Generating PNG...'
          ) : (
            <>
              <WhatsAppIcon size={22} />
              <span>Share Attendance PNG</span>
            </>
          )}

        </button>

      </main>

    </div>
  )
}


export default Attendance
