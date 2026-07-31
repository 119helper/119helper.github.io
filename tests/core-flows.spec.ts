import { expect, test, type Page } from '@playwright/test';

async function installIncidentGeocoder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class TestGeocoder {
      addressSearch(
        query: string,
        callback: (results: Array<{
          x: string;
          y: string;
          address: {
            address_name: string;
            region_1depth_name: string;
            region_2depth_name: string;
            b_code: string;
          };
        }>, status: string) => void,
      ) {
        const isGwangju = query.includes('광주');
        callback([{
          x: isGwangju ? '126.8526' : '126.9780',
          y: isGwangju ? '35.1595' : '37.5665',
          address: {
            address_name: isGwangju ? '광주광역시 서구' : query,
            region_1depth_name: isGwangju ? '광주광역시' : '서울특별시',
            region_2depth_name: isGwangju ? '서구' : '종로구',
            b_code: isGwangju ? '2914010000' : '1111011900',
          },
        }], 'OK');
      }
    }

    Reflect.set(window, 'kakao', {
      maps: {
        services: {
          Status: { OK: 'OK' },
          Geocoder: TestGeocoder,
        },
      },
    });
  });
}

function erXml(hospitalName?: string, includeAddress = true): string {
  if (!hospitalName) {
    return '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items /></body></response>';
  }
  const address = hospitalName.startsWith('광주')
    ? '전남광주통합특별시 서구 상무대로 1'
    : '서울특별시 중구 테스트로 1';
  return `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item>
    <dutyName>${hospitalName}</dutyName>
    ${includeAddress ? `<dutyAddr>${address}</dutyAddr>` : ''}
    <dutyTel3>062-000-0000</dutyTel3>
    <hpid>TEST-1</hpid>
    <phpid>TEST-1</phpid>
    <hvec>5</hvec>
    <hvgc>10</hvgc>
    <wgs84Lat>37.5666</wgs84Lat>
    <wgs84Lon>126.9781</wgs84Lon>
  </item></items></body></response>`;
}

test('응급실: 공급자 조회명과 광주 화면 표시명을 분리한다', async ({ page }) => {
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
    const isList = url.pathname.endsWith('/list');
    const hospitalName = isBeds || isList
      ? sido === '전남광주통합특별시' ? '광주통합병원' : '서울테스트병원'
      : undefined;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ xml: erXml(hospitalName, !isBeds) }),
    });
  });

  await page.goto('/?tab=er');
  await expect(page.getByText('서울테스트병원', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /지역 선택, 현재 서울/ }).click();
  await page.getByRole('button', { name: '광주', exact: true }).click();

  await expect(page.getByText('광주통합병원', { exact: true })).toBeVisible();
  await expect(page.getByText('광주광역시', { exact: true })).toBeVisible();
  await expect(page.getByText('광주광역시 서구 상무대로 1', { exact: true })).toBeVisible();
  await expect(page.getByText('전남광주통합특별시 서구 상무대로 1', { exact: true })).toHaveCount(0);
  expect(requestedSidos).toContain('전남광주통합특별시');
});

test('모바일: 통합 검색으로 기능을 바로 연다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  const dialog = page.getByRole('dialog', { name: '기능 검색' });
  await dialog.getByRole('searchbox', { name: '기능 검색' }).fill('날씨');
  await dialog.getByRole('button', { name: /실시간 날씨·예보·특보/ }).click();

  await expect(page).toHaveURL(/#weather$/);
});

