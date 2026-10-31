import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
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
