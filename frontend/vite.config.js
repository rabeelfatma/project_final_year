import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// LAN bind is opt-in: set VITE_LAN=1 (or run `npm run dev:lan`) so a phone on
// the same Wi-Fi can open http://<laptop-private-ip>:5173. Default stays
// localhost-only. This is not a public internet exposure; Windows Firewall may
// still prompt, and both devices must share the LAN (no port-forwarding).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const lanEnabled =
    env.VITE_LAN === '1' ||
    String(process.env.VITE_LAN || '').trim() === '1'

  return {
    plugins: [react()],
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