test('평시 대시보드: 오늘 저장 상태를 실제 업무 브리핑으로 보여준다', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    localStorage.setItem('119helper-schedules', JSON.stringify([
      {
        id: 'routine-schedule',
        date: today,
        title: '소방특별조사 자료 취합',
        type: '점검',
        memo: '대시보드에는 노출하지 않을 상세',
      },
    ]));
    localStorage.setItem('119helper-notes', JSON.stringify([
      { id: 'note-1', text: '첫 메모', color: 'yellow', createdAt: '오늘' },
      { id: 'note-2', text: '', color: 'blue', createdAt: '오늘' },
    ]));
    localStorage.setItem('119helper-preplans', JSON.stringify([
      {
        id: 'preplan-briefing',
        name: '광주청사',
        address: '브리핑에 노출하지 않을 주소',
        hazards: [],
        facilities: [],
        contacts: [],
        photoKeys: [],
        accessNotes: '',
        updatedAt: Date.now(),
      },
    ]));
    localStorage.setItem('119helper-equipment-checklist', JSON.stringify({
      'scba-1': true,
      'ppe-1': true,
    }));
    localStorage.setItem('119helper-equipment-checklist-date', JSON.stringify(today));
  });

  await page.goto('/#dashboard');

  const briefing = page.getByRole('region', { name: '오늘 업무 브리핑' });
  await expect(briefing).toContainText('소방특별조사 자료 취합');
  await expect(briefing).toContainText('오늘 1건');
  await expect(briefing).toContainText('2/13 완료');
  await expect(briefing).toContainText('광주청사');
  await expect(briefing).toContainText('1건 저장');
  await expect(briefing).not.toContainText('브리핑에 노출하지 않을 주소');
  await expect(briefing).not.toContainText('대시보드에는 노출하지 않을 상세');
});

test('평시 일정: 오늘 업무를 완료하고 지난 미완료를 놓치지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterday = [
      yesterdayDate.getFullYear(),
      String(yesterdayDate.getMonth() + 1).padStart(2, '0'),
      String(yesterdayDate.getDate()).padStart(2, '0'),
    ].join('-');
    localStorage.setItem('119helper-schedules', JSON.stringify([
      {
        id: 'today-pending',
        date: today,
        title: '교육자료 취합',
        type: '교육',
        memo: '',
        trackCompletion: true,
      },
      {
        id: 'today-done',
        date: today,
        title: '월간 점검 결재',
        type: '점검',
        memo: '',
        trackCompletion: true,
        completedAt: Date.now() - 1_000,
      },
      {
        id: 'overdue-pending',
        date: yesterday,
        title: '소방특별조사 회신 확인',
        type: '기타',
        memo: '',
        trackCompletion: true,
      },
    ]));
  });
  await page.goto('/#dashboard');

  const briefing = page.getByRole('region', { name: '오늘 업무 브리핑' });
  await expect(briefing).toContainText('교육자료 취합');
  await expect(briefing).toContainText('업무 완료 1/2 · 이전 미완료 1건');
  await briefing.getByRole('button', { name: '일정관리 열기' }).click();

  const overdue = page.getByRole('region', { name: '이전 미완료 업무' });
  await expect(overdue).toContainText('소방특별조사 회신 확인');
  await overdue.getByRole('button', { name: '소방특별조사 회신 확인 이전 업무 완료 표시' }).click();
  await expect(overdue).toBeHidden();

  await page.getByRole('button', { name: '교육자료 취합 완료 표시' }).click();
  await page.getByRole('complementary', { name: '전체 메뉴' })
    .getByRole('button', { name: '평시 대시보드', exact: true })
    .click();

  await expect(briefing).toContainText('오늘 업무 완료');
  await expect(briefing).toContainText('업무 완료 2/2');
  await expect(briefing).not.toContainText('이전 미완료');
});

