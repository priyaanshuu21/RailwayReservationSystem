import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.VITE_WS_URL ?? 'http://localhost:4000',
        changeOrigin: true,
        ws: true
      }
    }
  }
})