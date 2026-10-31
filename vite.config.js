import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/unit.xml' },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || loadEnv(mode, process.cwd(), 'VITE_').VITE_API_PROXY_TARGET || 'http://127.0.0.1:9987',
        changeOrigin: true,
      },
    },
  },
}))