test('모바일 통합 검색: 주소·저장 대상물·SOP를 실제 화면 상태로 이어간다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('119helper-preplans', JSON.stringify([
      {
        id: 'preplan-search',
        name: '송정센터',
        address: '광주광역시 광산구 상무대로 201',
        hazards: ['리튬 배터리', '가스'],
        facilities: [],
        contacts: [],
        photoKeys: [],
        accessNotes: '',
        updatedAt: Date.now(),
      },
    ]));
  });
  await page.goto('/#dashboard');

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  let dialog = page.getByRole('dialog', { name: '기능 검색' });
  await dialog.getByRole('searchbox', { name: '기능 검색' })
    .fill('광주광역시 북구 서암대로 71');
  await dialog.getByRole('button', { name: /^건축물대장으로 조회/ }).click();

  await expect(page).toHaveURL(/#shelter\?category=building$/);
  await expect(page.getByRole('textbox', { name: '건축물 주소' }))
    .toHaveValue('광주광역시 북구 서암대로 71');

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  dialog = page.getByRole('dialog', { name: '기능 검색' });
  await dialog.getByRole('searchbox', { name: '기능 검색' }).fill('송정센터');
  await dialog.getByRole('button', { name: /^저장 대상물 · 송정센터/ }).click();

  await expect(page).toHaveURL(/#preplan$/);
  await expect(page.getByRole('searchbox', { name: '대상물 검색' })).toHaveValue('송정센터');
  await expect(page.getByText('검색 결과 1개')).toBeVisible();

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  dialog = page.getByRole('dialog', { name: '기능 검색' });
  await dialog.getByRole('searchbox', { name: '기능 검색' }).fill('리튬 배터리');
  await dialog.getByRole('button', { name: /^차량화재 SOP 참고표 열기/ }).click();

  await expect(page).toHaveURL(/#manual\?subId=sop%3Avehicle-fire$/);
  await expect(page.getByRole('button', { name: /SOP 체크리스트/ }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '차량화재' })).toBeVisible();

  await page.getByRole('button', { name: '기능 검색 열기' }).click();
  await expect(page.getByRole('dialog', { name: '기능 검색' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '기능 검색' })).toBeHidden();
  await expect(page).toHaveURL(/#manual\?subId=sop%3Avehicle-fire$/);
});

test('데스크톱 통합 검색: 뒤로가기는 화면을 옮기기 전에 결과창부터 닫는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#weather');

  const search = page.getByRole('searchbox', { name: '기능 검색' });
  await search.fill('산불');
  await expect(page.getByRole('button', { name: /실시간 산불 발생·진화 현황/ })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole('button', { name: /실시간 산불 발생·진화 현황/ })).toBeHidden();
  await expect(page).toHaveURL(/#weather$/);
});

test('대상물 사전계획: 빈 초안은 버리고 의미 있는 입력만 저장한다', async ({ page }) => {
  await page.goto('/#preplan');

  await page.getByRole('button', { name: '새 대상물', exact: true }).click();
  await page.getByRole('button', { name: '대상물 목록으로 돌아가기' }).click();
  await expect(page.getByText('등록된 대상물 0개')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('119helper-preplans')))
    .toBe('[]');

  await page.getByRole('button', { name: '새 대상물', exact: true }).click();
  await page.getByLabel('대상물명').fill('x');
  await page.getByLabel('대상물명').fill('');
  await page.getByRole('button', { name: '대상물 목록으로 돌아가기' }).click();
  await expect(page.getByText('등록된 대상물 0개')).toBeVisible();

  await page.getByRole('button', { name: '새 대상물', exact: true }).click();
  await page.getByLabel('대상물명').fill('광주 중앙시장');
  await page.getByRole('button', { name: '대상물 목록으로 돌아가기' }).click();

  await expect(page.getByText('등록된 대상물 1개')).toBeVisible();
  await expect(page.getByText('광주 중앙시장')).toBeVisible();
});

test('모바일: 즐겨찾기를 보존하고 데이터 상태를 화면 안에 표시한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  await page.getByRole('button', { name: '전체 메뉴 열기' }).click();
  const sidebar = page.getByRole('dialog', { name: '전체 메뉴' });
  const favorites = sidebar.getByRole('region', { name: '즐겨찾기' });
  await expect(favorites).toContainText('이 업무 공간 메뉴의 별표를 눌러 기능을 추가하세요.');

  await sidebar.getByRole('button', { name: '모니터링' }).click();
  await sidebar.getByRole('button', { name: '날씨 즐겨찾기 추가' }).click();
  await expect(favorites.getByRole('button', { name: '날씨', exact: true })).toBeVisible();
  await expect(favorites.getByText('최근 사용', { exact: true })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: '전체 메뉴 열기' }).click();
  await expect(favorites.getByRole('button', { name: '날씨', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: '모니터링' }).click();
  await expect(sidebar.getByRole('button', { name: '날씨 즐겨찾기 해제' })).toBeVisible();
  await sidebar.getByRole('button', { name: '전체 메뉴 닫기' }).click();

  await page.getByRole('button', { name: /최근 알림/ }).click();
  const dataStatus = page.getByRole('region', { name: '데이터 상태' });
  await expect(dataStatus).toBeVisible();
  await expect(dataStatus.getByRole('button', { name: '오프라인 준비 상태 확인' })).toBeVisible();
  const box = await page.locator('.notification-popover > div').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test('업무 공간: 평시 업무와 출동 대응의 메뉴와 하단 동선을 함께 전환한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: '평시 업무 모드' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '대시보드' })).toBeVisible();

  await page.getByRole('button', { name: '출동 대응 모드' }).click();
  await expect(page).toHaveURL(/#incident$/);
  await expect(page.getByRole('button', { name: '출동 대응 모드' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '상황판' })).toBeVisible();

  await page.getByRole('button', { name: '전체 메뉴 열기' }).click();
  const sidebar = page.getByRole('dialog', { name: '전체 메뉴' });
  await expect(sidebar.getByText('출동 대응 메뉴', { exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '지휘·기록' })).toBeVisible();
  await sidebar.getByRole('button', { name: '전체 메뉴 닫기' }).click();

  await page.getByRole('button', { name: '평시 업무 모드' }).click();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '대시보드' })).toBeVisible();
});

