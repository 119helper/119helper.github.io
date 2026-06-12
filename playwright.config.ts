import { defineConfig } from '@playwright/test';

/*
 * 오프라인 E2E 테스트 설정
 * 프로덕션 빌드(dist)를 vite preview로 서빙해 서비스 워커까지 실제로 검증한다.
 * (SW는 PROD 빌드에서만 등록되므로 dev 서버로는 테스트 불가)
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
