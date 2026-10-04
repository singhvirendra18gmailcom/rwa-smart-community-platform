import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The supervisor-close preview must use its matching Worker until merged.
const complaintApiBaseUrl = process.env.CF_PAGES_BRANCH === 'feature/supervisor-close-any-stage'
  ? 'https://feature-supervisor-close-any-stage-rwa-complaint-bot.singh-virendra18.workers.dev'
  : 'https://rwa-complaint-bot.singh-virendra18.workers.dev'

export default defineConfig({
  plugins: [react()],
  define: { __COMPLAINT_API_BASE_URL__: JSON.stringify(complaintApiBaseUrl) },
})
