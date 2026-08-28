import { expect, test } from '@playwright/test';

test('연간 화재통계: 2026 누계와 재산피해 천원 단위를 정확히 표시한다', async ({ page }) => {
  await page.route('**/api/fire-annual/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/years')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          years: ['2026', '2025'],
          latestYear: '2026',
          latestCompleteYear: '2025',
          latestDataThrough: '2026-07-28',
          periods: [
            { year: '2026', coverageType: 'partial', dataThrough: '2026-07-28' },
            { year: '2025', coverageType: 'complete', dataThrough: '2025-12-31' },
          ],
          sourceUrl: 'https://www.nfds.go.kr/stat/general.do',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        year: '2026',
        totalRecords: 24_260,
        coverageType: 'partial',
        dataThrough: '2026-07-28',
        propertyDamageUnit: 'thousandWon',
        sourceName: '소방청 국가화재정보시스템(NFDS)',
        sourceUrl: 'https://www.nfds.go.kr/stat/general.do',
        regionalClassification: { classifiedCount: 24_229, unclassifiedCount: 31 },
        summary: {
          totalFires: 24_260,
          totalDeaths: 209,
          totalInjuries: 1_468,
          totalCasualties: 1_677,
          totalPropertyDamage: 603_413_326,
        },
        bySido: [{ name: '경기도', count: 4_000 }, { name: '지역 미분류', count: 31 }],
        byFireType: [{ name: '건축,구조물', count: 10_000 }],
        byPlace: [{ name: '야외', count: 5_000 }],
        byCause: [{ name: '부주의', count: 10_000 }],
        byMonth: [{ month: '1월', count: 4_099 }],
        casualtiesBySido: [{ name: '경기도', deaths: 10, injuries: 100 }],
      }),
    });
  });

  await page.goto('/?tab=annual-fire');

  await expect(page.getByLabel('화재통계 연도')).toHaveValue('2026');
  await expect(page.getByRole('option', { name: '2026년 누계 (2026-07-28)' })).toBeAttached();
  await expect(page.getByText('공식 완결연도 2025년')).toBeVisible();
  await expect(page.getByText('현재 화면은 2026-07-28까지 누계')).toBeVisible();
  await expect(page.getByText('지역 미분류 31건 포함')).toBeVisible();
  await expect(page.getByText('6034.1억원')).toBeVisible();
});

test('지역별 화재피해: 최신 시도·월 집계와 과거 개별 건을 분리한다', async ({ page }) => {
  await page.route('**/api/fire-annual/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/years')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          years: ['2026', '2025', '2024'],
          regionalMonthlyYears: ['2026', '2025', '2024'],
          latestYear: '2026',
          latestCompleteYear: '2025',
          latestDataThrough: '2026-07-28',
          periods: [
            {
              year: '2026',
              coverageType: 'partial',
              dataThrough: '2026-07-28',
              regionalMonthlyAvailable: true,
            },
            {
              year: '2025',
              coverageType: 'complete',
              dataThrough: '2025-12-31',
              regionalMonthlyAvailable: true,
            },
            {
              year: '2024',
              coverageType: 'complete',
              dataThrough: '2024-12-31',
              regionalMonthlyAvailable: true,
            },
          ],
          sourceUrl: 'https://www.nfds.go.kr/stat/general.do',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        year: '2026',
        totalRecords: 1_500,
        coverageType: 'partial',
        dataThrough: '2026-07-28',
        propertyDamageUnit: 'thousandWon',
        regionalMonthlyGranularity: 'sido-month',
        sourceName: '소방청 국가화재정보시스템(NFDS)',
        sourceUrl: 'https://www.nfds.go.kr/stat/general.do',
        summary: {
          totalFires: 1_500,
          totalDeaths: 12,
          totalInjuries: 70,
          totalCasualties: 82,
          totalPropertyDamage: 50_000,
        },
        bySido: [
          { name: '서울특별시', count: 900, deaths: 7, injuries: 40, propertyDamage: 30_000 },
          { name: '경기도', count: 600, deaths: 5, injuries: 30, propertyDamage: 20_000 },
        ],
        byFireType: [],
        byPlace: [],
        byCause: [],
        byMonth: [
          {
            month: '1월',
            count: 800,
            deaths: 8,
            injuries: 35,
            propertyDamage: 26_000,
            bySido: [
              { name: '서울특별시', count: 500, deaths: 5, injuries: 20, propertyDamage: 16_000 },
              { name: '경기도', count: 300, deaths: 3, injuries: 15, propertyDamage: 10_000 },
            ],
          },
          {
            month: '2월',
            count: 700,
            deaths: 4,
            injuries: 35,
            propertyDamage: 24_000,
            bySido: [
              { name: '서울특별시', count: 400, deaths: 2, injuries: 20, propertyDamage: 14_000 },
              { name: '경기도', count: 300, deaths: 2, injuries: 15, propertyDamage: 10_000 },
            ],
          },
        ],
        casualtiesBySido: [],
      }),
    });
  });
  await page.route('**/api/fire-damage**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        ocrnYmdhh: '20230101',
        gutFsttOgidNm: '서울소방서',
        deadPercnt: '0',
        injrdprPercnt: '1',
        prptDmgSbttAmt: '1000',
        lawAddrName: '서울특별시 종로구',
      }],
      totalCount: 1,
      pageNo: 1,
      numOfRows: 50,
      availableFrom: '2019-01',
      availableTo: '2023-12',
      sourceUrl: 'https://www.data.go.kr/data/15142972/openapi.do',
    }),
  }));

  await page.goto('/?tab=fire-damage');

  await expect(page.getByRole('tab', { name: '2024~2026 시도·월 집계' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('요청서 없이 공개 NFDS로 확보')).toBeVisible();
  await expect(page.getByText('개별 사고 주소·관할서는 포함하지 않음')).toBeVisible();
  await page.getByLabel('최신 화재피해 지역').selectOption('서울특별시');
  await expect(page.getByText('서울특별시 화재 건수')).toBeVisible();
  await expect(page.getByText('900').first()).toBeVisible();

  await page.getByRole('tab', { name: '2019~2023 개별 건' }).click();
  await expect(page.getByText('소방청 화재 조사 완료 건별 데이터 · 공식 제공범위 2019~2023')).toBeVisible();
  await expect(page.getByRole('heading', { name: '개별 화재 건 목록' })).toBeVisible();
});

