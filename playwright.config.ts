import { defineConfig, devices } from '@playwright/test';

/* 일반 UI E2E. 오프라인 검증은 별도 브라우저 프로세스와 오리진을 사용한다. */
const previewHost = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const previewPort = Number(process.env.PLAYWRIGHT_PORT || 4173);
const previewUrl = `http://${previewHost}:${previewPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: /(core-flows|data-freshness-ui|reference-completeness-ui|resilience)\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: previewUrl,
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'ui-chromium', use: { browserName: 'chromium' } },
    { name: 'mobile-chromium', testMatch: /resilience\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', testMatch: /resilience\.spec\.ts/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `npm run preview -- --host ${previewHost} --port ${previewPort} --strictPort`,
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
