import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertHostAddressPointDrift,
  REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT,
} from './restroom-host-address-points.mjs';
import {
  fingerprintCorroborationItems,
  fingerprintFirewaterTargetBody,
} from './sync-firewater-regional-overlays.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const RESTROOM_DIR = path.join(DATA_DIR, 'restrooms');
const RESTROOM_ADDRESS_POINT_DIR = path.join(DATA_DIR, 'restroom-address-points');
const FIREWATER_DIR = path.join(ROOT, 'public', 'firewater');
const OFFICIAL_ADDRESS_POINT_PATH = path.join(
  DATA_DIR,
  'restroom-official-address-points.json',
);
const OFFICIAL_HOST_ADDRESS_POINT_PATH = path.join(
  DATA_DIR,
  'restroom-official-host-address-points.json',
);

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
const HOST_ADDRESS_POINT_BOUNDS = Object.freeze({
  seoul: { latitude: [37.4, 37.75], longitude: [126.7, 127.25] },
  daegu: { latitude: [35.55, 36.35], longitude: [128.3, 129.05] },
  sejong: { latitude: [36.3, 36.8], longitude: [127.05, 127.55] },
  ulsan: { latitude: [35.25, 35.8], longitude: [128.9, 129.55] },
});
const GWANGJU_BUKGU_FIREWATER_CORROBORATION = Object.freeze({
  id: 'gwangju-bukgu-firewater-corroboration',
  sourceDate: '2025-08-22',
  sourceTotal: 1031,
  targetTotal: 1088,
  matchedCount: 698,
  unmatchedCount: 246,
  ambiguousMatchCount: 87,
  matchFingerprint: '1bb2e6dd3b0daf1ff748db41bf04896116608e284f1cdd4ef47c68dd1737dc5a',
  targetBodyFingerprint: 'edf3b028dd06c5b974fac9404c01e90e5660e3025cc11faa950b30fe672f8339',
});
const ALLOWED_ADDRESS_POINT_MATCH_METHODS = new Set([
  'unique-exact-road-address+building-name-corroboration',
  'unique-exact-road-address+reviewed-building-name-variant',
  'invalid-legacy-coordinate+unique-exact-road-address+building-name-corroboration',
  'invalid-legacy-coordinate+unique-exact-road-address+reviewed-building-alias',
  'unique-exact-road-or-lot-address+host-name-containment+coordinate-consistent-proposals',
]);
const ALLOWED_REGIONAL_COORDINATE_MATCH_METHODS = new Set([
  'normalized-name+exact-road-or-lot-address',
  'unique-exact-address+normalized-name-containment',
]);

const GWANGJU_NAMES = new Set(['광주광역시', '전남광주통합특별시']);
const GWANGJU_DISTRICTS = new Set(['동구', '서구', '남구', '북구', '광산구']);
const INCHEON_ALLOWED_DISTRICTS = new Set([
  '강화군',
  '계양구',
  '검단구',
  '남동구',
  '미추홀구',
  '부평구',
  '서해구',
  '연수구',
  '영종구',
  '옹진군',
  '제물포구',
  '중구',
  '동구',
  '서구',
  '기타',
]);
const INCHEON_REQUIRED_CURRENT_DISTRICTS = ['검단구', '서해구', '영종구', '제물포구'];
const RESTROOM_CITY_MINIMUMS = Object.freeze({
  seoul: 2_200,
  busan: 1_600,
  daegu: 900,
  incheon: 1_700,
  gwangju: 900,
  daejeon: 400,
  ulsan: 300,
  sejong: 70,
  jeju: 500,
});

