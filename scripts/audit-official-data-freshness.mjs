import { readFile } from 'node:fs/promises';
import {
  assertHostAddressPointDrift,
  REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT,
} from './restroom-host-address-points.mjs';
import {
  fingerprintTsunamiShelters,
  TSUNAMI_CONTENT_HASH_ALGORITHM,
} from './tsunami-data-integrity.mjs';
import {
  fingerprintCorroborationItems,
  fingerprintFirewaterTargetBody,
} from './sync-firewater-regional-overlays.mjs';

const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESTROOM_ADDRESS_POINT_REGRESSION = Object.freeze({
  total: 235,
  coverageGainCount: 222,
  repairCount: 13,
  uniquePointCount: 206,
  directBuildingMatchCount: 227,
  reviewedNewMatchCount: 5,
  reviewedAliasRepairCount: 3,
});
const RESTROOM_HOST_ADDRESS_POINT_REGRESSION = Object.freeze({
  total: 87,
  coverageGainCount: 87,
  repairCount: 0,
  uniquePointCount: 87,
});
const ALLOWED_ADDRESS_POINT_MATCH_METHODS = new Set([
  'unique-exact-road-address+building-name-corroboration',
  'unique-exact-road-address+reviewed-building-name-variant',
  'invalid-legacy-coordinate+unique-exact-road-address+building-name-corroboration',
  'invalid-legacy-coordinate+unique-exact-road-address+reviewed-building-alias',
  'unique-exact-road-or-lot-address+host-name-containment+coordinate-consistent-proposals',
]);

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
    restroomAddressPointText,
    restroomAddressPointIndexText,
    restroomHostAddressPointText,
    firewaterRegionalSourceText,
  ] = await Promise.all([
    readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/tsunami.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/firewater/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/restroom-official-regional-coordinates.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/restroom-official-address-points.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/restroom-address-points/busan/index.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/data/restroom-official-host-address-points.json', import.meta.url), 'utf8'),
    readFile(new URL('./firewater-regional-sources.json', import.meta.url), 'utf8'),
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
  const facilityCoordinateCount = numberField(
    restrooms.facilityCoordinateCount,
    '화장실 시설 좌표 합계',
  );
  const addressPointCount = numberField(
    restrooms.addressPointCount,
    '화장실 주소 대표점 합계',
  );
  if (facilityCoordinateCount + addressPointCount !== restroomTotal) {
    throw new Error(
      `공중화장실: 시설 좌표 ${facilityCoordinateCount}건 + 주소 대표점 ${addressPointCount}건이 `
      + `지도 합계 ${restroomTotal}건과 다릅니다.`,
    );
  }
  const baseAddressPointCount = numberField(
    restrooms.baseAddressPointCount,
    '화장실 기본 주소 대표점 합계',
  );
  const geocodedAddressPointCount = numberField(
    restrooms.legacyGeocodedAddressPointCount,
    '화장실 기존 주소 지오코딩 합계',
  );
  const legacySharedAddressPointCount = numberField(
    restrooms.legacySharedAddressPointCount,
    '화장실 동일 주소 이전 공식 좌표 합계',
  );
  if (
    baseAddressPointCount !== geocodedAddressPointCount + legacySharedAddressPointCount
    || addressPointCount !== baseAddressPointCount
      + RESTROOM_ADDRESS_POINT_REGRESSION.total
      + RESTROOM_HOST_ADDRESS_POINT_REGRESSION.total
  ) {
    throw new Error(
      '공중화장실: 기본 주소점 출처별 합계 또는 공식 주소점 결합 합계가 다릅니다.',
    );
  }
  if (numberField(restrooms.unknownCoordinateKindCount, '화장실 미분류 좌표 합계') !== 0) {
    throw new Error('공중화장실: 좌표 출처 유형을 확인하지 못한 행이 있습니다.');
  }
  if (restroomTotal < 10_000 || restroomSupportedTotal < restroomTotal) {
    throw new Error('공중화장실: 지도 또는 지원지역 합계가 안전 최소치 아래로 급감했습니다.');
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
  const sourceUpgradeTotal = (restroomRegionalCoordinates.sources ?? [])
    .reduce(
      (sum, source) => sum
        + numberField(source.precisionUpgradeCount ?? 0, `${source.id} 좌표 개선 합계`),
      0,
    );
  if (sourceGainTotal + sourceUpgradeTotal !== regionalCoordinateTotal) {
    throw new Error(
      `공중화장실: 공식 지역 출처별 보충 ${sourceGainTotal}건 + 개선 ${sourceUpgradeTotal}건과 `
      + `인덱스 ${regionalCoordinateTotal}건이 다릅니다.`,
    );
  }
  if (
    numberField(
      restrooms.regionalCoordinateCoverageGainCount,
      '화장실 공식 지역 좌표 신규 보충 manifest 합계',
    ) !== sourceGainTotal
    || numberField(
      restrooms.regionalCoordinateUpgradeCount,
      '화장실 공식 지역 좌표 정밀도 개선 manifest 합계',
    ) !== sourceUpgradeTotal
  ) {
    throw new Error('공중화장실: 공식 지역 좌표 신규·정밀도 개선 manifest 합계가 다릅니다.');
  }

  const restroomAddressPoints = JSON.parse(restroomAddressPointText);
  const officialAddressPointItems = Array.isArray(restroomAddressPoints.items)
    ? restroomAddressPoints.items
    : [];
  for (const [field, expected] of Object.entries({
    total: RESTROOM_ADDRESS_POINT_REGRESSION.total,
    coverageGainCount: RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount,
    repairCount: RESTROOM_ADDRESS_POINT_REGRESSION.repairCount,
    uniquePointCount: RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount,
    directBuildingMatchCount: RESTROOM_ADDRESS_POINT_REGRESSION.directBuildingMatchCount,
    reviewedNewMatchCount: RESTROOM_ADDRESS_POINT_REGRESSION.reviewedNewMatchCount,
    reviewedAliasRepairCount: RESTROOM_ADDRESS_POINT_REGRESSION.reviewedAliasRepairCount,
  })) {
    if (numberField(restroomAddressPoints[field], `화장실 공식 주소 대표점 ${field}`) !== expected) {
      throw new Error(`공중화장실: 공식 주소 대표점 ${field}가 검토 기준 ${expected}와 다릅니다.`);
    }
  }
  if (officialAddressPointItems.length !== RESTROOM_ADDRESS_POINT_REGRESSION.total) {
    throw new Error(
      `공중화장실: 공식 주소 대표점 원장 ${officialAddressPointItems.length}건이 235건이 아닙니다.`,
    );
  }

  const officialAddressPointIds = new Set();
  const officialAddressPointCoordinates = new Set();
  const officialAddressPointMatchMethods = new Map();
  let itemCoverageGainCount = 0;
  let itemRepairCount = 0;
  for (const item of officialAddressPointItems) {
    const id = String(item.id || '');
    if (!id || officialAddressPointIds.has(id)) {
      throw new Error(`공중화장실: 공식 주소 대표점 ID가 비었거나 중복됐습니다: ${id || '빈 ID'}`);
    }
    officialAddressPointIds.add(id);
    if (item.coordinateKind !== 'address_point' || item.coordinateApproximate !== true) {
      throw new Error(`공중화장실: 공식 주소 대표점 정밀도 계약이 잘못됐습니다: ${id}`);
    }
    if (!ALLOWED_ADDRESS_POINT_MATCH_METHODS.has(item.matchMethod)) {
      throw new Error(`공중화장실: 공식 주소 대표점 매칭 방식이 허용 범위 밖입니다: ${id}`);
    }
    officialAddressPointMatchMethods.set(
      item.matchMethod,
      (officialAddressPointMatchMethods.get(item.matchMethod) || 0) + 1,
    );
    const latitude = Number(item.lat);
    const longitude = Number(item.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`공중화장실: 공식 주소 대표점 좌표가 숫자가 아닙니다: ${id}`);
    }
    officialAddressPointCoordinates.add(`${latitude.toFixed(7)},${longitude.toFixed(7)}`);
    if (item.coverageGain === true) itemCoverageGainCount += 1;
    if (item.legacyCoordinateRepair === true) itemRepairCount += 1;
    if (item.coverageGain !== !item.legacyCoordinateRepair) {
      throw new Error(`공중화장실: 공식 주소 대표점 신규·교정 구분이 모순됩니다: ${id}`);
    }
  }
  if (
    itemCoverageGainCount !== RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount
    || itemRepairCount !== RESTROOM_ADDRESS_POINT_REGRESSION.repairCount
  ) {
    throw new Error(
      `공중화장실: 공식 주소 대표점 항목별 신규 ${itemCoverageGainCount}건/교정 ${itemRepairCount}건이 `
      + '222/13 기준과 다릅니다.',
    );
  }
  if (officialAddressPointCoordinates.size !== RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount) {
    throw new Error(
      `공중화장실: 공식 주소 대표점 고유 좌표 ${officialAddressPointCoordinates.size}개가 206개가 아닙니다.`,
    );
  }
  const directAddressPointMatches = [
    'unique-exact-road-address+building-name-corroboration',
    'invalid-legacy-coordinate+unique-exact-road-address+building-name-corroboration',
  ].reduce((sum, method) => sum + (officialAddressPointMatchMethods.get(method) || 0), 0);
  if (
    directAddressPointMatches !== RESTROOM_ADDRESS_POINT_REGRESSION.directBuildingMatchCount
    || (officialAddressPointMatchMethods.get(
      'unique-exact-road-address+reviewed-building-name-variant',
    ) || 0) !== RESTROOM_ADDRESS_POINT_REGRESSION.reviewedNewMatchCount
    || (officialAddressPointMatchMethods.get(
      'invalid-legacy-coordinate+unique-exact-road-address+reviewed-building-alias',
    ) || 0) !== RESTROOM_ADDRESS_POINT_REGRESSION.reviewedAliasRepairCount
  ) {
    throw new Error('공중화장실: 주소 대표점 매칭 근거가 직접 227/검토 신규 5/검토 교정 3과 다릅니다.');
  }

  const restroomAddressPointIndex = JSON.parse(restroomAddressPointIndexText);
  const addressPointDistrictTotal = Object.values(restroomAddressPointIndex.districts ?? {})
    .reduce((sum, count) => sum + numberField(count, '부산 화장실 주소 대표점 구별 합계'), 0);
  if (
    numberField(restroomAddressPointIndex.total, '부산 화장실 주소 대표점 인덱스 합계')
      !== officialAddressPointItems.length
    || addressPointDistrictTotal !== officialAddressPointItems.length
  ) {
    throw new Error('공중화장실: 부산 주소 대표점 인덱스·구별 합계가 공식 원장과 다릅니다.');
  }
  if (
    numberField(restrooms.officialAddressPointCount, '화장실 공식 주소 대표점 manifest 합계')
      !== officialAddressPointItems.length
    || numberField(
      restrooms.officialAddressPointRepairCount,
      '화장실 공식 주소 대표점 manifest 교정 합계',
    ) !== RESTROOM_ADDRESS_POINT_REGRESSION.repairCount
  ) {
    throw new Error('공중화장실: 공식 주소 대표점 manifest 합계가 원장과 다릅니다.');
  }
  const addressPointOverlay = (restrooms.addressPointOverlays ?? [])
    .find(overlay => String(overlay.id) === String(restroomAddressPoints.source?.id || ''));
  if (!addressPointOverlay) {
    throw new Error('공중화장실: 공식 주소 대표점 출처가 manifest에 없습니다.');
  }
  for (const [field, expected] of Object.entries({
    matchedCount: RESTROOM_ADDRESS_POINT_REGRESSION.total,
    coverageGainCount: RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount,
    repairCount: RESTROOM_ADDRESS_POINT_REGRESSION.repairCount,
    uniquePointCount: RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount,
  })) {
    if (numberField(addressPointOverlay[field], `화장실 주소 대표점 overlay ${field}`) !== expected) {
      throw new Error(`공중화장실: 주소 대표점 overlay ${field}가 ${expected}와 다릅니다.`);
    }
  }

  const restroomHostAddressPoints = JSON.parse(restroomHostAddressPointText);
  const officialHostAddressPointItems = Array.isArray(restroomHostAddressPoints.items)
    ? restroomHostAddressPoints.items
    : [];
  for (const [field, expected] of Object.entries(RESTROOM_HOST_ADDRESS_POINT_REGRESSION)) {
    if (numberField(
      restroomHostAddressPoints[field],
      `화장실 공식 호스트 주소 대표점 ${field}`,
    ) !== expected) {
      throw new Error(
        `공중화장실: 공식 호스트 주소 대표점 ${field}가 검토 기준 ${expected}와 다릅니다.`,
      );
    }
  }
  if (officialHostAddressPointItems.length !== RESTROOM_HOST_ADDRESS_POINT_REGRESSION.total) {
    throw new Error('공중화장실: 공식 호스트 주소 대표점 원장이 87건이 아닙니다.');
  }
  assertHostAddressPointDrift(restroomHostAddressPoints);
  if (
    officialHostAddressPointItems.some(item => officialAddressPointIds.has(String(item.id)))
  ) {
    throw new Error('공중화장실: 부산 주소 대표점과 호스트 주소 대표점 ID가 겹칩니다.');
  }
  if (
    numberField(restrooms.hostAddressPointCount, '화장실 호스트 주소 대표점 manifest 합계')
      !== RESTROOM_HOST_ADDRESS_POINT_REGRESSION.total
    || numberField(
      restrooms.hostAddressPointCoverageGainCount,
      '화장실 호스트 주소 대표점 manifest 신규 합계',
    ) !== RESTROOM_HOST_ADDRESS_POINT_REGRESSION.coverageGainCount
    || numberField(
      restrooms.hostAddressUniquePointCount,
      '화장실 호스트 주소 대표점 manifest 고유 좌표 합계',
    ) !== RESTROOM_HOST_ADDRESS_POINT_REGRESSION.uniquePointCount
    || numberField(
      restrooms.nationalStandardHostAddressPointCount,
      '전국 표준 호스트 주소 대표점 manifest 합계',
    ) !== 82
    || numberField(
      restrooms.municipalHostAddressPointCount,
      '용산 지자체 호스트 주소 대표점 manifest 합계',
    ) !== 5
    || restrooms.hostAddressPointReviewFingerprint
      !== REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT
    || JSON.stringify(restrooms.hostAddressPointGroups)
      !== JSON.stringify(restroomHostAddressPoints.groups)
  ) {
    throw new Error('공중화장실: 공식 호스트 주소 대표점 manifest 그룹·지문 합계가 다릅니다.');
  }
  const hostOverlays = new Map(
    (restrooms.addressPointOverlays ?? []).map(overlay => [String(overlay.id), overlay]),
  );
  let hostOverlayGainTotal = 0;
  for (const source of restroomHostAddressPoints.sources ?? []) {
    const overlay = hostOverlays.get(String(source.id));
    const scopedRowAccounting = Number(source.validCoordinateCount || 0)
      + Number(source.staleOrMissingDateCount || 0)
      + Number(source.invalidCoordinateCount || 0)
      + Number(source.missingIdentityCount || 0)
      + Number(source.outOfDistrictCount || 0)
      + Number(source.ineligibleHostCount || 0);
    const matchAccounting = Number(source.unmatchedCount || 0)
      + Number(source.ambiguousAddressCount || 0)
      + Number(source.nameMismatchCount || 0)
      + Number(source.proposalCount || 0);
    if (
      !overlay
      || scopedRowAccounting !== Number(source.scopedRowCount)
      || Number(source.validCoordinateCount) - Number(source.duplicateRecordKeyCount)
        !== Number(source.matchableRecordCount)
      || matchAccounting !== Number(source.matchableRecordCount)
      || overlay.sourceGroupId !== source.sourceGroupId
      || numberField(overlay.sourceTotal, `${source.id} 원본 합계`) !== Number(source.rawCount)
      || numberField(overlay.validCoordinateCount, `${source.id} 유효 좌표 합계`)
        !== Number(source.validCoordinateCount)
      || numberField(overlay.matchableRecordCount, `${source.id} 매칭 레코드 합계`)
        !== Number(source.matchableRecordCount)
      || JSON.stringify(Object.entries(overlay.validScopedRowsByCity ?? {}).sort())
        !== JSON.stringify(Object.entries(source.validScopedRowsByCity ?? {}).sort())
      || JSON.stringify(Object.entries(overlay.minimumValidScopedRowsByCity ?? {}).sort())
        !== JSON.stringify(Object.entries(source.minimumValidScopedRowsByCity ?? {}).sort())
      || overlay.minimumLatestSourceDate !== source.minimumLatestSourceDate
      || numberField(overlay.duplicateRecordKeyCount, `${source.id} 중복 레코드 합계`)
        !== Number(source.duplicateRecordKeyCount)
      || numberField(overlay.externalRecordIdCollisionCount, `${source.id} 원본 ID 충돌 합계`)
        !== Number(source.externalRecordIdCollisionCount)
      || numberField(overlay.ineligibleHostCount, `${source.id} 부적격 호스트 합계`)
        !== Number(source.ineligibleHostCount)
      || numberField(overlay.matchedCount, `${source.id} 제안 합계`)
        !== Number(source.proposalCount)
      || numberField(overlay.coverageGainCount, `${source.id} 채택 합계`)
        !== Number(source.acceptedTargetCount)
    ) {
      throw new Error(`공중화장실: 호스트 주소 대표점 ${source.id} manifest 집계가 다릅니다.`);
    }
    hostOverlayGainTotal += Number(overlay.coverageGainCount);
  }
  if (hostOverlayGainTotal !== RESTROOM_HOST_ADDRESS_POINT_REGRESSION.coverageGainCount) {
    throw new Error('공중화장실: 호스트 주소 대표점 원천별 신규 합계가 87건이 아닙니다.');
  }
  console.log(
    `${restroomMissingCoordinates > 0 ? 'WARN' : 'PASS'} static-completeness restrooms `
    + `mapped=${restroomTotal} supported=${restroomSupportedTotal} missingCoordinates=${restroomMissingCoordinates} `
    + `coverage=${coordinateCoverage.toFixed(1)}% officialRegional=${regionalCoordinateTotal} `
    + `officialAddressPoints=${officialAddressPointItems.length} `
    + `hostAddressPoints=${officialHostAddressPointItems.length}`,
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
  if (tsunami.contentHashAlgorithm !== TSUNAMI_CONTENT_HASH_ALGORITHM) {
    throw new Error(
      `지진해일: contentHashAlgorithm이 ${TSUNAMI_CONTENT_HASH_ALGORITHM}이 아닙니다.`,
    );
  }
  const tsunamiContentSha256 = fingerprintTsunamiShelters(tsunamiItems);
  if (tsunami.contentSha256 !== tsunamiContentSha256) {
    throw new Error(
      `지진해일: 파일 지문 ${tsunamiContentSha256}과 manifest 지문 `
      + `${tsunami.contentSha256 || '없음'}이 다릅니다.`,
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
  const firewaterRegionalRegistry = JSON.parse(firewaterRegionalSourceText);
  const expectedCorroborations = new Map(
    (firewaterRegionalRegistry.sources ?? [])
      .filter(source => source.enabled && source.strategy === 'partial-corroboration')
      .map(source => [source.id, source]),
  );
  const actualCorroborations = (firewater.regionalOverlays ?? [])
    .filter(overlay => overlay.overlayKind === 'partial-corroboration');
  if (actualCorroborations.length !== expectedCorroborations.size) {
    throw new Error(
      `소방용수: 부분 교차검증 manifest ${actualCorroborations.length}개와 `
      + `registry ${expectedCorroborations.size}개가 다릅니다.`,
    );
  }
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
    if (overlay.overlayKind === 'partial-corroboration') {
      const expected = expectedCorroborations.get(overlay.id);
      if (!expected) {
        throw new Error(`소방용수 ${overlay.id}: registry에 없는 부분 교차검증 overlay입니다.`);
      }
      for (const [manifestField, registryField] of Object.entries({
        sourceDate: 'expectedSourceDate',
        sourceTotal: 'expectedSourceRows',
        targetTotal: 'expectedTargetRows',
        matchedCount: 'expectedMatchedCount',
        unmatchedCount: 'expectedUnmatchedCount',
        ambiguousMatchCount: 'expectedAmbiguousRows',
        matchFingerprint: 'expectedMatchFingerprint',
        targetBodyFingerprint: 'expectedTargetBodyFingerprint',
      })) {
        if (overlay[manifestField] !== expected[registryField]) {
          throw new Error(
            `소방용수 ${overlay.id}: manifest ${manifestField}가 registry ${registryField}와 다릅니다.`,
          );
        }
      }
      if (
        !Array.isArray(overlayItems)
        || overlayItems.length !== numberField(overlay.targetTotal, '부분 교차검증 대상 합계')
      ) {
        throw new Error(
          `소방용수 ${overlay.city} ${overlay.district}: 기존 지도점 합계가 부분 교차검증 manifest와 다릅니다.`,
        );
      }
      const sourceTotal = numberField(overlay.sourceTotal, '부분 교차검증 원본 합계');
      const matchedCount = numberField(overlay.matchedCount, '부분 교차검증 일대일 합계');
      const unmatchedCount = numberField(overlay.unmatchedCount, '부분 교차검증 미일치 합계');
      const ambiguousCount = numberField(
        overlay.ambiguousMatchCount,
        '부분 교차검증 중복/다의 합계',
      );
      if (matchedCount + unmatchedCount + ambiguousCount !== sourceTotal) {
        throw new Error(
          `소방용수 ${overlay.city} ${overlay.district}: 부분 교차검증 집계가 원본 합계와 다릅니다.`,
        );
      }
      const fingerprint = fingerprintCorroborationItems(overlayItems, overlay.id);
      const targetFingerprint = fingerprintFirewaterTargetBody(overlayItems);
      const corroborationRecords = overlayItems.flatMap(item =>
        (item.regionalCorroborations ?? [])
          .filter(record => record.sourceId === overlay.id)
      );
      if (
        fingerprint.matchedCount !== matchedCount
        || fingerprint.matchFingerprint !== overlay.matchFingerprint
        || fingerprint.matchFingerprintAlgorithm !== overlay.matchFingerprintAlgorithm
        || targetFingerprint.targetBodyFingerprint !== overlay.targetBodyFingerprint
        || targetFingerprint.targetBodyFingerprintAlgorithm
          !== overlay.targetBodyFingerprintAlgorithm
        || overlay.coordinatesPreserved !== true
        || overlay.replacementScope !== 'none'
        || corroborationRecords.some(record =>
          record.sourceName !== expected.sourceName
          || record.sourceUrl !== expected.sourceUrl
          || record.publicDataPk !== expected.publicDataPk
          || record.sourceDate !== expected.expectedSourceDate
          || record.sourceLicense !== expected.license
          || record.matchMethod !== overlay.matchMethod
        )
      ) {
        throw new Error(
          `소방용수 ${overlay.city} ${overlay.district}: 부분 교차검증 provenance 지문이 다릅니다.`,
        );
      }
      console.log(
        `WARN static-completeness firewater-corroboration ${overlay.city}/${overlay.district} `
        + `sourceRows=${sourceTotal} targets=${overlayItems.length} matched=${matchedCount} `
        + `unmatched=${unmatchedCount} ambiguous=${ambiguousCount} coordinates=preserved`,
      );
      continue;
    }
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

await auditStaticCompleteness();
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
console.log('Official data freshness audit completed.');
