import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEFAULT_API_BASE = 'https://119-helper-api.teemozipsa.workers.dev'
const ENV_DIR = '../key/119-helper'

function cspConnectSource(apiBase: string) {
  if (!apiBase || apiBase.startsWith('/')) return "'self'"
  try {
    const url = new URL(apiBase)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_BASE
    return url.origin
  } catch {
    return DEFAULT_API_BASE
  }
}

function injectCspApiBase(apiBase: string, stripDevSources: boolean) {
  return {
    name: 'inject-csp-api-base',
    transformIndexHtml(html: string) {
      const injected = html.replace('__VITE_API_BASE_ORIGIN__', cspConnectSource(apiBase))
      return stripDevSources ? injected.replace(' http://localhost:* ws://localhost:*', '') : injected
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, ENV_DIR, ''), ...process.env }
  const apiBase = env.VITE_API_BASE || DEFAULT_API_BASE

  return {
    base: '/',
    // 시크릿(.env)은 MyProjects/key/119-helper 에서 로드
    envDir: ENV_DIR,
    plugins: [injectCspApiBase(apiBase, command === 'build'), react(), tailwindcss()],
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
  }
})
