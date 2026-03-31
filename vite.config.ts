import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/er': {
        target: 'https://apis.data.go.kr/B552657/ErmctInfoInqireService',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/er/, ''),
      },
      '/api/kma': {
        target: 'https://apihub.kma.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kma/, ''),
      },
      '/api/holiday': {
        target: 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/holiday/, ''),
      },
    },
  },
}))
