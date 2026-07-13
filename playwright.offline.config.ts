import { defineConfig } from '@playwright/test';

/*
 * 서비스 워커 전용 E2E.
 * 일반 UI 스위트와 별도 Playwright 프로세스·포트를 사용해
 * 이전 브라우저 컨텍스트의 서비스 워커 상태가 유입되지 않게 한다.
 */
const previewHost = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const previewPort = Number(process.env.PLAYWRIGHT_OFFLINE_PORT || 4174);
const previewUrl = `http://${previewHost}:${previewPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: /offline\.spec\.ts/,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: previewUrl,
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'offline-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run preview -- --host ${previewHost} --port ${previewPort} --strictPort`,
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
