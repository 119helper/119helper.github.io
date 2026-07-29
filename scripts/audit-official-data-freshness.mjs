import { readFile } from 'node:fs/promises';

const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': '119-helper-data-freshness-audit/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function maxMatch(text, pattern, label) {
  const values = [...text.matchAll(pattern)].map(match => match[1]).sort();
  if (values.length === 0) throw new Error(`${label}: 공식 페이지에서 기준일을 찾지 못했습니다.`);
  return values.at(-1);
}

function monthValue(value) {
  const normalized = String(value).replace(/[^0-9]/g, '').slice(0, 6);
  return Number(normalized);
}

async function auditAnnualFire() {
  const [official, routeSource] = await Promise.all([
    fetchText('https://www.data.go.kr/tcs/dss/selectFileDataDetailView.do?publicDataPk=15060386'),
    readFile(new URL('../worker/src/routes/annualFireStats.ts', import.meta.url), 'utf8'),
  ]);
  const officialDate = maxMatch(
    official,
    /소방청_연간화재통계_(20\d{6})/g,
    '연간화재통계',
  );
  const supportedYears = [...routeSource.matchAll(/^\s*'(20\d{2})':\s*'uddi:/gm)]
    .map(match => match[1])
    .sort();
  const appYear = supportedYears.at(-1);
  const officialYear = officialDate.slice(0, 4);
  if (!appYear || Number(appYear) < Number(officialYear)) {
    throw new Error(`연간화재통계: 공식 ${officialYear}년 자료가 공개됐지만 앱 최신연도는 ${appYear ?? '없음'}입니다.`);
  }
  console.log(`PASS annual-fire-records official=${officialYear} app=${appYear}`);
}

async function auditNfaFireYearbook() {
  const [official, snapshotText] = await Promise.all([
    fetchText('https://www.nfa.go.kr/nfa/releaseinformation/statisticalinformation/main/?pageIdx=1'),
    readFile(new URL('../worker/src/data/nfdsAnnualFireSnapshots.json', import.meta.url), 'utf8'),
  ]);
  const publishedYears = [...official.matchAll(/(20\d{2})년도\s*화재통계연감/g)]
    .map(match => match[1])
    .sort();
  const officialYear = publishedYears.at(-1);
  const snapshot = JSON.parse(snapshotText);
  const appYear = String(snapshot.latestCompleteYear ?? '');
  if (!officialYear) throw new Error('소방청 화재통계연감 최신연도를 찾지 못했습니다.');
  if (Number(appYear) < Number(officialYear)) {
    throw new Error(`화재통계연감: 공식 ${officialYear}년 자료가 공개됐지만 앱 완결연도는 ${appYear || '없음'}입니다.`);
  }
  console.log(`PASS nfa-fire-yearbook official=${officialYear} app-complete=${appYear}`);
}

async function auditNfdsSnapshotAge() {
  const snapshot = JSON.parse(await readFile(
    new URL('../worker/src/data/nfdsAnnualFireSnapshots.json', import.meta.url),
    'utf8',
  ));
  const through = String(snapshot.latestDataThrough ?? '');
  const referenceTime = new Date(`${through}T23:59:59+09:00`).getTime();
  if (!through || Number.isNaN(referenceTime)) throw new Error('NFDS 누계 스냅샷 기준일이 없습니다.');
  const ageDays = Math.floor((Date.now() - referenceTime) / DAY_MS);
  if (ageDays > 30) {
    throw new Error(`NFDS 누계 스냅샷이 ${through} 기준으로 ${ageDays}일 지났습니다. npm run sync:fire-stats를 실행하세요.`);
  }
  const latestCompleteYear = String(snapshot.latestCompleteYear ?? '');
  const expectedYears = [
    String(Number(latestCompleteYear) - 1),
    latestCompleteYear,
    through.slice(0, 4),
  ];
  for (const year of expectedYears) {
    const period = snapshot.snapshots?.[year];
    if (!period || period.regionalMonthlyGranularity !== 'sido-month') {
      throw new Error(`NFDS ${year}: 시도·월 집계 스냅샷이 없습니다.`);
    }
    const expectedMonths = period.coverageType === 'complete' ? 12 : Number(through.slice(5, 7));
    if (!Array.isArray(period.byMonth) || period.byMonth.length !== expectedMonths) {
      throw new Error(`NFDS ${year}: 월 집계 ${period.byMonth?.length ?? 0}개, 예상 ${expectedMonths}개`);
    }
    for (const month of period.byMonth) {
      const regionalCount = (month.bySido ?? []).reduce((sum, row) => sum + Number(row.count || 0), 0);
      if (regionalCount !== month.count) {
        throw new Error(`NFDS ${year} ${month.month}: 시도 합계 ${regionalCount}건 / 월 총계 ${month.count}건`);
      }
    }
  }
  console.log(
    `${ageDays > 7 ? 'WARN' : 'PASS'} nfds-ytd through=${through} ageDays=${ageDays} regional-monthly=${expectedYears.join(',')}`,
  );
}

async function auditHazmatProvinceSummary() {
  const [official, localSource] = await Promise.all([
    fetchText('https://www.nfa.go.kr/nfa/releaseinformation/statisticalinformation/main/?boardId=bbs_0000000000000019&cntId=79&mode=view&pageIdx=1'),
    readFile(new URL('../src/data/hazmatFacilities.ts', import.meta.url), 'utf8'),
  ]);
  const officialMatch = official.match(/위험물\s*통계자료[^<]{0,80}\((20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  const localDate = localSource.match(/provinceSummary:\s*\{[\s\S]*?referenceDate:\s*'(20\d{2}-\d{2}-\d{2})'/)?.[1];
  if (!officialMatch) throw new Error('소방청 위험물 통계 기준일을 찾지 못했습니다.');
  const officialDate = `${officialMatch[1]}-${officialMatch[2].padStart(2, '0')}-${officialMatch[3].padStart(2, '0')}`;
  if (!localDate || localDate < officialDate) {
    throw new Error(`위험물 도 합계: 공식 ${officialDate} 자료가 공개됐지만 앱 기준일은 ${localDate ?? '없음'}입니다.`);
  }
  console.log(`PASS hazmat-province official=${officialDate} app=${localDate}`);
}

async function auditTsunamiMetadata() {
  const [officialText, manifestText] = await Promise.all([
    fetchText('https://www.safetydata.go.kr/disaster-data/getApiView?dataSn=1340'),
    readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'),
  ]);
  const official = JSON.parse(officialText);
  const officialDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Number(official.updtymd)));
  const local = JSON.parse(manifestText).datasets?.tsunami;
  const localDate = String(local?.sourceDate ?? '');
  if (!officialDate || localDate < officialDate) {
    throw new Error(`지진해일: 안전데이터 갱신일 ${officialDate}보다 앱 기준일 ${localDate || '없음'}이 오래됐습니다.`);
  }
  const mismatch = local?.reconciliationStatus === 'upstream-mismatch'
    ? ` announced=${local.announcedTotal} api=${local.total}`
    : '';
  console.log(`PASS tsunami-metadata official=${officialDate} app=${localDate}${mismatch}`);
}

async function auditMultiuse() {
  const [official, fallbackSource] = await Promise.all([
    fetchText('https://www.data.go.kr/data/15083979/fileData.do'),
    readFile(new URL('../worker/src/data/multiuse2025.ts', import.meta.url), 'utf8'),
  ]);
  const officialDate = maxMatch(
    official,
    /다중이용업소 영업장별 고유 일련번호_(20\d{6})/g,
    '다중이용업소',
  );
  const localDate = fallbackSource.match(/sourceDate:\s*'(20\d{2}-\d{2}-\d{2})'/)?.[1];
  if (!localDate || Number(officialDate) > Number(localDate.replaceAll('-', ''))) {
    throw new Error(`다중이용업소: 공식 ${officialDate} 자료가 앱 폴백 ${localDate ?? '없음'}보다 최신입니다.`);
  }
  console.log(`PASS multiuse official=${officialDate} fallback=${localDate}`);
}

async function auditFireDamageCoverage() {
  const [catalogText, routeSource] = await Promise.all([
    fetchText('https://www.data.go.kr/catalog/15142972/openapi.json'),
    readFile(new URL('../worker/src/routes/fireDamage.ts', import.meta.url), 'utf8'),
  ]);
  const catalog = JSON.parse(catalogText);
  const officialTo = String(catalog.temporalCoverage ?? '').match(/-\s*(20\d{2})년\s*(\d{2})월/)?.slice(1, 3).join('-');
  const appTo = routeSource.match(/const AVAILABLE_TO = '(20\d{2}-\d{2})'/)?.[1];
  if (!officialTo || !appTo) throw new Error('화재피해: 공식 또는 앱 제공 종료월을 읽지 못했습니다.');
  if (monthValue(appTo) < monthValue(officialTo)) {
    throw new Error(`화재피해: 공식 제공범위가 ${officialTo}로 늘었지만 앱은 ${appTo}까지입니다.`);
  }
  console.log(`PASS fire-damage official-to=${officialTo} app-to=${appTo}`);
}

async function reportStaticSourceAge() {
  const [staticManifestText, firewaterManifestText] = await Promise.all([
    readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/firewater/manifest.json', import.meta.url), 'utf8'),
  ]);
  const staticManifest = JSON.parse(staticManifestText);
  const firewaterManifest = JSON.parse(firewaterManifestText);
  const rows = Object.values(staticManifest.datasets ?? {}).map(dataset => ({
    label: dataset.label,
    sourceDate: dataset.sourceDate,
    maxAgeDays: dataset.maxAgeDays,
  }));
  const firewaterDate = Object.values(firewaterManifest.cities ?? {})
    .map(city => city.sourceDate)
    .filter(Boolean)
    .sort()
    .at(0);
  rows.push({
    label: firewaterManifest.dataset ?? '소방용수시설',
    sourceDate: firewaterDate,
    maxAgeDays: firewaterManifest.maxAgeDays,
  });

  for (const row of rows) {
    const ageDays = row.sourceDate
      ? Math.floor((Date.now() - new Date(row.sourceDate).getTime()) / DAY_MS)
      : null;
    const stale = ageDays !== null && Number(row.maxAgeDays) > 0 && ageDays > Number(row.maxAgeDays);
    console.log(`${stale ? 'WARN' : 'PASS'} static ${row.label} source=${row.sourceDate ?? 'unknown'} ageDays=${ageDays ?? 'unknown'}`);
  }
}

function numberField(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label}: 0 이상의 유효한 숫자가 필요합니다.`);
  }
  return number;
}

async function auditStaticCompleteness() {
  const [
    manifestText,
    tsunamiText,
    firewaterManifestText,
    restroomRegionalCoordinateText,
  ] = await Promise.all([
    readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/tsunami.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/firewater/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/restroom-official-regional-coordinates.json', import.meta.url), 'utf8'),
  ]);
  const datasets = JSON.parse(manifestText).datasets ?? {};

  const civil = datasets.civil ?? {};
  const civilTotal = numberField(civil.total, '민방위 앱 합계');
  const civilActiveTotal = numberField(civil.activeUpstreamTotal, '민방위 전국 사용중 합계');
  const civilCityEntries = Object.entries(civil.cities ?? {});
  const civilCityTotal = civilCityEntries.reduce(
    (sum, [, value]) => sum + numberField(value, '민방위 도시별 합계'),
    0,
  );
  if (civilCityEntries.length !== Number(civil.supportedCityCount ?? civilCityEntries.length)) {
    throw new Error('민방위: supportedCityCount와 도시별 집계 수가 다릅니다.');
  }
  if (civilCityTotal !== civilTotal) {
    throw new Error(`민방위: 도시별 합계 ${civilCityTotal}건과 앱 합계 ${civilTotal}건이 다릅니다.`);
  }
  if (civilTotal > civilActiveTotal) {
    throw new Error(`민방위: 앱 합계 ${civilTotal}건이 전국 사용중 ${civilActiveTotal}건보다 큽니다.`);
  }
  console.log(
    `SCOPE static-completeness civil supportedCities=${civilCityEntries.length} app=${civilTotal} nationwideActive=${civilActiveTotal}`,
  );

  const restrooms = datasets.restrooms ?? {};
  const restroomTotal = numberField(restrooms.total, '화장실 지도 합계');
  const restroomSupportedTotal = numberField(restrooms.supportedCityTotal, '화장실 지원지역 원본 합계');
  const restroomMissingCoordinates = numberField(
    restrooms.missingCoordinateCount,
    '화장실 좌표 미확인 합계',
  );
  if (restroomTotal + restroomMissingCoordinates !== restroomSupportedTotal) {
    throw new Error(
      `공중화장실: 지도 ${restroomTotal}건 + 좌표 미확인 ${restroomMissingCoordinates}건이 `
      + `지원지역 원본 ${restroomSupportedTotal}건과 다릅니다.`,
    );
  }
  const coordinateCoverage = restroomSupportedTotal > 0
    ? Math.round((restroomTotal / restroomSupportedTotal) * 1_000) / 10
    : 0;
  if (Number(restrooms.coordinateCoveragePercent) !== coordinateCoverage) {
    throw new Error(
      `공중화장실: coordinateCoveragePercent ${restrooms.coordinateCoveragePercent}와 `
      + `재계산값 ${coordinateCoverage}가 다릅니다.`,
    );
  }
  const restroomRegionalCoordinates = JSON.parse(restroomRegionalCoordinateText);
  const regionalCoordinateItems = Array.isArray(restroomRegionalCoordinates.items)
    ? restroomRegionalCoordinates.items
    : [];
  const regionalCoordinateTotal = numberField(
    restroomRegionalCoordinates.total,
    '화장실 공식 지역 좌표 인덱스 합계',
  );
  if (regionalCoordinateItems.length !== regionalCoordinateTotal) {
    throw new Error(
      `공중화장실: 공식 지역 좌표 파일 ${regionalCoordinateItems.length}건과 `
      + `인덱스 합계 ${regionalCoordinateTotal}건이 다릅니다.`,
    );
  }
  if (numberField(restrooms.regionalCoordinateCount, '화장실 공식 지역 좌표 manifest 합계')
    !== regionalCoordinateTotal) {
    throw new Error('공중화장실: 공식 지역 좌표 manifest 합계가 인덱스와 다릅니다.');
  }
  const sourceGainTotal = (restroomRegionalCoordinates.sources ?? [])
    .reduce((sum, source) => sum + numberField(source.gainCount, `${source.id} 좌표 보충 합계`), 0);
  if (sourceGainTotal !== regionalCoordinateTotal) {
    throw new Error(
      `공중화장실: 공식 지역 출처별 보충 ${sourceGainTotal}건과 인덱스 ${regionalCoordinateTotal}건이 다릅니다.`,
    );
  }
  console.log(
    `${restroomMissingCoordinates > 0 ? 'WARN' : 'PASS'} static-completeness restrooms `
    + `mapped=${restroomTotal} supported=${restroomSupportedTotal} missingCoordinates=${restroomMissingCoordinates} `
    + `coverage=${coordinateCoverage.toFixed(1)}% officialRegional=${regionalCoordinateTotal}`,
  );

  const tsunami = datasets.tsunami ?? {};
  const tsunamiItems = JSON.parse(tsunamiText);
  const tsunamiTotal = numberField(tsunami.total, '지진해일 manifest 합계');
  if (!Array.isArray(tsunamiItems) || tsunamiItems.length !== tsunamiTotal) {
    throw new Error(
      `지진해일: 파일 ${Array.isArray(tsunamiItems) ? tsunamiItems.length : '배열 아님'}건과 `
      + `manifest ${tsunamiTotal}건이 다릅니다.`,
    );
  }
  for (const field of ['rawTotal', 'uniqueTotal', 'activeTotal']) {
    if (numberField(tsunami[field], `지진해일 ${field}`) !== tsunamiTotal) {
      throw new Error(`지진해일: ${field}가 manifest 합계와 다릅니다.`);
    }
  }
  const tsunamiRegionTotal = Object.values(tsunami.regionCounts ?? {})
    .reduce((sum, value) => sum + numberField(value, '지진해일 지역별 합계'), 0);
  if (tsunamiRegionTotal !== tsunamiTotal) {
    throw new Error(`지진해일: 지역별 합계 ${tsunamiRegionTotal}건과 전체 ${tsunamiTotal}건이 다릅니다.`);
  }
  const announcedTotal = numberField(tsunami.announcedTotal, '지진해일 발표 합계');
  const expectedDelta = tsunamiTotal - announcedTotal;
  if (Number(tsunami.countDelta) !== expectedDelta) {
    throw new Error(`지진해일: countDelta ${tsunami.countDelta}가 실제 차이 ${expectedDelta}와 다릅니다.`);
  }
  console.log(
    `${expectedDelta === 0 ? 'PASS' : 'WARN'} static-completeness tsunami `
    + `api=${tsunamiTotal} announced=${announcedTotal} delta=${expectedDelta}`,
  );

  const firewater = JSON.parse(firewaterManifestText);
  const firewaterCities = Object.values(firewater.cities ?? {});
  const supportedFirewaterCities = numberField(
    firewater.supportedCityCount ?? firewaterCities.length,
    '소방용수 지원 도시 수',
  );
  if (firewaterCities.length !== 9 || supportedFirewaterCities !== firewaterCities.length) {
    throw new Error(
      `소방용수: 도시 manifest ${firewaterCities.length}개와 지원 도시 수 ${supportedFirewaterCities}개가 다릅니다.`,
    );
  }
  for (const city of firewaterCities) {
    const total = numberField(city.total, `소방용수 ${city.city ?? '도시'} 합계`);
    const hydrants = numberField(city.hydrants, `소방용수 ${city.city ?? '도시'} 소화전 합계`);
    const waterTowers = numberField(city.waterTowers, `소방용수 ${city.city ?? '도시'} 급수탑/저수조 합계`);
    if (hydrants + waterTowers !== total) {
      throw new Error(
        `소방용수 ${city.city ?? '도시'}: 유형 합계 ${hydrants + waterTowers}건과 전체 ${total}건이 다릅니다.`,
      );
    }
  }
  for (const overlay of firewater.regionalOverlays ?? []) {
    const overlayFile = new URL(
      `../public/firewater/${overlay.city}/${overlay.district}.json`,
      import.meta.url,
    );
    const overlayPayload = JSON.parse(await readFile(overlayFile, 'utf8'));
    const overlayItems = overlayPayload.response?.body?.items;
    if (!Array.isArray(overlayItems) || overlayItems.length !== numberField(overlay.total, '지역 오버레이 합계')) {
      throw new Error(`소방용수 ${overlay.city} ${overlay.district}: 오버레이 파일 행 수가 manifest와 다릅니다.`);
    }
    const mappedCount = overlayItems.filter(item =>
      Number.isFinite(Number(item.latitude))
      && Number.isFinite(Number(item.longitude))
      && Number(item.latitude) !== 0
      && Number(item.longitude) !== 0
    ).length;
    if (mappedCount !== numberField(overlay.coordinateMappedCount, '지역 오버레이 좌표 합계')) {
      throw new Error(`소방용수 ${overlay.city} ${overlay.district}: 좌표 합계가 manifest와 다릅니다.`);
    }
    const backfillCount = overlayItems.filter(item =>
      item.coordinateSource === 'national-standard-baseline-exact-address-match'
    ).length;
    if (backfillCount !== numberField(overlay.baselineCoordinateBackfillCount, '지역 오버레이 좌표 보충 합계')) {
      throw new Error(`소방용수 ${overlay.city} ${overlay.district}: 이전 좌표 보충 합계가 manifest와 다릅니다.`);
    }
    const duplicateCounts = overlayItems.reduce((counts, item) => {
      const key = String(item.fcltyNo || '').trim();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    const duplicateNumberCount = [...duplicateCounts.values()].filter(count => count > 1).length;
    if (duplicateNumberCount !== numberField(
      overlay.duplicateFacilityNumberCount,
      '지역 오버레이 중복 시설번호 합계',
    )) {
      throw new Error(`소방용수 ${overlay.city} ${overlay.district}: 중복 시설번호 합계가 manifest와 다릅니다.`);
    }
    const normalizedAddressCount = overlayItems.filter(item => item.addressScopeNormalized === true).length;
    if (normalizedAddressCount !== numberField(
      overlay.normalizedAddressCount ?? 0,
      '지역 오버레이 주소 범위 보정 합계',
    )) {
      throw new Error(`소방용수 ${overlay.city} ${overlay.district}: 주소 범위 보정 합계가 manifest와 다릅니다.`);
    }
    console.log(
      `${mappedCount === overlayItems.length ? 'PASS' : 'WARN'} static-completeness firewater-overlay `
      + `${overlay.city}/${overlay.district} rows=${overlayItems.length} mapped=${mappedCount} `
      + `baselineBackfill=${backfillCount} missing=${overlayItems.length - mappedCount} `
      + `duplicateIds=${duplicateNumberCount} normalizedAddresses=${normalizedAddressCount}`,
    );
  }
  console.log(`PASS static-completeness firewater supportedCities=${firewaterCities.length}`);
}

await Promise.all([
  auditAnnualFire(),
  auditNfaFireYearbook(),
  auditNfdsSnapshotAge(),
  auditHazmatProvinceSummary(),
  auditTsunamiMetadata(),
  auditMultiuse(),
  auditFireDamageCoverage(),
]);
await reportStaticSourceAge();
await auditStaticCompleteness();
console.log('Official data freshness audit completed.');
