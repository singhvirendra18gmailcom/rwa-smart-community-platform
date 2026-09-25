import { useState } from 'react'
import { supabase } from './supabase'
import {
  DEFAULT_INSPECTION_CONFIG,
  INSPECTION_THEMES,
  getInspectionTheme,
} from './inspectionConfig'
import './SocietyInspection.css'

export default function SocietyInspectionSettings({
  config,
  onSaved,
  onBack,
}) {
  const [moduleName, setModuleName] = useState(
    config?.module_name || DEFAULT_INSPECTION_CONFIG.module_name
  )
  const [reportTitle, setReportTitle] = useState(
    config?.report_title || DEFAULT_INSPECTION_CONFIG.report_title
  )
  const [themeKey, setThemeKey] = useState(
    config?.theme_key || DEFAULT_INSPECTION_CONFIG.theme_key
  )
  const [supervisorName, setSupervisorName] = useState(
    config?.supervisor_contact_name || ''
  )
  const [supervisorMobile, setSupervisorMobile] = useState(
    config?.supervisor_contact_mobile || ''
  )
  const [rwaName, setRwaName] = useState(
    config?.rwa_contact_name || ''
  )
  const [rwaMobile, setRwaMobile] = useState(
    config?.rwa_contact_mobile || ''
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const saveSettings = async () => {
    const cleanName = moduleName.trim()
    const cleanReportTitle = reportTitle.trim()

    if (cleanName.length < 2 || cleanReportTitle.length < 2) {
      setMessage('Please enter a valid module name and report title.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()

    const payload = {
      id: 1,
      module_name: cleanName,
      report_title: cleanReportTitle,
      theme_key: themeKey,
      supervisor_contact_name: supervisorName.trim() || null,
      supervisor_contact_mobile: supervisorMobile.trim() || null,
      rwa_contact_name: rwaName.trim() || null,
      rwa_contact_mobile: rwaMobile.trim() || null,
      updated_by: userData?.user?.id || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('society_inspection_settings')
      .upsert(payload)
      .select('id,module_name,theme_key,report_title,supervisor_contact_name,supervisor_contact_mobile,rwa_contact_name,rwa_contact_mobile')
      .single()

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    onSaved?.(data)
    setMessage('Settings saved successfully.')
  }

  return (
    <div className="society-settings-page">
      <header className="society-subpage-header">
        <button type="button" onClick={onBack}>←</button>
        <div>
          <span>RWA POCKET-A</span>
          <h1>Inspection Settings</h1>
        </div>
      </header>

      <main className="society-settings-content">
        <section className="society-settings-card">
          <label>
            Module Name
            <input
              value={moduleName}
              maxLength={60}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="Society Pulse"
            />
          </label>

          <label>
            Report Title
            <input
              value={reportTitle}
              maxLength={100}
              onChange={(event) => setReportTitle(event.target.value)}
              placeholder="DAILY SOCIETY INSPECTION SUMMARY"
            />
          </label>

          <div className="society-theme-label">Escalation Contacts</div>

          <div className="society-settings-contact-grid">
            <label>
              Supervisor Name
              <input
                value={supervisorName}
                onChange={(event) => setSupervisorName(event.target.value)}
                placeholder="Supervisor name"
              />
            </label>

            <label>
              Supervisor Mobile
              <input
                type="tel"
                value={supervisorMobile}
                onChange={(event) => setSupervisorMobile(event.target.value)}
                placeholder="Mobile number"
              />
            </label>

            <label>
              RWA Contact Name
              <input
                value={rwaName}
                onChange={(event) => setRwaName(event.target.value)}
                placeholder="RWA contact name"
              />
            </label>

            <label>
              RWA Mobile
              <input
                type="tel"
                value={rwaMobile}
                onChange={(event) => setRwaMobile(event.target.value)}
                placeholder="Mobile number"
              />
            </label>
          </div>

          <div className="society-theme-label">Color Theme</div>

          <div className="society-theme-grid">
            {Object.entries(INSPECTION_THEMES).map(([key, theme]) => (
              <button
                key={key}
                type="button"
                className={`society-theme-option ${themeKey === key ? 'selected' : ''}`}
                onClick={() => setThemeKey(key)}
              >
                <span
                  className="society-theme-dot"
                  style={{ background: theme.primary }}
                />
                {theme.label}
              </button>
            ))}
          </div>

          <div
            className="society-theme-preview"
            style={{
              background: getInspectionTheme(themeKey).soft,
              borderColor: getInspectionTheme(themeKey).primary,
            }}
          >
            <strong style={{ color: getInspectionTheme(themeKey).dark }}>
              {moduleName || 'Society Pulse'}
            </strong>
            <span style={{ color: getInspectionTheme(themeKey).primary }}>
              Theme preview
            </span>
          </div>

          {message && <div className="society-settings-message">{message}</div>}

          <button
            type="button"
            className="society-primary-button"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </section>
      </main>
    </div>
  )
}
