import { expect, test } from '@playwright/test';

function erXml(hospitalName?: string): string {
  if (!hospitalName) return '<response><body><items /></body></response>';
  const address = hospitalName.startsWith('광주')
    ? '전남광주통합특별시 서구 상무대로 1'
    : '서울특별시 중구 테스트로 1';
  return `<response><body><items><item>
    <dutyName>${hospitalName}</dutyName>
    <dutyAddr>${address}</dutyAddr>
    <dutyTel3>062-000-0000</dutyTel3>
    <phpid>TEST-1</phpid>
    <hvec>5</hvec>
    <hvgc>10</hvgc>
  </item></items></body></response>`;
}

test('응급실: 광주 선택 시 통합 시도명으로 다시 조회한다', async ({ page }) => {
  const requestedSidos: string[] = [];

  await page.route('**/api/er/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
      });
      return;
    }

    const sido = url.searchParams.get('sido') || '';
    requestedSidos.push(sido);
    const isBeds = url.pathname.endsWith('/beds');
    const hospitalName = isBeds
      ? sido === '전남광주통합특별시' ? '광주통합병원' : '서울테스트병원'
      : undefined;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ xml: erXml(hospitalName) }),
    });
  });

  await page.goto('/?tab=er');
  await expect(page.getByText('서울테스트병원', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /지역 선택, 현재 서울/ }).click();
  await page.getByRole('button', { name: '광주', exact: true }).click();

  await expect(page.getByText('광주통합병원', { exact: true })).toBeVisible();
  expect(requestedSidos).toContain('전남광주통합특별시');
});

test('모바일: 통합 검색으로 기능을 열고 최근 사용에 저장한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  const dialog = page.getByRole('dialog', { name: '기능 검색' });
  await dialog.getByRole('searchbox', { name: '기능 검색' }).fill('날씨');
  await dialog.getByRole('button', { name: /실시간 날씨·예보·특보/ }).click();

  await expect(page).toHaveURL(/#weather$/);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('119helper-recent-tools') || '[]'));
  expect(recent).toContain('menu-weather-main');
});

test('출동 상황판: 시작·도구 열람·종료가 활동 타임라인에 자동 기록된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=incident');

  await page.getByRole('button', { name: 'ambulance 구급', exact: true }).click();
  await page.getByLabel('출동 제목').fill('광주 환자 이송');
  await page.getByLabel(/주소 또는 집결 위치/).fill('광주 서구');
  await page.getByLabel('초기 상황 및 위험요소').fill('의식 저하');
  await page.getByRole('button', { name: /출동 상황판 시작/ }).click();

  await expect(page.getByRole('heading', { name: '광주 환자 이송' })).toBeVisible();
  await expect(page.getByText('출동 시작 기준 스냅샷')).toBeVisible();
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toBeVisible();
  const incidentNav = page.getByRole('navigation', { name: '주요 기능' });
  await expect(incidentNav.getByRole('button', { name: '상황판' })).toBeVisible();
  await expect(incidentNav.getByRole('button', { name: '타이머' })).toBeVisible();

  const quickActivity = page.getByLabel('구급 출동 활동 빠른 기록');
  await quickActivity.getByRole('button', { name: '현장도착 기록' }).click();
  await expect(quickActivity.getByRole('button', { name: /현장도착 기록됨/ })).toBeDisabled();
  await quickActivity.getByRole('button', { name: '이송개시 기록' }).click();

  const started = await page.evaluate(() => ({
    activity: JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'),
    incident: JSON.parse(localStorage.getItem('119helper-incident-session') || '{}'),
  }));
  expect(started.activity.presetId).toBe('ems');
  expect(started.activity.stamps[0].label).toBe('출동');
  expect(started.activity.stamps.filter((stamp: { stageId?: string }) => stamp.stageId === 'arrival')).toHaveLength(1);
  expect(started.activity.stamps.some((stamp: { stageId?: string }) => stamp.stageId === 'transport')).toBe(true);
  expect(started.incident.snapshot).toBeTruthy();

  await page.getByRole('button', { name: /활동기록/ }).click();
  await expect(page).toHaveURL(/#activity-log$/);
  const afterTool = await page.evaluate(() => JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'));
  expect(afterTool.stamps.some((stamp: { label?: string }) => stamp.label === '활동기록 열람')).toBe(true);

  await page.getByRole('button', { name: '진행 중인 구급 출동 상황판 열기' }).click();
  await expect(page).toHaveURL(/#incident$/);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '상황 종료' }).click();

  const ended = await page.evaluate(() => ({
    activity: JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'),
    incident: JSON.parse(localStorage.getItem('119helper-incident-session') || '{}'),
  }));
  expect(ended.incident.active).toBe(false);
  expect(ended.incident.endedAt).toBeGreaterThan(ended.incident.startedAt);
  expect(ended.activity.stamps.some((stamp: { label?: string }) => stamp.label === '상황판 종료')).toBe(true);
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '대시보드' })).toBeVisible();
});

test('현장 가독성 설정을 앱 전역에 적용한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '전체 메뉴 열기' }).click();
  await page.getByTitle('내 정보 편집').click();
  await expect(page.getByRole('heading', { name: /환경 설정/ })).toBeVisible();
  await page.getByRole('button', { name: /일반/ }).click();
  await page.getByRole('switch', { name: '현장 가독성 모드' }).click();
  await page.getByRole('button', { name: '저장하기' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-readability', 'field');
  const rootFontSize = await page.locator('html').evaluate(element => getComputedStyle(element).fontSize);
  expect(rootFontSize).toBe('18px');
});
