import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Preview apps must call the corresponding deployed Worker preview.
const previewWorkers = {
  'feature/supervisor-close-any-stage': 'https://feature-supervisor-close-any-stage-rwa-complaint-bot.singh-virendra18.workers.dev',
  'fix/complaint-queue-status-alignment': 'https://fix-complaint-queue-status-alignment-rwa-complaint-bot.singh-virendra18.workers.dev'
}
const complaintApiBaseUrl = process.env.VITE_COMPLAINT_API_BASE_URL ||
  previewWorkers[process.env.CF_PAGES_BRANCH] ||
  'https://rwa-complaint-bot.singh-virendra18.workers.dev'

// Public preview stays disconnected unless explicitly configured with a
// separate staging API. Do not let a feature preview write to production.
const webComplaintApiBaseUrl = process.env.VITE_WEB_COMPLAINT_API_BASE_URL ||
  (process.env.CF_PAGES_BRANCH === 'rwa-ai' ? complaintApiBaseUrl : '')
const webTurnstileSiteKey = process.env.VITE_WEB_TURNSTILE_SITE_KEY || ''

export default defineConfig({
  plugins: [react()],
  define: {
    __COMPLAINT_API_BASE_URL__: JSON.stringify(complaintApiBaseUrl),
    __WEB_COMPLAINT_API_BASE_URL__: JSON.stringify(webComplaintApiBaseUrl),
    __WEB_TURNSTILE_SITE_KEY__: JSON.stringify(webTurnstileSiteKey)
  },
})