const failures = [];

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function tokens(address) {
  return String(address || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
}

function isFormerGwangjuAddress(address) {
  const [province, district] = tokens(address);
  return GWANGJU_NAMES.has(province) && GWANGJU_DISTRICTS.has(district);
}

function auditCivilGwangju() {
  const records = readJson(path.join(DATA_DIR, 'civil', 'gwangju.json'));
  check(Array.isArray(records) && records.length > 0, '광주 민방위 대피시설 데이터가 비어 있습니다.');

  const districtCounts = new Map();
  for (const record of records) {
    const addresses = [record.LCTN_WHOL_ADDR, record.ROAD_NM_WHOL_ADDR].filter(Boolean);
    check(
      addresses.some(isFormerGwangjuAddress),
      `광주 민방위 대피시설에 종전 광주 5개 구 밖 주소가 있습니다: ${record.MNG_NO || record.FCLT_NM}`,
    );
    const district = tokens(addresses[0])[1];
    if (GWANGJU_DISTRICTS.has(district)) {
      districtCounts.set(district, (districtCounts.get(district) || 0) + 1);
    }
  }

  for (const district of GWANGJU_DISTRICTS) {
    check(districtCounts.has(district), `광주 민방위 대피시설에서 ${district}가 누락됐습니다.`);
  }
  return { total: records.length, districts: Object.fromEntries(districtCounts) };
}

function auditRestrooms() {
  const citySummaries = {};
  for (const cityEntry of fs.readdirSync(RESTROOM_DIR, { withFileTypes: true })) {
    if (!cityEntry.isDirectory()) continue;
    const city = cityEntry.name;
    const cityDir = path.join(RESTROOM_DIR, city);
    const index = readJson(path.join(cityDir, 'index.json'));
    const districtEntries = Object.entries(index.districts || {});
    const districtTotal = districtEntries.reduce((sum, [, count]) => sum + Number(count), 0);
    check(districtTotal === Number(index.total), `${city} 화장실 인덱스 합계가 total과 다릅니다.`);

    const seenIds = new Set();
    for (const [district, expectedCount] of districtEntries) {
      const isAdministrativeName = district === '기타'
        || (district.length <= 12 && /(?:구|군|시)$/.test(district));
      check(isAdministrativeName, `${city} 화장실에 도로명으로 보이는 잘못된 구 분류가 있습니다: ${district}`);

      const districtFile = path.join(cityDir, `${district}.json`);
      check(fs.existsSync(districtFile), `${city}/${district} 화장실 조각 파일이 없습니다.`);
      if (!fs.existsSync(districtFile)) continue;
      const payload = readJson(districtFile);
      const items = Array.isArray(payload.items) ? payload.items : [];
      check(items.length === Number(expectedCount), `${city}/${district} 화장실 개수가 인덱스와 다릅니다.`);

      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        check(Number.isFinite(lat) && Number.isFinite(lng) && lat && lng, `${city}/${district}에 좌표 없는 화장실이 있습니다: ${item.id}`);
        check(!seenIds.has(String(item.id)), `${city} 화장실 ID가 중복됐습니다: ${item.id}`);
        seenIds.add(String(item.id));

        if (city === 'gwangju') {
          check(GWANGJU_DISTRICTS.has(district), `광주 화장실에 종전 5개 구 밖 분류가 있습니다: ${district}`);
          check(isFormerGwangjuAddress(item.addr), `광주 화장실에 종전 5개 구 밖 주소가 있습니다: ${item.addr}`);
        }
      }
    }

    if (city === 'gwangju') {
      for (const district of GWANGJU_DISTRICTS) {
        check(district in (index.districts || {}), `광주 화장실에서 ${district}가 누락됐습니다.`);
      }
      check(Number(index.total) >= 1_200, `광주 화장실 건수가 비정상적으로 적습니다: ${index.total}`);
    }

    if (city === 'incheon') {
      for (const district of Object.keys(index.districts || {})) {
        check(INCHEON_ALLOWED_DISTRICTS.has(district), `인천 화장실에 잘못된 구 분류가 있습니다: ${district}`);
      }
      for (const district of INCHEON_REQUIRED_CURRENT_DISTRICTS) {
        check(district in (index.districts || {}), `인천 화장실에서 2026 신설 ${district}가 누락됐습니다.`);
      }
    }

    const expectedFiles = new Set([
      'index.json',
      ...districtEntries.map(([district]) => `${district}.json`),
    ]);
    const orphanFiles = fs.readdirSync(cityDir)
      .filter(filename => filename.endsWith('.json') && !expectedFiles.has(filename));
    check(orphanFiles.length === 0, `${city} 화장실에 인덱스 밖 조각 파일이 있습니다: ${orphanFiles.join(', ')}`);

    citySummaries[city] = {
      total: Number(index.total),
      districts: index.districts,
    };
  }
  const actualCities = Object.keys(citySummaries).sort();
  const expectedCities = Object.keys(RESTROOM_CITY_MINIMUMS).sort();
  check(
    JSON.stringify(actualCities) === JSON.stringify(expectedCities),
    `화장실 도시 디렉터리가 지원 9개 도시와 다릅니다: ${actualCities.join(', ')}`,
  );
  for (const [city, minimum] of Object.entries(RESTROOM_CITY_MINIMUMS)) {
    check(
      Number(citySummaries[city]?.total || 0) >= minimum,
      `${city} 화장실 기본 좌표가 안전 최소치 ${minimum.toLocaleString()}건 아래로 급감했습니다.`,
    );
  }
  return citySummaries;
}

function coordinateKey(item) {
  return `${Number(item.lat).toFixed(7)},${Number(item.lng).toFixed(7)}`;
}