test('업무 공간: 진행 중인 출동이 있어도 명시적인 평시 대시보드 경로를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const startedAt = Date.now() - 120_000;
  await page.addInitScript(({ incidentStartedAt }) => {
    localStorage.setItem('119helper-incident-session', JSON.stringify({
      incidentId: 'persisted-incident',
      active: true,
      type: 'fire',
      title: '복원 확인 화재',
      address: '광주광역시 북구 테스트로 119',
      startedAt: incidentStartedAt,
      note: '',
    }));
  }, { incidentStartedAt: startedAt });

  await page.goto('/#dashboard');
  await page.reload();

  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole('button', { name: '평시 업무 모드' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {
    name: '출동 대응 모드, 복원 확인 화재 진행 중',
  })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toContainText('복원 확인 화재');
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '대시보드' })).toBeVisible();
  await expect(page.getByText('현재 날씨', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '출동 대응 바로가기' })).toHaveCount(0);
});

test('업무 공간: 평시 화면에서 출동이 시작되면 상황판과 출동 대응으로 함께 전환한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#dashboard');

  await page.evaluate((startedAt) => {
    const session = {
      incidentId: 'external-start',
      active: true,
      type: 'rescue',
      title: '외부 시작 구조 출동',
      address: '광주광역시 동구 테스트로 119',
      startedAt,
      note: '',
    };
    localStorage.setItem('119helper-incident-session', JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('119helper-incident-session-updated', { detail: session }));
  }, Date.now());

  await expect(page).toHaveURL(/#incident$/);
  await expect(page.getByRole('button', {
    name: '출동 대응 모드, 외부 시작 구조 출동 진행 중',
  })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '상황판' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '외부 시작 구조 출동' })).toBeVisible();
});

