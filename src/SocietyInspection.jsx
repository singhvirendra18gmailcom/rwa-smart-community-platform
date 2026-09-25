import { useState } from 'react'
import TowerInspection from './TowerInspection'
import StreetLightInspection from './StreetLightInspection'
import SocietyInspectionSettings from './SocietyInspectionSettings'
import ServiceAgencies from './ServiceAgencies'
import EscalationContacts from './EscalationContacts'
import { getInspectionTheme, useInspectionConfig } from './inspectionConfig'
import './SocietyInspection.css'

export default function SocietyInspection({ onBack }) {
  const [screen, setScreen] = useState('home')
  const { config, setConfig, loading } = useInspectionConfig()
  const theme = getInspectionTheme(config.theme_key)

  const themeStyle = {
    '--inspection-primary': theme.primary,
    '--inspection-dark': theme.dark,
    '--inspection-soft': theme.soft,
  }

  if (screen === 'tower-park') {
    return (
      <div style={themeStyle}>
        <TowerInspection onBack={() => setScreen('home')} />
      </div>
    )
  }

  if (screen === 'street-lights') {
    return (
      <div style={themeStyle}>
        <StreetLightInspection
          config={config}
          onBack={() => setScreen('home')}
        />
      </div>
    )
  }

  if (screen === 'agencies') {
    return (
      <div style={themeStyle}>
        <ServiceAgencies
          onBack={() => setScreen('home')}
        />
      </div>
    )
  }

  if (screen === 'escalation-contacts') {
    return (
      <div style={themeStyle}>
        <EscalationContacts onBack={() => setScreen('home')} />
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div style={themeStyle}>
        <SocietyInspectionSettings
          config={config}
          onSaved={setConfig}
          onBack={() => setScreen('home')}
        />
      </div>
    )
  }

  return (
    <div className="society-inspection-hub" style={themeStyle}>
      <header className="society-inspection-hub-header">
        <button type="button" onClick={onBack} className="society-hub-back">
          ←
        </button>

        <div>
          <div className="society-hub-brand">RWA POCKET-A</div>
          <h1>{loading ? 'Society Inspection' : config.module_name}</h1>
          <p>Inspect • Identify • Act • Resolve</p>
        </div>

        <button
          type="button"
          className="society-hub-settings"
          onClick={() => setScreen('settings')}
          aria-label="Inspection settings"
        >
          ⚙
        </button>
      </header>

      <main className="society-inspection-hub-content">
        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('tower-park')}
        >
          <span className="society-hub-icon">🏢</span>
          <span>
            <strong>Towers & Parks</strong>
            <small>QR + GPS verified daily inspection</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('street-lights')}
        >
          <span className="society-hub-icon">💡</span>
          <span>
            <strong>Street Lights</strong>
            <small>UPPCL & TATA fault inspection with locations</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('agencies')}
        >
          <span className="society-hub-icon">🏢</span>
          <span>
            <strong>Service Agencies</strong>
            <small>Manage vendors, departments, contacts and responsibilities</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('escalation-contacts')}
        >
          <span className="society-hub-icon">📞</span>
          <span>
            <strong>Service Contacts</strong>
            <small>RWA staff and executive contacts by service category</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card society-hub-card-muted"
          onClick={() => setScreen('settings')}
        >
          <span className="society-hub-icon">🎨</span>
          <span>
            <strong>Module Settings</strong>
            <small>Configure name, report title and color theme</small>
          </span>
          <b>›</b>
        </button>
      </main>
    </div>
  )
}