function auditRestroomAddressPointFragments(ledgerById) {
  check(
    fs.existsSync(RESTROOM_ADDRESS_POINT_DIR),
    '화장실 공식 주소 대표점 조각 디렉터리가 없습니다.',
  );
  if (!fs.existsSync(RESTROOM_ADDRESS_POINT_DIR)) return new Map();

  const cityEntries = fs.readdirSync(RESTROOM_ADDRESS_POINT_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory());
  const actualCities = cityEntries.map(entry => entry.name).sort();
  const expectedCities = ['busan', 'daegu', 'sejong', 'seoul', 'ulsan'];
  check(
    JSON.stringify(actualCities) === JSON.stringify(expectedCities),
    `화장실 공식 주소 대표점 도시 범위가 예상과 다릅니다: ${actualCities.join(', ')}`,
  );

  const fragmentById = new Map();
  for (const cityEntry of cityEntries) {
    const city = cityEntry.name;
    const cityDir = path.join(RESTROOM_ADDRESS_POINT_DIR, city);
    const indexPath = path.join(cityDir, 'index.json');
    check(fs.existsSync(indexPath), `${city} 화장실 주소 대표점 인덱스가 없습니다.`);
    if (!fs.existsSync(indexPath)) continue;

    const index = readJson(indexPath);
    let cityFragmentCount = 0;
    const districtEntries = Object.entries(index.districts || {});
    const districtTotal = districtEntries.reduce((sum, [, count]) => sum + Number(count), 0);
    check(
      districtTotal === Number(index.total),
      `${city} 화장실 주소 대표점 인덱스 합계가 total과 다릅니다.`,
    );
    check(
      index.metadata?.coordinateKind === 'address_point'
        && index.metadata?.coordinateApproximate === true,
      `${city} 화장실 주소 대표점 인덱스의 정밀도 계약이 잘못됐습니다.`,
    );
    check(
      Number(index.metadata?.coverageGainCount)
        + Number(index.metadata?.repairCount)
        === Number(index.total)
        && Number(index.metadata?.uniquePointCount) <= Number(index.total),
      `${city} 화장실 주소 대표점 인덱스의 신규·교정·고유점 집계가 다릅니다.`,
    );

    for (const [district, expectedCount] of districtEntries) {
      const fragmentPath = path.join(cityDir, `${district}.json`);
      check(fs.existsSync(fragmentPath), `${city}/${district} 화장실 주소 대표점 조각이 없습니다.`);
      if (!fs.existsSync(fragmentPath)) continue;
      const payload = readJson(fragmentPath);
      const items = Array.isArray(payload.items) ? payload.items : [];
      check(
        items.length === Number(expectedCount),
        `${city}/${district} 화장실 주소 대표점 조각 수가 인덱스와 다릅니다.`,
      );

      for (const item of items) {
        const id = String(item.id || '');
        check(Boolean(id), `${city}/${district} 화장실 주소 대표점에 빈 ID가 있습니다.`);
        check(!fragmentById.has(id), `화장실 주소 대표점 조각 ID가 중복됐습니다: ${id}`);
        check(
          item.coordinateKind === 'address_point',
          `화장실 주소 대표점 조각의 coordinateKind가 address_point가 아닙니다: ${id}`,
        );
        check(
          item.coordinateApproximate === true,
          `화장실 주소 대표점 조각의 근사 좌표 표시가 없습니다: ${id}`,
        );
        check(
          item.coordinatePrecision === 'building-address-point'
            || item.coordinatePrecision === 'host-facility-representative-point',
          `화장실 주소 대표점 조각의 정밀도 분류가 잘못됐습니다: ${id}`,
        );
        check(
          ALLOWED_ADDRESS_POINT_MATCH_METHODS.has(item.matchMethod),
          `화장실 주소 대표점 조각의 매칭 방식이 허용 범위 밖입니다: ${id}`,
        );
        const ledger = ledgerById.get(id);
        check(Boolean(ledger), `화장실 주소 대표점 조각 ID가 공식 원장에 없습니다: ${id}`);
        check(
          Number(item.lat) === Number(ledger?.lat)
            && Number(item.lng) === Number(ledger?.lng),
          `화장실 주소 대표점 조각 좌표가 공식 원장과 다릅니다: ${id}`,
        );
        check(
          String(item.coordinateSourceId || item.sourceId || '') === String(ledger?.sourceId || ''),
          `화장실 주소 대표점 조각 출처가 공식 원장과 다릅니다: ${id}`,
        );
        check(
          item.coverageGain === ledger?.coverageGain
            && item.legacyCoordinateRepair === ledger?.legacyCoordinateRepair
            && item.matchMethod === ledger?.matchMethod,
          `화장실 주소 대표점 조각의 신규·교정 provenance가 원장과 다릅니다: ${id}`,
        );
        if (ledger?.precision === 'host-facility-representative-point') {
          check(
            item.sourceGroupId === ledger.sourceGroupId
              && item.sourceRecordKey === ledger.sourceRecordKey
              && item.recordFingerprint === ledger.recordFingerprint
              && item.matchedAddressKey === ledger.matchedAddressKey
              && item.addressMatchMode === ledger.addressMatchMode
              && item.matchMode === ledger.matchMode
              && JSON.stringify(item.corroboratingSourceIds)
                === JSON.stringify(ledger.corroboratingSourceIds)
              && JSON.stringify(item.corroboratingRecords)
                === JSON.stringify(ledger.corroboratingRecords),
            `화장실 호스트 주소 대표점 조각의 원천 레코드 provenance가 다릅니다: ${id}`,
          );
        }
        fragmentById.set(id, item);
        cityFragmentCount += 1;
      }
    }

    const expectedFiles = new Set([
      'index.json',
      ...districtEntries.map(([district]) => `${district}.json`),
    ]);
    const orphanFiles = fs.readdirSync(cityDir)
      .filter(filename => filename.endsWith('.json') && !expectedFiles.has(filename));
    check(
      orphanFiles.length === 0,
      `${city} 화장실 주소 대표점에 인덱스 밖 조각이 있습니다: ${orphanFiles.join(', ')}`,
    );
    check(
      cityFragmentCount === Number(index.total),
      `${city} 화장실 주소 대표점 조각 합계가 인덱스와 다릅니다.`,
    );
  }

  return fragmentById;
}

