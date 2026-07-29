import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const RESTROOM_DIR = path.join(DATA_DIR, 'restrooms');
const FIREWATER_DIR = path.join(ROOT, 'public', 'firewater');

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
  return citySummaries;
}

function auditCoordinateMetadata() {
  const cachePath = path.join(DATA_DIR, 'restroom-geocoded-coordinates.json');
  const researchedPath = path.join(DATA_DIR, 'restroom-researched-coordinates.json');
  const officialRegionalPath = path.join(DATA_DIR, 'restroom-official-regional-coordinates.json');
  const manifest = readJson(path.join(DATA_DIR, 'manifest.json'));
  const cache = readJson(cachePath);
  const researched = readJson(researchedPath);
  const officialRegional = readJson(officialRegionalPath);
  const cacheItems = Array.isArray(cache.items) ? cache.items : [];
  const researchedItems = Array.isArray(researched.items) ? researched.items : [];
  const officialRegionalItems = Array.isArray(officialRegional.items) ? officialRegional.items : [];
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

  const sourceGainTotal = (officialRegional.sources || [])
    .reduce((sum, source) => sum + Number(source.gainCount || 0), 0);
  check(
    sourceGainTotal === officialRegionalItems.length,
    '화장실 공식 지역 좌표의 출처별 신규 합계가 전체와 다릅니다.',
  );
  const manifestOverlays = new Map(
    (manifest.datasets?.restrooms?.coordinateOverlays || [])
      .map(overlay => [String(overlay.id), overlay]),
  );
  for (const source of officialRegional.sources || []) {
    const overlay = manifestOverlays.get(String(source.id));
    check(Boolean(overlay), `화장실 공식 지역 좌표 출처가 매니페스트에 없습니다: ${source.id}`);
    check(
      Number(overlay?.coverageGainCount) === Number(source.gainCount),
      `화장실 공식 지역 좌표 출처 ${source.id}의 신규 합계가 매니페스트와 다릅니다.`,
    );
  }

  const finalCoordinatesById = new Map();
  for (const city of fs.readdirSync(RESTROOM_DIR, { withFileTypes: true })) {
    if (!city.isDirectory()) continue;
    const cityDir = path.join(RESTROOM_DIR, city.name);
    for (const filename of fs.readdirSync(cityDir)) {
      if (!filename.endsWith('.json') || filename === 'index.json') continue;
      const payload = readJson(path.join(cityDir, filename));
      for (const item of payload.items || []) {
        finalCoordinatesById.set(String(item.id), { lat: Number(item.lat), lng: Number(item.lng) });
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
      item.matchMethod === 'normalized-name+exact-road-or-lot-address',
      `화장실 공식 지역 좌표의 매칭 방식이 허용 범위 밖입니다: ${id}`,
    );
    const output = finalCoordinatesById.get(id);
    check(Boolean(output), `화장실 공식 지역 좌표가 최종 조각에 없습니다: ${id}`);
    check(
      output?.lat === Number(item.lat) && output?.lng === Number(item.lng),
      `화장실 공식 지역 좌표가 최종 조각 좌표와 다릅니다: ${id}`,
    );
  }

  return {
    geocoded: cacheItems.length,
    researched: researchedItems.length,
    officialRegional: officialRegionalItems.length,
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
  for (const [district, expectedCount] of districtEntries) {
    const payload = readJson(path.join(cityDir, `${district}.json`));
    const items = payload?.response?.body?.items || [];
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

if (failures.length > 0) {
  console.error(`행정구역 감사 실패 ${failures.length}건:`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log('행정구역 감사 통과');
}
