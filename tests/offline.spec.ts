import { test, expect, type Page } from '@playwright/test';

/*
 * 오프라인 동작 보증 테스트
 *
 * 오프라인은 평소에 안 쓰여서 조용히 망가지기 쉬운 기능이다.
 * 이 테스트가 깨지면 = 현장에서 신호 끊겼을 때 앱이 안 뜬다는 뜻.
 *
 * 시나리오:
 *   1. 온라인 첫 방문 → SW 활성화 + 앱 셸/핵심 청크 캐시 적재 확인
 *   2. 오프라인 전환 + 새로고침 → 앱이 백지 없이 뜨고 오프라인 배지 표시
 *   3. 핵심 현장 도구 5개 탭(A등급)이 오프라인에서 전부 열림
 *
 * 주의: SW 캐시는 브라우저 컨텍스트별로 격리되므로
 * 캐시 워밍업과 오프라인 검증을 한 테스트 안에서 수행한다.
 */

// A등급(오프라인 필수) 탭과 각 화면의 식별 문구
const CRITICAL_TABS = [
  { tab: 'calculator', text: '119 계산기' },
  { tab: 'manual', text: '대응 매뉴얼' },
  { tab: 'field-timer', text: '현장 활동 타이머' },
  { tab: 'checklist', text: '개인안전장비 점검' },
  { tab: 'law', text: '관련 법령' },
];

const CRITICAL_CHUNKS = ['DashboardView', 'Calculators', 'ManualView', 'FieldTimer', 'EquipmentChecklist', 'LawDashboard'];

async function waitForServiceWorkerControl(page: Page) {
  // ready만으로는 clients.claim() 전일 수 있으므로,
  // 현재 페이지의 controller가 실제 activated 상태인지까지 확인한다.
  await page.waitForFunction(
    async () => {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        try {
          reg = await navigator.serviceWorker.register('/sw.js');
        } catch {
          return false;
        }
      }
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller?.state === 'activated';
    },
    undefined,
    { timeout: 30_000, polling: 250 },
  );
}

async function waitForCriticalChunksCached(page: Page, chunks: string[]) {
  // prefetchCriticalViews가 유휴 시간(requestIdleCallback timeout 10초)에 실행되므로 여유를 둔다
  await page.waitForFunction(
    async (names: string[]) => {
      const cacheNames = await caches.keys();
      const assetCacheName = cacheNames.find((k) => k.startsWith('119-assets-'));
      if (!assetCacheName) return false;
      const cache = await caches.open(assetCacheName);
      const urls = (await cache.keys()).map((r) => r.url);
      return names.every((name) => urls.some((u) => u.includes(name)));
    },
    chunks,
    { timeout: 45_000, polling: 1_000 },
  );
}

test('오프라인: 앱 셸과 핵심 현장 도구(A등급)가 전부 동작한다', async ({ page, context }) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.url()} — ${request.failure()?.errorText || '알 수 없는 오류'}`));
  await page.setViewportSize({ width: 390, height: 844 });
  // ── 1. 온라인 워밍업: 첫 방문 → SW 설치 → 제어권 확보
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForServiceWorkerControl(page);

  // 셸 프리캐시 확인 (index.html + 아이콘 폰트 + 현재 빌드 진입 JS/CSS)
  const shellOk = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const shellName = cacheNames.find((k) => k.startsWith('119-shell-'));
    if (!shellName) return false;
    const cache = await caches.open(shellName);
    const indexResponse = await cache.match('/index.html');
    const hasIndex = !!indexResponse;
    const hasIconFont = !!(await cache.match('/fonts/material-symbols-outlined.woff2'));
    if (!indexResponse) return false;
    const html = await indexResponse.text();
    const entryAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
    const assetCacheName = cacheNames.find((name) => name.startsWith('119-assets-'));
    if (!assetCacheName || entryAssets.length === 0) return false;
    const assetCache = await caches.open(assetCacheName);
    const entriesCached = (await Promise.all(entryAssets.map(url => assetCache.match(url)))).every(Boolean);
    return hasIndex && hasIconFont && entriesCached;
  });
  expect(shellOk, '앱 셸과 현재 진입 JS/CSS가 프리캐시되어야 함').toBe(true);

  // 핵심 청크 프리페치 완료 대기
  await waitForCriticalChunksCached(page, CRITICAL_CHUNKS);

  // ── 2. 오프라인 전환 → 새로고침해도 앱이 뜬다
  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false, undefined, { timeout: 5_000 });
  // CDP의 오프라인 상태가 페이지와 SW 타겟에 모두 전파될 틈을 준다.
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await expect(
      page.getByText('대시보드').first(),
      '오프라인 새로고침 후에도 앱 셸이 렌더링되어야 함',
    ).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const runtime = await page.evaluate(async () => ({
      body: document.body.innerText.slice(0, 500),
      controller: navigator.serviceWorker.controller?.state ?? null,
      cacheNames: await caches.keys(),
    })).catch(evaluationError => ({ evaluationError: String(evaluationError) }));
    console.error('Offline shell diagnostics', {
      url: page.url(),
      title: await page.title().catch(() => ''),
      pageErrors,
      failedRequests,
      runtime,
    });
    throw error;
  }

  // 오프라인 배지 표시
  await expect(
    page.getByText(/오프라인 · 실시간 정보/),
    '오프라인 배지가 표시되어야 함',
  ).toBeVisible({ timeout: 10_000 });

  // 연결 상태 배너가 모바일 하단 메뉴를 가리지 않아야 한다.
  const mobileNav = page.getByRole('navigation', { name: '주요 기능' });
  await mobileNav.getByRole('button', { name: '더보기' }).click();
  await expect(page.getByRole('complementary', { name: '전체 메뉴' })).toBeVisible();

  // ── 3. A등급 탭 5개가 오프라인에서 전부 열린다
  for (const { tab, text } of CRITICAL_TABS) {
    await page.goto(`/?tab=${tab}`);
    await expect(
      page.getByText(text).first(),
      `오프라인에서 '${tab}' 탭(${text})이 열려야 함`,
    ).toBeVisible({ timeout: 15_000 });
  }

  await context.setOffline(false);
});

test('온라인: 기본 렌더링 스모크', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/119 Helper/);
  await expect(page.getByText('대시보드').first()).toBeVisible({ timeout: 15_000 });
});