function auditCoordinateMetadata() {
  const cachePath = path.join(DATA_DIR, 'restroom-geocoded-coordinates.json');
  const researchedPath = path.join(DATA_DIR, 'restroom-researched-coordinates.json');
  const officialRegionalPath = path.join(DATA_DIR, 'restroom-official-regional-coordinates.json');
  const manifest = readJson(path.join(DATA_DIR, 'manifest.json'));
  const cache = readJson(cachePath);
  const researched = readJson(researchedPath);
  const officialRegional = readJson(officialRegionalPath);
  const officialAddressPoints = readJson(OFFICIAL_ADDRESS_POINT_PATH);
  const officialHostAddressPoints = readJson(OFFICIAL_HOST_ADDRESS_POINT_PATH);
  const cacheItems = Array.isArray(cache.items) ? cache.items : [];
  const researchedItems = Array.isArray(researched.items) ? researched.items : [];
  const officialRegionalItems = Array.isArray(officialRegional.items) ? officialRegional.items : [];
  const officialAddressPointItems = Array.isArray(officialAddressPoints.items)
    ? officialAddressPoints.items
    : [];
  const officialHostAddressPointItems = Array.isArray(officialHostAddressPoints.items)
    ? officialHostAddressPoints.items
    : [];
  const restroomManifest = manifest.datasets?.restrooms || {};
  check(cacheItems.length === Number(cache.total), '화장실 지오코딩 캐시 total이 실제 항목 수와 다릅니다.');
  check(researchedItems.length === Number(researched.total), '화장실 교차검증 좌표 total이 실제 항목 수와 다릅니다.');
  check(
    officialRegionalItems.length === Number(officialRegional.total),
    '화장실 공식 지역 좌표 total이 실제 항목 수와 다릅니다.',
  );
  check(
    Number(manifest.datasets?.restrooms?.geocodedCount) === cacheItems.length,
    '화장실 매니페스트의 지오코딩 건수가 캐시와 다릅니다.',
  );
  check(
    Number(manifest.datasets?.restrooms?.researchedCount) === researchedItems.length,
    '화장실 매니페스트의 교차검증 좌표 건수가 캐시와 다릅니다.',
  );
  check(
    Number(manifest.datasets?.restrooms?.regionalCoordinateCount) === officialRegionalItems.length,
    '화장실 매니페스트의 공식 지역 좌표 건수가 인덱스와 다릅니다.',
  );
  for (const [field, expected] of Object.entries(RESTROOM_ADDRESS_POINT_REGRESSION)) {
    if (!Object.hasOwn(officialAddressPoints, field)) continue;
    check(
      Number(officialAddressPoints[field]) === expected,
      `화장실 공식 주소 대표점 ${field}가 검토 기준 ${expected}와 다릅니다.`,
    );
  }
  check(
    officialAddressPointItems.length === RESTROOM_ADDRESS_POINT_REGRESSION.total
      && Number(officialAddressPoints.total) === officialAddressPointItems.length,
    '화장실 공식 주소 대표점 원장이 235건이 아닙니다.',
  );
  check(
    Number(officialAddressPoints.coverageGainCount)
      === RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount,
    '화장실 공식 주소 대표점 신규 보완 건수가 222건이 아닙니다.',
  );
  check(
    Number(officialAddressPoints.repairCount) === RESTROOM_ADDRESS_POINT_REGRESSION.repairCount,
    '화장실 공식 주소 대표점 오류 교정 건수가 13건이 아닙니다.',
  );
  check(
    Number(officialAddressPoints.coverageGainCount)
      + Number(officialAddressPoints.repairCount)
      === Number(officialAddressPoints.total),
    '화장실 공식 주소 대표점 신규·교정 합계가 원장 total과 다릅니다.',
  );
  for (const [field, expected] of Object.entries(RESTROOM_HOST_ADDRESS_POINT_REGRESSION)) {
    check(
      Number(officialHostAddressPoints[field]) === expected,
      `화장실 공식 호스트 주소 대표점 ${field}가 검토 기준 ${expected}와 다릅니다.`,
    );
  }
  check(
    officialHostAddressPointItems.length === RESTROOM_HOST_ADDRESS_POINT_REGRESSION.total,
    '화장실 공식 호스트 주소 대표점 원장이 87건이 아닙니다.',
  );
  assertHostAddressPointDrift(officialHostAddressPoints);

  const sourceGainTotal = (officialRegional.sources || [])
    .reduce((sum, source) => sum + Number(source.gainCount || 0), 0);
  const sourceUpgradeTotal = (officialRegional.sources || [])
    .reduce((sum, source) => sum + Number(source.precisionUpgradeCount || 0), 0);
  check(
    sourceGainTotal + sourceUpgradeTotal === officialRegionalItems.length,
    '화장실 공식 지역 좌표의 출처별 신규·정밀도 개선 합계가 전체와 다릅니다.',
  );
  check(
    Number(restroomManifest.regionalCoordinateCoverageGainCount) === sourceGainTotal
      && Number(restroomManifest.regionalCoordinateUpgradeCount) === sourceUpgradeTotal,
    '화장실 공식 지역 좌표의 신규·정밀도 개선 합계가 매니페스트와 다릅니다.',
  );
  const manifestOverlays = new Map(
    (manifest.datasets?.restrooms?.coordinateOverlays || [])
      .map(overlay => [String(overlay.id), overlay]),
  );
  for (const source of officialRegional.sources || []) {
    const overlay = manifestOverlays.get(String(source.id));
    const matchedTargetCount = Number(source.exactMatchedCount || 0)
      + Number(source.addressNameContainedMatchedCount || 0);
    const normalizedRowCount = Number(source.validCoordinateCount || 0)
      + Number(source.invalidCoordinateCount || 0)
      + Number(source.outOfScopeCount || 0)
      + Number(source.missingIdentityCount || 0);
    const accountedMatchRows = Number(source.unmatchedCount || 0)
      + Number(source.ambiguousNationalMatchCount || 0)
      + Number(source.ambiguousAddressMatchCount || 0)
      + Number(source.addressNameMismatchCount || 0)
      + Number(source.duplicateRegionalMatchCount || 0)
      + matchedTargetCount
      + Number(source.consistentDuplicateRegionalRowCount || 0);
    check(Boolean(overlay), `화장실 공식 지역 좌표 출처가 매니페스트에 없습니다: ${source.id}`);
    check(
      normalizedRowCount === Number(source.sourceTotal),
      `화장실 공식 지역 좌표 출처 ${source.id}의 정규화 행 회계가 원본 합계와 다릅니다.`,
    );
    check(
      accountedMatchRows === Number(source.validCoordinateCount),
      `화장실 공식 지역 좌표 출처 ${source.id}의 매칭 행 회계가 유효 좌표 합계와 다릅니다.`,
    );
    check(
      matchedTargetCount
        === Number(source.existingCoordinateCount || 0)
          + Number(source.gainCount || 0)
          + Number(source.precisionUpgradeCount || 0),
      `화장실 공식 지역 좌표 출처 ${source.id}의 매칭 결과 회계가 다릅니다.`,
    );
    check(
      Number(overlay?.coverageGainCount) === Number(source.gainCount),
      `화장실 공식 지역 좌표 출처 ${source.id}의 신규 합계가 매니페스트와 다릅니다.`,
    );
    check(
      Number(overlay?.precisionUpgradeCount || 0) === Number(source.precisionUpgradeCount || 0),
      `화장실 공식 지역 좌표 출처 ${source.id}의 정밀도 개선 합계가 매니페스트와 다릅니다.`,
    );
    check(
      Number(overlay?.matchedCount) === matchedTargetCount,
      `화장실 공식 지역 좌표 출처 ${source.id}의 매칭 합계가 매니페스트와 다릅니다.`,
    );
    check(
      Number(overlay?.ambiguousMatchCount)
        === Number(source.ambiguousNationalMatchCount || 0)
          + Number(source.ambiguousAddressMatchCount || 0)
          + Number(source.duplicateRegionalMatchCount || 0),
      `화장실 공식 지역 좌표 출처 ${source.id}의 모호성 합계가 매니페스트와 다릅니다.`,
    );
  }

  const baseRestroomById = new Map();
  for (const city of fs.readdirSync(RESTROOM_DIR, { withFileTypes: true })) {
    if (!city.isDirectory()) continue;
    const cityDir = path.join(RESTROOM_DIR, city.name);
    for (const filename of fs.readdirSync(cityDir)) {
      if (!filename.endsWith('.json') || filename === 'index.json') continue;
      const payload = readJson(path.join(cityDir, filename));
      for (const item of payload.items || []) {
        const id = String(item.id || '');
        check(!baseRestroomById.has(id), `화장실 기본 조각 ID가 도시 간 중복됐습니다: ${id}`);
        baseRestroomById.set(id, item);
      }
    }
  }
  const seenOfficialIds = new Set();
  for (const item of officialRegionalItems) {
    const id = String(item.id || '');
    check(Boolean(id), '화장실 공식 지역 좌표에 빈 중앙 관리번호가 있습니다.');
    check(!seenOfficialIds.has(id), `화장실 공식 지역 좌표 ID가 중복됐습니다: ${id}`);
    seenOfficialIds.add(id);
    check(Boolean(item.sourceId), `화장실 공식 지역 좌표에 출처 ID가 없습니다: ${id}`);
    check(
      ALLOWED_REGIONAL_COORDINATE_MATCH_METHODS.has(item.matchMethod),
      `화장실 공식 지역 좌표의 매칭 방식이 허용 범위 밖입니다: ${id}`,
    );
    const output = baseRestroomById.get(id);
    check(Boolean(output), `화장실 공식 지역 좌표가 최종 조각에 없습니다: ${id}`);
    check(
      Number(output?.lat) === Number(item.lat) && Number(output?.lng) === Number(item.lng),
      `화장실 공식 지역 좌표가 최종 조각 좌표와 다릅니다: ${id}`,
    );
  }

  const addressPointById = new Map();
  const addressPointCoordinateKeys = new Set();
  const addressPointMatchMethodCounts = new Map();
  let coverageGainCount = 0;
  let repairCount = 0;
  for (const item of officialAddressPointItems) {
    const id = String(item.id || '');
    check(Boolean(id), '화장실 공식 주소 대표점에 빈 중앙 관리번호가 있습니다.');
    check(!addressPointById.has(id), `화장실 공식 주소 대표점 ID가 중복됐습니다: ${id}`);
    addressPointById.set(id, item);
    addressPointCoordinateKeys.add(coordinateKey(item));

    check(
      item.coordinateKind === 'address_point',
      `화장실 공식 주소 대표점의 coordinateKind가 address_point가 아닙니다: ${id}`,
    );
    check(
      item.coordinateApproximate === true,
      `화장실 공식 주소 대표점의 근사 좌표 표시가 없습니다: ${id}`,
    );
    check(
      item.precision === 'building-address-point',
      `화장실 공식 주소 대표점 정밀도 분류가 잘못됐습니다: ${id}`,
    );
    check(
      ALLOWED_ADDRESS_POINT_MATCH_METHODS.has(item.matchMethod),
      `화장실 공식 주소 대표점 매칭 방식이 허용 범위 밖입니다: ${id}`,
    );
    addressPointMatchMethodCounts.set(
      item.matchMethod,
      (addressPointMatchMethodCounts.get(item.matchMethod) || 0) + 1,
    );
    check(Boolean(item.sourceId), `화장실 공식 주소 대표점에 출처 ID가 없습니다: ${id}`);
    check(
      String(item.sourceId) === String(officialAddressPoints.source?.id || ''),
      `화장실 공식 주소 대표점 출처 ID가 원장 메타데이터와 다릅니다: ${id}`,
    );
    check(
      Number.isFinite(Number(item.lat))
        && Number.isFinite(Number(item.lng))
        && Number(item.lat) >= 34.98
        && Number(item.lat) <= 35.4
        && Number(item.lng) >= 128.79
        && Number(item.lng) <= 129.3,
      `화장실 공식 주소 대표점 좌표가 부산 범위 밖입니다: ${id}`,
    );
    check(
      !baseRestroomById.has(id),
      `화장실 기본 조각과 공식 주소 대표점 ID가 겹칩니다: ${id}`,
    );

    if (item.coverageGain === true) coverageGainCount += 1;
    if (item.legacyCoordinateRepair === true) repairCount += 1;
    check(
      item.coverageGain === !item.legacyCoordinateRepair,
      `화장실 공식 주소 대표점의 신규·교정 구분이 모순됩니다: ${id}`,
    );
    if (item.legacyCoordinateRepair === true) {
      check(
        Boolean(item.replacedSourceId)
          && Number.isFinite(Number(item.replacedLat))
          && Number.isFinite(Number(item.replacedLng)),
        `화장실 공식 주소 대표점 오류 교정 이력이 불완전합니다: ${id}`,
      );
    }
  }
  check(
    addressPointCoordinateKeys.size === RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount
      && Number(officialAddressPoints.uniquePointCount) === addressPointCoordinateKeys.size,
    '화장실 공식 주소 대표점 고유 좌표가 206개가 아닙니다.',
  );
  check(
    coverageGainCount === RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount,
    '화장실 공식 주소 대표점 항목별 신규 합계가 222건이 아닙니다.',
  );
  check(
    repairCount === RESTROOM_ADDRESS_POINT_REGRESSION.repairCount,
    '화장실 공식 주소 대표점 항목별 오류 교정 합계가 13건이 아닙니다.',
  );
  const directBuildingMatchCount = [
    'unique-exact-road-address+building-name-corroboration',
    'invalid-legacy-coordinate+unique-exact-road-address+building-name-corroboration',
  ].reduce((sum, method) => sum + (addressPointMatchMethodCounts.get(method) || 0), 0);
  check(
    directBuildingMatchCount === RESTROOM_ADDRESS_POINT_REGRESSION.directBuildingMatchCount
      && (addressPointMatchMethodCounts.get(
        'unique-exact-road-address+reviewed-building-name-variant',
      ) || 0) === RESTROOM_ADDRESS_POINT_REGRESSION.reviewedNewMatchCount
      && (addressPointMatchMethodCounts.get(
        'invalid-legacy-coordinate+unique-exact-road-address+reviewed-building-alias',
      ) || 0) === RESTROOM_ADDRESS_POINT_REGRESSION.reviewedAliasRepairCount,
    '화장실 공식 주소 대표점 매칭 근거가 직접 227/검토 신규 5/검토 교정 3과 다릅니다.',
  );

  const hostSourceIds = new Set(
    (officialHostAddressPoints.sources || []).map(source => String(source.id)),
  );
  const hostCoordinateKeys = new Set();
  const hostCityCounts = {};
  for (const item of officialHostAddressPointItems) {
    const id = String(item.id || '');
    check(Boolean(id), '화장실 공식 호스트 주소 대표점에 빈 중앙 관리번호가 있습니다.');
    check(!addressPointById.has(id), `화장실 주소 대표점 원장 ID가 중복됐습니다: ${id}`);
    addressPointById.set(id, item);
    hostCoordinateKeys.add(coordinateKey(item));
    hostCityCounts[item.cityKey] = (hostCityCounts[item.cityKey] || 0) + 1;
    const bounds = HOST_ADDRESS_POINT_BOUNDS[item.cityKey];

    check(
      item.coordinateKind === 'address_point' && item.coordinateApproximate === true,
      `화장실 공식 호스트 주소 대표점의 근사 주소점 분류가 잘못됐습니다: ${id}`,
    );
    check(
      item.precision === 'host-facility-representative-point',
      `화장실 공식 호스트 주소 대표점 정밀도 분류가 잘못됐습니다: ${id}`,
    );
    check(
      ALLOWED_ADDRESS_POINT_MATCH_METHODS.has(item.matchMethod),
      `화장실 공식 호스트 주소 대표점 매칭 방식이 허용 범위 밖입니다: ${id}`,
    );
    check(
      hostSourceIds.has(String(item.sourceId || '')),
      `화장실 공식 호스트 주소 대표점 출처가 원장 메타데이터에 없습니다: ${id}`,
    );
    check(
      item.coverageGain === true && item.legacyCoordinateRepair === false,
      `화장실 공식 호스트 주소 대표점은 신규 근사점이어야 합니다: ${id}`,
    );
    check(
      Boolean(bounds)
        && Number(item.lat) >= bounds.latitude[0]
        && Number(item.lat) <= bounds.latitude[1]
        && Number(item.lng) >= bounds.longitude[0]
        && Number(item.lng) <= bounds.longitude[1],
      `화장실 공식 호스트 주소 대표점 좌표가 관할 범위 밖입니다: ${id}`,
    );
    check(
      !baseRestroomById.has(id),
      `화장실 기본 조각과 공식 호스트 주소 대표점 ID가 겹칩니다: ${id}`,
    );
  }
  check(
    hostCoordinateKeys.size === RESTROOM_HOST_ADDRESS_POINT_REGRESSION.uniquePointCount,
    '화장실 공식 호스트 주소 대표점 고유 좌표가 87개가 아닙니다.',
  );
  for (const [cityKey, expected] of Object.entries({
    seoul: 5,
    daegu: 35,
    sejong: 12,
    ulsan: 35,
  })) {
    check(
      Number(hostCityCounts[cityKey] || 0) === expected,
      `화장실 공식 호스트 주소 대표점 ${cityKey} 합계가 ${expected}건이 아닙니다.`,
    );
  }

  const addressPointFragmentsById = auditRestroomAddressPointFragments(addressPointById);
  check(
    addressPointFragmentsById.size === addressPointById.size,
    '화장실 공식 주소 대표점 조각과 원장 수량이 다릅니다.',
  );
  for (const id of addressPointById.keys()) {
    check(
      addressPointFragmentsById.has(id),
      `화장실 공식 주소 대표점 원장 ID가 조각에 없습니다: ${id}`,
    );
  }

  const baseItems = [...baseRestroomById.values()];
  const addressFragmentItems = [...addressPointFragmentsById.values()];
  const facilityCoordinateCount = baseItems
    .filter(item => item.coordinateKind === 'facility_point').length;
  const baseAddressPointCount = baseItems
    .filter(item => item.coordinateKind === 'address_point').length;
  const geocodedAddressPointCount = baseItems
    .filter(item => item.coordinateSourceId === 'kakao-address-geocode-cache').length;
  const legacySharedAddressPointCount = baseItems
    .filter(item => item.coordinateSourceId === 'legacy-shared-address-coordinate').length;
  const addressPointCount = baseAddressPointCount + addressFragmentItems.length;
  const unknownCoordinateCount = baseItems
    .filter(item => !['facility_point', 'address_point'].includes(item.coordinateKind)).length;
  check(unknownCoordinateCount === 0, `화장실 기본 조각에 미분류 좌표 ${unknownCoordinateCount}건이 있습니다.`);
  check(
    facilityCoordinateCount === Number(restroomManifest.facilityCoordinateCount),
    '화장실 매니페스트 시설 좌표 합계가 조각과 다릅니다.',
  );
  check(
    baseAddressPointCount === Number(restroomManifest.baseAddressPointCount),
    '화장실 매니페스트 기본 주소 대표점 합계가 조각과 다릅니다.',
  );
  check(
    baseAddressPointCount === geocodedAddressPointCount + legacySharedAddressPointCount,
    '화장실 기본 주소 대표점과 출처별 합계가 다릅니다.',
  );
  check(
    geocodedAddressPointCount === Number(restroomManifest.legacyGeocodedAddressPointCount)
      && legacySharedAddressPointCount === Number(restroomManifest.legacySharedAddressPointCount),
    '화장실 지오코딩·동일 주소 이전 좌표 합계가 매니페스트와 다릅니다.',
  );
  check(
    addressPointCount === Number(restroomManifest.addressPointCount),
    '화장실 매니페스트 주소 대표점 합계가 조각과 다릅니다.',
  );
  check(
    facilityCoordinateCount + addressPointCount === Number(restroomManifest.total),
    '화장실 매니페스트 시설 좌표 + 주소 대표점이 지도 total과 다릅니다.',
  );
  check(
    baseItems.length + addressFragmentItems.length === Number(restroomManifest.total),
    '화장실 기본·주소 대표점 조각 합계가 지도 total과 다릅니다.',
  );
  check(
    Number(restroomManifest.total) + Number(restroomManifest.missingCoordinateCount)
      === Number(restroomManifest.supportedCityTotal),
    '화장실 지도 total + 좌표 미확인 합계가 지원지역 원본과 다릅니다.',
  );
  check(
    Number(restroomManifest.officialAddressPointCount) === officialAddressPointItems.length,
    '화장실 매니페스트 공식 주소 대표점 합계가 원장과 다릅니다.',
  );
  check(
    Number(restroomManifest.hostAddressPointCount) === officialHostAddressPointItems.length
      && Number(restroomManifest.hostAddressPointCoverageGainCount)
        === RESTROOM_HOST_ADDRESS_POINT_REGRESSION.coverageGainCount
      && Number(restroomManifest.hostAddressUniquePointCount)
        === RESTROOM_HOST_ADDRESS_POINT_REGRESSION.uniquePointCount
      && Number(restroomManifest.nationalStandardHostAddressPointCount) === 82
      && Number(restroomManifest.municipalHostAddressPointCount) === 5
      && restroomManifest.hostAddressPointReviewFingerprint
        === REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT
      && JSON.stringify(restroomManifest.hostAddressPointGroups)
        === JSON.stringify(officialHostAddressPoints.groups),
    '화장실 매니페스트 공식 호스트 주소 대표점 합계가 87/87/87과 다릅니다.',
  );
  check(
    Number(restroomManifest.officialAddressPointRepairCount)
      === RESTROOM_ADDRESS_POINT_REGRESSION.repairCount,
    '화장실 매니페스트 공식 주소 대표점 교정 합계가 13건이 아닙니다.',
  );
  check(
    Number(restroomManifest.officialAddressPointCoverageGainCount)
      === RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount
      && Number(restroomManifest.officialAddressUniquePointCount)
        === RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount,
    '화장실 매니페스트 공식 주소 대표점 신규·고유점 합계가 222/206이 아닙니다.',
  );
  const addressPointOverlay = (restroomManifest.addressPointOverlays || [])
    .find(overlay => String(overlay.id) === String(officialAddressPoints.source?.id || ''));
  check(Boolean(addressPointOverlay), '화장실 공식 주소 대표점 출처가 매니페스트에 없습니다.');
  check(
    Number(addressPointOverlay?.matchedCount) === RESTROOM_ADDRESS_POINT_REGRESSION.total
      && Number(addressPointOverlay?.coverageGainCount)
        === RESTROOM_ADDRESS_POINT_REGRESSION.coverageGainCount
      && Number(addressPointOverlay?.repairCount)
        === RESTROOM_ADDRESS_POINT_REGRESSION.repairCount
      && Number(addressPointOverlay?.uniquePointCount)
        === RESTROOM_ADDRESS_POINT_REGRESSION.uniquePointCount,
    '화장실 공식 주소 대표점 매니페스트 overlay의 235/222/13/206 집계가 다릅니다.',
  );
  const addressPointOverlays = new Map(
    (restroomManifest.addressPointOverlays || [])
      .map(overlay => [String(overlay.id), overlay]),
  );
  let hostOverlayGainTotal = 0;
  for (const source of officialHostAddressPoints.sources || []) {
    const overlay = addressPointOverlays.get(String(source.id));
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
    check(Boolean(overlay), `화장실 호스트 주소 대표점 출처가 매니페스트에 없습니다: ${source.id}`);
    check(
      scopedRowAccounting === Number(source.scopedRowCount)
        && Number(source.validCoordinateCount) - Number(source.duplicateRecordKeyCount)
          === Number(source.matchableRecordCount)
        && matchAccounting === Number(source.matchableRecordCount),
      `화장실 호스트 주소 대표점 출처 ${source.id}의 원본·매칭 행 회계가 다릅니다.`,
    );
    check(
      Number(overlay?.sourceTotal) === Number(source.rawCount)
        && Number(overlay?.validCoordinateCount) === Number(source.validCoordinateCount)
        && Number(overlay?.matchableRecordCount) === Number(source.matchableRecordCount)
        && JSON.stringify(Object.entries(overlay?.validScopedRowsByCity || {}).sort())
          === JSON.stringify(Object.entries(source.validScopedRowsByCity || {}).sort())
        && JSON.stringify(Object.entries(overlay?.minimumValidScopedRowsByCity || {}).sort())
          === JSON.stringify(Object.entries(source.minimumValidScopedRowsByCity || {}).sort())
        && overlay?.minimumLatestSourceDate === source.minimumLatestSourceDate
        && Number(overlay?.duplicateRecordKeyCount) === Number(source.duplicateRecordKeyCount)
        && Number(overlay?.externalRecordIdCollisionCount)
          === Number(source.externalRecordIdCollisionCount)
        && Number(overlay?.ineligibleHostCount) === Number(source.ineligibleHostCount)
        && overlay?.sourceGroupId === source.sourceGroupId
        && Number(overlay?.matchedCount) === Number(source.proposalCount)
        && Number(overlay?.coverageGainCount) === Number(source.acceptedTargetCount),
      `화장실 호스트 주소 대표점 출처 ${source.id}의 매니페스트 집계가 다릅니다.`,
    );
    hostOverlayGainTotal += Number(overlay?.coverageGainCount || 0);
  }
  check(
    hostOverlayGainTotal === RESTROOM_HOST_ADDRESS_POINT_REGRESSION.coverageGainCount,
    '화장실 호스트 주소 대표점 출처별 신규 합계가 87건이 아닙니다.',
  );
  const recalculatedCoverage = Number(restroomManifest.supportedCityTotal) > 0
    ? Math.round(
      (Number(restroomManifest.total) / Number(restroomManifest.supportedCityTotal)) * 1_000,
    ) / 10
    : 0;
  check(
    Number(restroomManifest.coordinateCoveragePercent) === recalculatedCoverage,
    '화장실 매니페스트 좌표 표시율이 지도/지원지역 합계와 다릅니다.',
  );
  check(
    Number(restroomManifest.total) >= 10_000
      && Number(restroomManifest.supportedCityTotal) >= Number(restroomManifest.total),
    '화장실 지도 또는 지원지역 합계가 안전 최소치 아래로 급감했습니다.',
  );

  return {
    geocoded: cacheItems.length,
    researched: researchedItems.length,
    officialRegional: officialRegionalItems.length,
    officialAddressPoints: officialAddressPointItems.length,
    officialHostAddressPoints: officialHostAddressPointItems.length,
  };
}

