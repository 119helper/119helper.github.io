import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  // 시크릿(.env)은 MyProjects/key/119-helper 에서 로드
  envDir: '../key/119-helper',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/kma': {
        target: 'https://apihub.kma.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kma/, ''),
      },
      '/api/holiday': {
        target: 'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/holiday/, ''),
      },
      '/api/er': {
        target: 'http://apis.data.go.kr/B552657/ErmctInfoInqireService',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/er/, ''),
      },
    },
  },
})