test('출동 상황판: 시작·도구 열람·종료가 활동 타임라인에 자동 기록된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installIncidentGeocoder(page);
  await page.goto('/?tab=incident');

  await page.getByRole('button', { name: 'ambulance 구급', exact: true }).click();
  await page.getByLabel('출동 제목').fill('광주 환자 이송');
  await page.getByLabel(/현장 주소/).fill('광주 서구');
  await page.getByLabel('초기 상황 및 위험요소').fill('의식 저하');
  await page.getByRole('button', { name: /위치 기준 브리핑 시작/ }).click();

  await expect(page.getByRole('heading', { name: '광주 환자 이송' })).toBeVisible();
  await expect(page.getByText(/변화 감시 중/)).toBeVisible();
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toBeVisible();
  const incidentNav = page.getByRole('navigation', { name: '주요 기능' });
  await expect(incidentNav.getByRole('button', { name: '상황판' })).toBeVisible();
  await expect(incidentNav.getByRole('button', { name: '타이머' })).toBeVisible();

  await page.getByRole('button', { name: '평시 업무 모드' }).click();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '출동 대응 모드, 광주 환자 이송 진행 중',
  })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', {
    name: '출동 대응 모드, 광주 환자 이송 진행 중',
  }).click();
  await expect(page).toHaveURL(/#incident$/);

  const quickActivity = page.getByLabel('구급 출동 활동 빠른 기록');
  await quickActivity.getByRole('button', { name: '현장도착 기록' }).click();
  const recordedArrival = quickActivity.getByRole('button', { name: /현장도착 기록됨.*수정/ });
  await expect(recordedArrival).toBeVisible();
  await recordedArrival.click();
  const stageEditor = page.getByRole('dialog', { name: '현장도착' });
  await expect(stageEditor).toBeVisible();
  const futureTime = await page.evaluate(() => {
    const timestamp = Date.now() + 60_000;
    const date = new Date(timestamp);
    return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
  });
  await stageEditor.getByLabel('기록 날짜와 시각').fill(futureTime);
  await stageEditor.getByRole('button', { name: '시각 저장' }).click();
  await expect(stageEditor.getByRole('alert')).toContainText('미래 시각');
  await page.waitForTimeout(1_100);
  await stageEditor.getByRole('button', { name: '현재 시각으로 설정' }).click();
  await expect(stageEditor.getByRole('button', { name: '시각 저장' })).toBeEnabled();
  await stageEditor.getByRole('button', { name: '시각 저장' }).click();
  await expect(stageEditor).toBeHidden();
  await quickActivity.getByRole('button', { name: '이송개시 기록' }).click();

  const started = await page.evaluate(() => ({
    activity: JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'),
    incident: JSON.parse(localStorage.getItem('119helper-incident-session') || '{}'),
  }));
  expect(started.activity.presetId).toBe('ems');
  expect(started.activity.stamps[0].label).toBe('출동');
  expect(started.activity.stamps.filter((stamp: { stageId?: string }) => stamp.stageId === 'arrival')).toHaveLength(1);
  expect(started.activity.stamps.some((stamp: { stageId?: string }) => stamp.stageId === 'transport')).toBe(true);
  expect(started.incident.location).toMatchObject({
    regionName: '광주광역시',
    districtName: '서구',
  });

  await quickActivity.getByRole('button', { name: /이송개시 기록됨.*수정/ }).click();
  const transportEditor = page.getByRole('dialog', { name: '이송개시' });
  await transportEditor.getByRole('button', { name: '기록 삭제' }).click();
  await transportEditor.getByRole('button', { name: '정말 삭제' }).click();
  await expect(quickActivity.getByRole('button', { name: '이송개시 기록' })).toBeVisible();
  const afterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'));
  expect(afterDelete.stamps.some((stamp: { stageId?: string }) => stamp.stageId === 'transport')).toBe(false);

  await page.getByRole('button', { name: /활동기록/ }).click();
  await expect(page).toHaveURL(/#activity-log$/);
  await expect(page.getByRole('button', { name: '출동 기록 보호 중' })).toBeDisabled();
  await expect(page.getByText(/상황판 종료 전까지 새 기록으로 덮어쓸 수 없습니다/)).toBeVisible();
  const afterTool = await page.evaluate(() => JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'));
  expect(afterTool.stamps.some((stamp: { label?: string }) => stamp.label === '활동기록 열람')).toBe(true);

  await page.getByRole('button', { name: '진행 중인 구급 출동 상황판 열기' }).click();
  await expect(page).toHaveURL(/#incident$/);
  await page.getByRole('button', { name: '상황 종료' }).click();
  const closeReview = page.getByRole('dialog', { name: '출동 종료 점검' });
  await expect(closeReview).toBeVisible();
  await expect(closeReview).toContainText('미기록');
  await expect(closeReview.getByRole('button', { name: '확인 후 출동 종료' })).toBeDisabled();
  await closeReview.getByRole('checkbox').check();
  await closeReview.getByRole('button', { name: '확인 후 출동 종료' }).click();

  const ended = await page.evaluate(() => ({
    activity: JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'),
    incident: JSON.parse(localStorage.getItem('119helper-incident-session') || '{}'),
  }));
  expect(ended.incident.active).toBe(false);
  expect(ended.incident.endedAt).toBeGreaterThan(ended.incident.startedAt);
  expect(ended.activity.stamps.some((stamp: { label?: string }) => stamp.label === '상황판 종료')).toBe(true);
  await expect(page.getByRole('region', { name: '진행 중인 출동' })).toBeHidden();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.getByRole('button', { name: '평시 업무 모드' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '주요 기능' }).getByRole('button', { name: '대시보드' })).toBeVisible();

  await page.getByRole('button', { name: '최근 출동 확인' }).click();
  await expect(page).toHaveURL(/#incident$/);
  const recentIncident = page.getByRole('region', { name: '최근 종료 출동' });
  await expect(recentIncident).toContainText('광주 환자 이송');
  await expect(recentIncident).toContainText('출동 시간');
  await recentIncident.getByRole('button', { name: '활동 기록·보고서 열기' }).click();
  await expect(page).toHaveURL(/#activity-log$/);
});

test.describe('모바일 출동 원탭', () => {
  test.use({ serviceWorkers: 'block' });

  test('모바일: 출동 원탭 후보를 지정하고 새로고침 뒤에도 복원한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installIncidentGeocoder(page);
  await page.route('**/api/road-disasters**', async route => {
    if (route.request().method() === 'OPTIONS') {
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        source: '국토교통부 국가교통정보센터',
        sourceUrl: 'https://its.go.kr/',
        retrievedAt: new Date().toISOString(),
        query: {
          lat: 37.5665,
          lng: 126.978,
          radiusKm: 5,
          eventType: 'all',
          startDate: '20260724',
          endDate: '20260731',
          bounds: { minX: 126.9, maxX: 127, minY: 37.5, maxY: 37.6 },
        },
        totalCount: 1,
        truncated: false,
        items: [{
          eventId: 'ROAD-1',
          eventType: 'sinkhole',
          eventTypeCode: 'D06',
          eventDetailType: '1',
          status: '1',
          occurredAt: '2026-07-31T08:00:00+09:00',
          endedAt: null,
          facilityName: null,
          facilityExtent: null,
          geometry: {
            type: 'Point',
            coordinates: [[126.978, 37.5665]],
            raw: 'POINT(126.978 37.5665)',
          },
          road: { linkIds: [], names: ['세종대로'], number: null, direction: null },
          control: { type: 'full', typeCode: '4', blockedLanes: '전 차로' },
          message: '복구 작업으로 전면 통제',
        }],
      }),
    });
  });
  await page.route('**/api/er/**', async route => {
    if (route.request().method() === 'OPTIONS') {
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
    const pathname = new URL(route.request().url()).pathname;
    const hospitalName = pathname.endsWith('/beds') || pathname.endsWith('/list')
      ? '서울시민병원'
      : undefined;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ xml: erXml(hospitalName) }),
    });
  });
  await page.route('**/firewater/**', async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname.endsWith('/manifest.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 2,
          generatedAt: '2026-07-31T00:00:00.000Z',
          maxAgeDays: 120,
          cities: {
            서울특별시: {
              city: '서울특별시',
              sourceDate: '2026-07-30',
              generatedAt: '2026-07-31T00:00:00.000Z',
              total: 1,
              hydrants: 1,
              waterTowers: 0,
            },
          },
        }),
      });
      return;
    }
    if (pathname.endsWith('/index.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 1,
          districts: { 종로구: 1 },
          hydrants: 1,
          waterTowers: 0,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: {
          body: {
            items: [{
              fcltyNo: 'FW-1',
              fcltyKndNm: '소화전',
              rdnmadr: '서울특별시 종로구 세종대로 210',
              latitude: '37.5666',
              longitude: '126.9781',
              signguNm: '종로구',
              insptnSttusNm: '정상',
            }],
          },
        },
      }),
    });
  });

  await page.goto('/?tab=incident');
  await page.getByRole('button', { name: 'ambulance 구급', exact: true }).click();
  await page.getByLabel('출동 제목').fill('세종대로 구급');
  await page.getByLabel(/현장 주소/).fill('서울특별시 종로구 세종대로 209');
  await page.getByRole('button', { name: /위치 기준 브리핑 시작/ }).click();

  const roadButton = page.getByRole('button', { name: '세종대로 진입 주의로 고정' });
  const fireWaterButton = page.getByRole('button', { name: 'FW-1 소화전 사용 후보 지정' });
  const hospitalButton = page.getByRole('button', { name: '서울시민병원 전화 확인 후보 지정' });
  await expect(roadButton).toHaveAttribute('aria-pressed', 'false');
  await expect(fireWaterButton).toHaveAttribute('aria-pressed', 'false');
  await expect(hospitalButton).toHaveAttribute('aria-pressed', 'false');
  await roadButton.click();
  await fireWaterButton.click();
  await hospitalButton.click();
  await expect(roadButton).toHaveAttribute('aria-pressed', 'true');
  await expect(fireWaterButton).toHaveAttribute('aria-pressed', 'true');
  await expect(hospitalButton).toHaveAttribute('aria-pressed', 'true');

  const selectedActions = page.getByRole('region', { name: '선택한 현장 조치' });
  await expect(selectedActions).toContainText('세종대로');
  await expect(selectedActions).toContainText('서울시민병원');
  const beforeRepeat = await page.evaluate(() => {
    const activity = JSON.parse(localStorage.getItem('119helper-activity-session') || '{}');
    return activity.stamps.filter((stamp: { label?: string }) => stamp.label?.includes('후보 지정')).length;
  });
  await roadButton.click();
  const persisted = await page.evaluate(() => {
    const incident = JSON.parse(localStorage.getItem('119helper-incident-session') || '{}');
    const activity = JSON.parse(localStorage.getItem('119helper-activity-session') || '{}');
    return {
      selections: incident.selections,
      selectionActivityCount: activity.stamps.filter(
        (stamp: { label?: string }) => stamp.label?.includes('후보 지정'),
      ).length,
    };
  });
  expect(persisted.selections).toMatchObject({
    road: { id: 'ROAD-1' },
    fireWater: { id: 'FW-1' },
    hospital: { id: 'TEST-1' },
  });
  expect(persisted.selectionActivityCount).toBe(beforeRepeat);

  await page.reload();
  await expect(page.getByRole('region', { name: '선택한 현장 조치' })).toContainText('서울시민병원');
  await expect(page.getByRole('button', { name: '세종대로 진입 주의로 고정' }))
    .toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 320, height: 568 });
  const touchTargets = [
    page.getByRole('button', { name: '세종대로 진입 주의로 고정' }),
    page.getByRole('button', { name: 'FW-1 소화전 사용 후보 지정' }),
    page.getByRole('button', { name: '서울시민병원 전화 확인 후보 지정' }),
    page.getByRole('link', { name: '서울시민병원 전화' }),
  ];
  for (const target of touchTargets) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  });
});

