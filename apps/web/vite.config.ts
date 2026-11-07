import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The page calls /api on its own address, and Vite passes those calls to the API.
    // In production a web server does the same job, so the browser only ever sees one address.
    // Set API_URL if the API runs somewhere else, such as another port.
    proxy: { '/api': process.env['API_URL'] ?? 'http://localhost:3000' },
  },
})
