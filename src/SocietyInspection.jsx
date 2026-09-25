import { useState } from 'react'
import TowerInspection from './TowerInspection'
import StreetLightInspection from './StreetLightInspection'
import SocietyInspectionSettings from './SocietyInspectionSettings'
import ServiceAgencies from './ServiceAgencies'
import InspectionActionSummary from './InspectionActionSummary'
import SocietyInspectionSummary from './SocietyInspectionSummary'
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
        <TowerInspection
          onBack={() => setScreen('home')}
          onContinue={() => setScreen('actions')}
        />
      </div>
    )
  }

  if (screen === 'street-lights') {
    return (
      <div style={themeStyle}>
        <StreetLightInspection
          config={config}
          onBack={() => setScreen('actions')}
          onContinue={() => setScreen('final-summary')}
        />
      </div>
    )
  }

  if (screen === 'actions') {
    return (
      <div style={themeStyle}>
        <InspectionActionSummary
          onBack={() => setScreen('tower-park')}
          onStreetLights={() => setScreen('street-lights')}
          onFinalSummary={() => setScreen('final-summary')}
        />
      </div>
    )
  }

  if (screen === 'final-summary') {
    return (
      <div style={themeStyle}>
        <SocietyInspectionSummary
          onBack={() => setScreen('actions')}
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
            <strong>1. Towers & Parks</strong>
            <small>QR + GPS verified field inspection • no tower-wise report</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('actions')}
        >
          <span className="society-hub-icon">📋</span>
          <span>
            <strong>2. Action Summary</strong>
            <small>Review Camera/LED issues and send AMC complaints</small>
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
            <strong>3. Street Lights</strong>
            <small>Fault count + lane/park location + UPPCL/TATA</small>
          </span>
          <b>›</b>
        </button>

        <button
          type="button"
          className="society-hub-card"
          onClick={() => setScreen('final-summary')}
        >
          <span className="society-hub-icon">📊</span>
          <span>
            <strong>4. Final Summary Report</strong>
            <small>Inspection status + complaint status in one report</small>
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
            <strong>Service Agencies & Contacts</strong>
            <small>Manage service providers, Supervisor and RWA Executive contacts</small>
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