function auditGwangjuFirewater() {
  const cityDir = path.join(FIREWATER_DIR, '광주광역시');
  const index = readJson(path.join(cityDir, 'index.json'));
  const districtEntries = Object.entries(index.districts || {});
  const districtTotal = districtEntries.reduce((sum, [, count]) => sum + Number(count), 0);
  check(districtTotal === Number(index.total), '광주 소방용수 인덱스 합계가 total과 다릅니다.');

  for (const district of GWANGJU_DISTRICTS) {
    check(district in (index.districts || {}), `광주 소방용수에서 ${district}가 누락됐습니다.`);
  }
  for (const district of Object.keys(index.districts || {})) {
    check(GWANGJU_DISTRICTS.has(district), `광주 소방용수에 종전 5개 구 밖 분류가 있습니다: ${district}`);
  }

  let actualTotal = 0;
  const itemsByDistrict = new Map();
  for (const [district, expectedCount] of districtEntries) {
    const payload = readJson(path.join(cityDir, `${district}.json`));
    const items = payload?.response?.body?.items || [];
    itemsByDistrict.set(district, items);
    actualTotal += items.length;
    check(items.length === Number(expectedCount), `광주/${district} 소방용수 개수가 인덱스와 다릅니다.`);

    for (const item of items) {
      check(item.signguNm === district, `광주/${district} 소방용수의 signguNm이 다릅니다: ${item.fcltyNo || '식별자 없음'}`);
      const addresses = [item.rdnmadr, item.lnmadr].filter(Boolean);
      check(
        addresses.some(isFormerGwangjuAddress),
        `광주/${district} 소방용수에 종전 광주 5개 구 밖 주소가 있습니다: ${item.fcltyNo || '식별자 없음'}`,
      );
    }
  }

  const manifest = readJson(path.join(FIREWATER_DIR, 'manifest.json'));
  const manifestTotal = Number(manifest.cities?.['광주광역시']?.total);
  check(manifestTotal === Number(index.total), '광주 소방용수 매니페스트 합계가 인덱스와 다릅니다.');
  check(actualTotal === Number(index.total), '광주 소방용수 조각 파일 합계가 인덱스와 다릅니다.');
  const reviewed = GWANGJU_BUKGU_FIREWATER_CORROBORATION;
  const overlay = (manifest.regionalOverlays || [])
    .find(item => item.id === reviewed.id);
  check(Boolean(overlay), '광주 북구 소방용수 부분 교차검증 overlay가 없습니다.');
  for (const field of [
    'sourceDate',
    'sourceTotal',
    'targetTotal',
    'matchedCount',
    'unmatchedCount',
    'ambiguousMatchCount',
    'matchFingerprint',
    'targetBodyFingerprint',
  ]) {
    check(
      overlay?.[field] === reviewed[field],
      `광주 북구 소방용수 부분 교차검증 ${field}가 검토 기준과 다릅니다.`,
    );
  }
  check(
    overlay?.overlayKind === 'partial-corroboration'
      && overlay?.replacementScope === 'none'
      && overlay?.coordinatesPreserved === true,
    '광주 북구 소방용수 부분 교차검증이 관할 교체로 잘못 표시됐습니다.',
  );
  const northItems = itemsByDistrict.get('북구') || [];
  const corroborationFingerprint = fingerprintCorroborationItems(northItems, reviewed.id);
  const targetFingerprint = fingerprintFirewaterTargetBody(northItems);
  check(
    corroborationFingerprint.matchedCount === reviewed.matchedCount
      && corroborationFingerprint.matchFingerprint === reviewed.matchFingerprint
      && targetFingerprint.targetBodyFingerprint === reviewed.targetBodyFingerprint,
    '광주 북구 소방용수 부분 교차검증 provenance 또는 기존 본문 지문이 다릅니다.',
  );
  const cityPayload = readJson(path.join(FIREWATER_DIR, '광주광역시.json'));
  const cityNorthItems = (cityPayload?.response?.body?.items || [])
    .filter(item => item.signguNm === '북구');
  check(
    JSON.stringify(cityNorthItems) === JSON.stringify(northItems),
    '광주 전체 파일과 북구 조각 파일의 부분 교차검증 provenance가 다릅니다.',
  );
  return Number(index.total);
}

