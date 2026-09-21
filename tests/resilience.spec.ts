import { expect, test } from '@playwright/test';

// Device projects exercise the same user flows in Chromium and WebKit.
// Service-worker/offline behavior has its own isolated suite and origin.
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error('Browser runtime error:', error.message));
  // Production is HTTPS. WebKit also upgrades loopback asset requests when this
  // directive is present, but the local preview server intentionally serves HTTP.
  // Change only the test document, keeping the production CSP and build intact.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (route.request().resourceType() !== 'document' || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('; upgrade-insecure-requests', '') });
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/weather-alerts' ? JSON.stringify({ alerts: [], observedAt: new Date().toISOString(), source: 'test', sourceUrl: 'https://example.com/' }) : '[]';
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body });
  });
});

test('저장 공간 부족: 메모를 탭 이동 후에도 보존하고 재시도한다', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === '119helper-notes') throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    };
    window.addEventListener('test-restore-storage', () => { Storage.prototype.setItem = original; });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /새 메모/ }).click();
  await page.getByLabel('메모 내용').fill('재시도 후에도 보존할 현장 메모');
  await expect(page.getByRole('alert').filter({ hasText: '기기에 저장하지 못한 자료' })).toBeVisible();
  await page.getByRole('button', { name: '출동 대응 모드', exact: true }).click();
  await page.getByRole('button', { name: '평시 업무 모드', exact: true }).click();
  await expect(page.getByLabel('메모 내용')).toHaveValue('재시도 후에도 보존할 현장 메모');
  await page.evaluate(() => window.dispatchEvent(new Event('test-restore-storage')));
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(page.getByText('기기에 저장했습니다.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('메모 내용')).toHaveValue('재시도 후에도 보존할 현장 메모');
});

test('일부 API 장애는 다른 API가 성공해도 정보별 상태에 남는다', async ({ page }) => {
  await page.route('**/api/er/**', async route => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"unavailable"}' }));
  await page.goto('/');
  await page.getByRole('button', { name: /최근 알림/ }).click();
  const status = page.getByRole('region', { name: '데이터 상태', exact: true });
  await expect(status).toContainText('날씨 · 조회 성공');
  await expect(status).toContainText('응급실 · 조회 실패');
  await expect(status).toContainText('연결 불안정');
});

test('모바일 시작 버튼이 첫 화면 안에 있고 출동은 새로고침 뒤에도 유지된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#incident');
  const start = page.getByRole('button', { name: /위치 기준 브리핑 시작/ });
  await expect(start).toBeInViewport();
  await page.getByLabel('출동 제목').fill('재진입 검증');
  await start.click();
  const fallback = page.getByRole('button', { name: /위치 없이 .* 지역 기준으로 시작/ });
  await expect(fallback).toBeInViewport();
  await fallback.click();
  await expect(page.getByRole('heading', { name: '재진입 검증', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '재진입 검증', exact: true })).toBeVisible();
});

test('백업 미리보기 후 기존 메모를 유지하며 복원한다', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click();
    await page.getByTitle('내 정보 편집').click();
  } else await page.getByRole('button', { name: '설정 열기' }).click();
  await page.getByRole('button', { name: /일반/ }).click();
  const backup = { format: '119-helper-workspace', version: 1, createdAt: new Date().toISOString(), notes: [{ id: 'fixture', text: '복원 검증', color: 'bg-yellow-100', createdAt: '2026-09-22' }], schedules: [], preplans: { version: 1, plans: [], photos: {} }, incidents: [] };
  await page.getByLabel('업무자료 백업 파일').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText(/복원 미리보기: 메모 1개/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('119helper-notes'))).not.toContain('복원 검증');
  await page.getByRole('button', { name: '기존 자료를 유지하고 복원' }).click();
  await page.getByRole('button', { name: '자료 추가', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '메모 1개' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('119helper-notes'))).toContain('복원 검증');
});