test('위험물시설: 2025 도 합계와 2023 소방서 상세를 섞지 않는다', async ({ page }) => {
  await page.goto('/?tab=hazmat');

  await expect(page.getByText('경상북도 전체 2025-12-31 기준 · 소방서별 상세 2023-12-31 기준')).toBeVisible();
  await expect(page.getByText('2025년 말 경상북도 공식 합계')).toBeVisible();
  await expect(page.getByText('9,344').first()).toBeVisible();
  await expect(page.getByText('2024년 도 합계 9,433개소 대비 89개소 감소했습니다.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '소방서별 위험물시설 수 (2023)' })).toBeVisible();

  await page.getByLabel('관할 소방서').selectOption('포항북부소방서');

  await expect(page.getByText('2023년 말 소방서별 공식 상세')).toBeVisible();
  await expect(page.getByText('시설유형별 분포 — 포항북부소방서 (2023)')).toBeVisible();
  await expect(page.getByText('305').first()).toBeVisible();
});

test('오프라인 점검: 최신 날짜와 데이터 완전성을 별도로 표시한다', async ({ page }) => {
  await page.goto('/?tab=offline-readiness');

  await expect(page.getByText(
    /앱 지원 9개 도시 [\d,]+곳 \/ 전국 사용중 [\d,]+곳/,
  )).toBeVisible();
  await expect(page.getByText(
    /지원 9개 도시 전체 원본 [\d,]+곳 중 지도 표시 [\d,]+곳 \([\d.]+%\) · 시설 좌표 [\d,]+곳 · 주소 대표점 [\d,]+곳 · 좌표 미확인 [\d,]+곳/,
  )).toBeVisible();
  await expect(page.getByText(
    /주소 대표점 [\d,]+곳 · 기존 주소 지오코딩 [\d,]+ · 동일 주소 이전 공식 좌표 [\d,]+ · 부산 공식 도로명주소 [\d,]+ · 전국 표준 호스트 시설 [\d,]+ · 용산 지자체 호스트 시설 [\d,]+ \(기존 오류 좌표 [\d,]+곳 교정 포함\) · 실제 화장실 위치나 출입구와 다를 수 있음/,
  )).toBeVisible();
  await expect(page.getByText(
    /공식 지역 시설 좌표 보충 [\d,]+곳 · 주소 대표점에서 시설 좌표로 개선 [\d,]+곳 · 서울특별시 [\d,]+ · 서울 지하철 1~8호선 [\d,]+ · 대전 서구 [\d,]+ · 제주시 [\d,]+ · 동래구 [\d,]+ · 부산 갈맷길 [\d,]+/,
  )).toBeVisible();
  await expect(page.getByText(
    /공개 API [\d,]+곳 \/ 관리대장 발표 [\d,]+곳 · [\d,]+곳 차이/,
  )).toBeVisible();
  await expect(page.getByText('공개 API 제공 범위: 강원·경북·부산·울산 4개 시도')).toBeVisible();
});

test('광주 소방용수: 2026 광산구 관할 오버레이의 좌표와 중복 한계를 표시한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('119helper-city', 'gwangju'));
  await page.goto('/#shelter?category=hydrants');

  const overlayNotice = page.getByText(
    /광산구 최신 원본 [\d,]+곳\(20\d{2}-\d{2}-\d{2}\) 적용 · 지도 [\d,]+곳\(이 중 [\d,]+곳은 정확 주소가 같은 이전 좌표 유지\) · 좌표 미확인 [\d,]+곳/,
  );
  await expect(overlayNotice).toBeHidden();
  await page.locator('summary').filter({ hasText: '자료 범위·검증 상세' }).click();

  await expect(overlayNotice).toBeVisible();
  await expect(page.getByText(
    /공급기관 시설번호 중복 [\d,]+개\([\d,]+행\)는 임의 삭제하지 않음/,
  )).toBeVisible();
  await expect(page.getByText(
    /공급기관 주소의 시군구 누락 [\d,]+행은 별도 시군구 필드로 보정/,
  )).toBeVisible();
});