const civil = auditCivilGwangju();
const restrooms = auditRestrooms();
const coordinateCounts = auditCoordinateMetadata();
const firewaterTotal = auditGwangjuFirewater();

console.log(`광주 민방위 대피시설: ${civil.total.toLocaleString()}건`);
console.log(`광주 공중화장실: ${restrooms.gwangju?.total.toLocaleString() || 0}건`);
console.log(`광주 소방용수: ${firewaterTotal.toLocaleString()}건`);
console.log(`인천 공중화장실: ${restrooms.incheon?.total.toLocaleString() || 0}건`);
console.log(`주소 지오코딩 보충 좌표: ${coordinateCounts.geocoded.toLocaleString()}건`);
console.log(`교차검증 보충 좌표: ${coordinateCounts.researched.toLocaleString()}건`);
console.log(`공식 지역 보충 좌표: ${coordinateCounts.officialRegional.toLocaleString()}건`);
console.log(`공식 주소 대표점: ${coordinateCounts.officialAddressPoints.toLocaleString()}건`);
console.log(`공식 호스트 시설 주소 대표점: ${coordinateCounts.officialHostAddressPoints.toLocaleString()}건`);

if (failures.length > 0) {
  console.error(`행정구역 감사 실패 ${failures.length}건:`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log('행정구역 감사 통과');
}
