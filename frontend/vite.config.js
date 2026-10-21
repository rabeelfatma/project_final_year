import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PRODUCTION_API_BASE_URL, resolveApiBaseUrl } from './src/utils/apiBase.js'

// https://vite.dev/config/
// LAN bind is opt-in: set VITE_LAN=1 (or run `npm run dev:lan`) so a phone on
// the same Wi-Fi can open http://<laptop-private-ip>:5173. Default stays
// localhost-only. This is not a public internet exposure; Windows Firewall may
// still prompt, and both devices must share the LAN (no port-forwarding).
//
// Production builds target the Vercel API project. A laptop .env value that
// resolves to loopback, a private LAN address, or relative /api is not inlined.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const lanEnabled =
    env.VITE_LAN === '1' ||
    String(process.env.VITE_LAN || '').trim() === '1'

  const define = {}
  if (mode === 'production') {
    const configured = String(
      env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || ''
    ).trim()
    const resolved = resolveApiBaseUrl({ configured, isDev: false })
    if (
      resolved === PRODUCTION_API_BASE_URL &&
      configured.replace(/\/+$/, '') !== PRODUCTION_API_BASE_URL
    ) {
      define['import.meta.env.VITE_API_BASE_URL'] = JSON.stringify('')
    }
  }

  return {
    plugins: [react()],
    define,
    server: {
      host: lanEnabled ? true : 'localhost',
      port: 5173,
    },
    preview: {
      host: lanEnabled ? true : 'localhost',
      port: 4173,
    },
  }
})