test('활성 출동: 현장 모드와 사건 주소를 다른 도구로 이어간다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installIncidentGeocoder(page);
  await page.goto('/?tab=incident');

  await page.getByLabel('출동 제목').fill('세종대로 현장');
  await page.getByLabel(/현장 주소/).fill('서울특별시 종로구 세종대로 209');
  await page.getByRole('button', { name: /위치 기준 브리핑 시작/ }).click();
  await page.getByRole('button', { name: '현장 모드 켜기' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-readability', 'field');
  await expect(page.getByRole('button', { name: '현장 모드 끄기' })).toHaveAttribute('aria-pressed', 'true');

  const incidentNav = page.getByRole('navigation', { name: '주요 기능' });
  await incidentNav.getByRole('button', { name: '시설' }).click();
  await expect(page.getByLabel('건축물 주소')).toHaveValue('서울특별시 종로구 세종대로 209');
  await expect(page.getByText('진행 중인 출동 주소', { exact: true })).toBeVisible();

  await page.goto('/#preplan');
  await expect(page.getByText('진행 중인 출동 정보 연결됨', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '출동 정보로 추가', exact: true }).click();
  await expect(page.getByLabel('대상물명')).toHaveValue('세종대로 현장');
  await expect(page.getByLabel('주소')).toHaveValue('서울특별시 종로구 세종대로 209');
});

test('활성 출동: 사건 맥락으로 유사 위해사고를 즉시 좁힌다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installIncidentGeocoder(page);
  await page.route('**/api/consumer-hazard**', async route => {
    const request = route.request();
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

    const url = new URL(request.url());
    const pageNo = Number(url.searchParams.get('pageNo') || '1');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        response: {
          body: {
            items: {
              item: [{
                receptionNumber: `incident-hazard-${pageNo}`,
                receiveDay: '2026-04-02',
                occurrenDate: '2026-04-01',
                treatmentPeriod: '당일',
                age: '70대',
                gender: '여성',
                itemMajor: '시설 및 서비스',
                itemMiddle: '욕실',
                itemMinor: '욕실 바닥',
                injuryReason: '미끄러져 넘어짐',
                injuryPart: '엉덩이',
                injurySymptoms: '타박상',
                occurrencePlace: '가정 욕실',
              }],
            },
            totalCount: 750,
            pageNo,
            numOfRows: 250,
          },
        },
      }),
    });
  });

  await page.goto('/?tab=incident');
  await page.getByRole('button', { name: 'emergency 구조', exact: true }).click();
  await page.getByLabel('출동 제목').fill('아파트 욕실 고령자 낙상 구조');
  await page.getByLabel(/현장 주소/).fill('서울특별시 종로구 세종대로 209');
  await page.getByLabel('초기 상황 및 위험요소').fill('욕실 바닥에서 넘어짐');
  await page.getByRole('button', { name: /위치 기준 브리핑 시작/ }).click();
  const nextChecks = page.getByRole('region', { name: '출동별 다음 확인' });
  await expect(nextChecks).toContainText('확인 0/4');
  await nextChecks.getByRole('button', { name: '지금: 유사사고 패턴 확인' }).click();

  await expect(page).toHaveURL(/#hazards$/);
  await expect(page.getByText(/진행 중 사건과 연결됨/)).toBeVisible();
  await expect(page.getByLabel('유사 사고 검색')).toHaveValue('욕실');
  await expect(page.getByRole('button', { name: /낙상·추락/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/‘욕실’ 범위까지 자동으로 넓혔습니다/)).toBeVisible();
  await expect(page.getByText(/현재 조건 3건/)).toBeVisible();

  await page.goto('/#incident');
  const advancedChecks = page.getByRole('region', { name: '출동별 다음 확인' });
  await expect(advancedChecks).toContainText('확인 1/4');
  await expect(advancedChecks.getByRole('button', { name: '지금: 건축물 정보 확인' })).toBeVisible();
});

