import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('RWA app render failed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '24px',
            background: '#fff4f4',
            color: '#8b1e1e',
            fontFamily: 'Arial, sans-serif'
          }}
        >
          <h2>RWA Pocket-A could not start</h2>
          <p>{this.state.error?.message || String(this.state.error)}</p>
          <p style={{ color: '#555' }}>
            Open the browser console for technical details.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found.')
}

// Keep a visible bootstrap message while the application module is being loaded.
// This also prevents a completely blank page if a merged module fails to import.
rootElement.innerHTML = `
  <div style="
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#eef4f8;
    color:#17375e;
    font-family:Arial,sans-serif;
    font-weight:600;
  ">
    Starting RWA Pocket-A...
  </div>
`

import('./App.jsx')
  .then(({ default: App }) => {
    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>
    )
  })
  .catch((error) => {
    console.error('RWA app module failed to load:', error)

    rootElement.innerHTML = `
      <div style="
        min-height:100vh;
        padding:24px;
        background:#fff4f4;
        color:#8b1e1e;
        font-family:Arial,sans-serif;
      ">
        <h2>RWA Pocket-A could not load</h2>
        <p>${String(error?.message || error)}</p>
        <p style="color:#555">Open the browser console for technical details.</p>
      </div>
    `
  })
