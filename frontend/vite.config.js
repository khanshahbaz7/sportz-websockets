import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/matches': {
          target,
          changeOrigin: true,
        },
        '/ws': {
          target,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