test('활동 기록: 뒤바뀐 단계 시각을 경고하고 수정 후 해제한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=incident');

  await page.getByRole('button', { name: 'ambulance 구급', exact: true }).click();
  await page.getByLabel('출동 제목').fill('순서 확인 테스트');
  await page.getByRole('button', { name: /위치 기준 브리핑 시작/ }).click();
  await page.getByRole('button', { name: /위치 없이 .* 지역 기준으로 시작/ }).click();

  const quickActivity = page.getByLabel('구급 출동 활동 빠른 기록');
  await quickActivity.getByRole('button', { name: '병원도착 기록' }).click();
  await page.waitForTimeout(1_100);
  await quickActivity.getByRole('button', { name: '이송개시 기록' }).click();

  const orderWarning = page.getByRole('button', { name: /활동 시각 순서 1건 확인/ });
  await expect(orderWarning).toBeVisible();
  await expect(quickActivity.getByRole('button', { name: /이송개시 기록됨.*순서 확인 필요.*수정/ })).toBeVisible();
  await expect(quickActivity.getByRole('button', { name: /병원도착 기록됨.*순서 확인 필요.*수정/ })).toBeVisible();

  await page.getByRole('button', { name: '상황 종료' }).click();
  const closeReview = page.getByRole('dialog', { name: '출동 종료 점검' });
  await expect(closeReview).toContainText('‘병원도착’ 시각이 ‘이송개시’보다 빠릅니다.');
  await closeReview.getByRole('button', { name: '활동 타임라인 확인' }).click();
  await expect(page).toHaveURL(/#activity-log$/);
  const orderAlert = page.getByRole('alert', { name: '활동 시각 순서 확인' });
  await expect(orderAlert).toContainText('‘병원도착’ 시각이 ‘이송개시’보다 빠릅니다.');

  await orderAlert.getByRole('button', { name: '병원도착 시각 수정' }).click();
  const editor = page.getByRole('dialog', { name: '병원도착' });
  await page.waitForTimeout(1_100);
  await editor.getByRole('button', { name: '현재 시각으로 설정' }).click();
  await editor.getByRole('button', { name: '시각 저장' }).click();

  await expect(orderAlert).toBeHidden();
  await expect(page.getByRole('button', { name: /활동 시각 순서 1건 확인/ })).toBeHidden();
  const corrected = await page.evaluate(() => JSON.parse(localStorage.getItem('119helper-activity-session') || '{}'));
  const transport = corrected.stamps.find((stamp: { stageId?: string }) => stamp.stageId === 'transport');
  const hospital = corrected.stamps.find((stamp: { stageId?: string }) => stamp.stageId === 'hospital');
  expect(transport.time).toBeLessThanOrEqual(hospital.time);
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
