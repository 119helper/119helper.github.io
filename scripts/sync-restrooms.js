import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  fetchOfficialRegionalCoordinates,
  parseCsv,
} from './restroom-regional-overlays.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'restrooms');
const COORDINATE_INDEX_PATH = path.join(__dirname, '..', 'public', 'data', 'restroom-v1-coordinates.json');
const GEOCODE_CACHE_PATH = path.join(__dirname, '..', 'public', 'data', 'restroom-geocoded-coordinates.json');
const RESEARCHED_COORDINATE_PATH = path.join(__dirname, '..', 'public', 'data', 'restroom-researched-coordinates.json');
const OFFICIAL_REGIONAL_COORDINATE_PATH = path.join(
  __dirname,
  '..',
  'public',
  'data',
  'restroom-official-regional-coordinates.json',
);
const DATA_MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');

const SOURCE_DATE_OVERRIDE = process.env.RESTROOM_SOURCE_DATE || process.env.STATIC_DATA_SOURCE_DATE || '';
const LEGACY_COORDINATE_GIT_REF = process.env.RESTROOM_LEGACY_COORDINATE_GIT_REF || '';
const GEOCODE_GAPS_PATH = process.env.RESTROOM_GEOCODE_GAPS_PATH || '';
const SOURCE_URL = 'https://www.data.go.kr/data/15075531/fileData.do';
const SOURCE_INTRO_URL = 'https://file.localdata.go.kr/file/public_restroom_info/info';
const DOWNLOAD_URL = 'https://file.localdata.go.kr/file/download/public_restroom_info/info';
const REQUEST_TIMEOUT_MS = 60_000;

const SUPPORTED_CITIES = {
  seoul: ['서울특별시'],
  busan: ['부산광역시'],
  daegu: ['대구광역시'],
  incheon: ['인천광역시'],
  gwangju: ['전남광주통합특별시', '광주광역시'],
  daejeon: ['대전광역시'],
  ulsan: ['울산광역시'],
  sejong: ['세종특별자치시'],
  jeju: ['제주특별자치도'],
};

const FORMER_GWANGJU_DISTRICTS = new Set(['동구', '서구', '남구', '북구', '광산구']);
const GWANGJU_DISTRICT_PATTERN = [...FORMER_GWANGJU_DISTRICTS].join('|');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const ymd = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const separated = text.match(/^(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (separated) {
    return `${separated[1]}-${String(separated[2]).padStart(2, '0')}-${String(separated[3]).padStart(2, '0')}`;
  }

  return text;
}

function sourceDateOf(item) {
  return normalizeDate(
    item.DAT_CRTR_YMD
    || item.DATA_STD_DE
    || item.DATA_CRTR_YMD
    || item.DATA_BASE_DATE
    || item.referenceDate
    || item.dataStdde
    || item.baseDate
    || item.lastUpdtDt
    || item.데이터기준일자
    || '',
  );
}

function inferSourceDate(items) {
  if (SOURCE_DATE_OVERRIDE) return normalizeDate(SOURCE_DATE_OVERRIDE);
  const dates = items.map(sourceDateOf).filter(Boolean).sort();
  return dates.at(-1) || null;
}

function nationalCsvItem(row) {
  const openType = String(row.개방시간 || '').trim();
  const openDetail = String(row.개방시간상세 || '').trim();
  return {
    MNG_NO: String(row.관리번호 || '').trim(),
    RSTRM_NM: String(row.화장실명 || '').trim(),
    LCTN_ROAD_NM_ADDR: String(row.소재지도로명주소 || '').trim(),
    LCTN_LOTNO_ADDR: String(row.소재지지번주소 || '').trim(),
    MALE_TOILT_CNT: String(row['남성용-대변기수'] || '').trim(),
    FEMALE_TOILT_CNT: String(row['여성용-대변기수'] || '').trim(),
    OPN_HR: [openType, openDetail].filter(Boolean).join(' '),
    EMRGNCBLL_INSTL_YN: String(row.비상벨설치여부 || '').trim(),
    SE_NM: String(row.구분명 || '').trim(),
    DAT_CRTR_YMD: String(row.데이터기준일자 || '').trim(),
    WGS84_LAT: '',
    WGS84_LOT: '',
  };
}

async function downloadNationalItems() {
  let lastMessage = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(DOWNLOAD_URL, {
        headers: {
          Accept: 'text/csv,*/*',
          Referer: SOURCE_INTRO_URL,
          'User-Agent': 'Mozilla/5.0 (compatible; 119-helper-data-sync/3.0)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      // LOCALDATA 응답 헤더는 UTF-8로 표시되지만 실제 공개 CSV는 CP949 바이트다.
      const text = new TextDecoder('euc-kr').decode(await response.arrayBuffer());
      const rows = parseCsv(text);
      const requiredColumns = [
        '관리번호',
        '화장실명',
        '소재지도로명주소',
        '소재지지번주소',
        '데이터기준일자',
      ];
      for (const column of requiredColumns) {
        if (!rows.every(row => Object.hasOwn(row, column))) {
          throw new Error(`전국 CSV 필수 컬럼 ${column}이 없습니다.`);
        }
      }
      if (rows.length < 50_000) {
        throw new Error(`전국 CSV ${rows.length.toLocaleString()}행은 기대 범위보다 적습니다.`);
      }

      const items = rows.map(nationalCsvItem);
      const seenIds = new Set();
      for (const [index, item] of items.entries()) {
        if (!item.MNG_NO) throw new Error(`전국 CSV ${index + 2}행 관리번호가 비었습니다.`);
        if (seenIds.has(item.MNG_NO)) throw new Error(`전국 CSV 관리번호가 중복됐습니다: ${item.MNG_NO}`);
        seenIds.add(item.MNG_NO);
      }
      return items;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await delay(500 * attempt);
    }
  }

  throw new Error(`전국 공중화장실 CSV 다운로드 실패: ${lastMessage}`);
}

function normalizedName(value) {
  return String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

function cleanTransitionAddress(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(
      new RegExp(`^광주광역시\\s+(${GWANGJU_DISTRICT_PATTERN})\\s+전남광주통합특별시\\s+\\1\\s+`),
      '전남광주통합특별시 $1 ',
    )
    .replace(
      new RegExp(`^전남광주통합특별시\\s+(${GWANGJU_DISTRICT_PATTERN})\\s+광주광역시\\s+\\1\\s+`),
      '전남광주통합특별시 $1 ',
    );
}

function normalizedAddress(value) {
  return cleanTransitionAddress(value)
    .replace(/^전남광주통합특별시/, '광주광역시')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function coordinateSignature(name, address) {
  return `${normalizedName(name)}|${normalizedAddress(address)}`;
}

function localCoordinateSignature(name, address) {
  const cleaned = cleanTransitionAddress(address)
    .replace(/^전남광주통합특별시/, '광주광역시');
  const match = cleaned.match(/^(\S+(?:특별자치시|특별자치도|특별시|광역시|도))\s+(.+)$/);
  if (!match) return `${normalizedName(name)}|${normalizedAddress(cleaned)}`;
  const city = normalizedName(match[1]);
  const local = match[2].replace(/^\S+(?:구|군)\s+/, '');
  return `${normalizedName(name)}|${city}|${normalizedAddress(local)}`;
}

function coordinateRecord(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return null;
  return {
    id: String(item.id || ''),
    nm: String(item.nm || ''),
    addr: String(item.addr || ''),
    lat,
    lng,
  };
}

function recordsFromJson(json) {
  const items = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
  return items.map(coordinateRecord).filter(Boolean);
}

function loadOfficialRegionalCoordinateIds() {
  if (!fs.existsSync(OFFICIAL_REGIONAL_COORDINATE_PATH)) return new Set();
  try {
    const json = JSON.parse(fs.readFileSync(OFFICIAL_REGIONAL_COORDINATE_PATH, 'utf8'));
    const items = Array.isArray(json?.items) ? json.items : [];
    return new Set(items.map(item => String(item.id || '')).filter(Boolean));
  } catch {
    // 인덱스가 손상된 경우 이전 지역 좌표를 재사용하지 않고 공식 원천에서 다시 계산한다.
    return new Set();
  }
}

function loadLegacyCoordinatesFromGit(gitRef) {
  const repositoryRoot = path.resolve(__dirname, '..');
  const files = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', gitRef, '--', 'public/data/restrooms'],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
    .split(/\r?\n/)
    .filter(file => file.endsWith('.json') && !file.endsWith('/index.json'));
  const records = [];

  for (const file of files) {
    const content = execFileSync(
      'git',
      ['show', `${gitRef}:${file}`],
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );
    records.push(...recordsFromJson(JSON.parse(content)));
  }
  return records;
}

function saveCoordinateIndex(records) {
  const unique = new Map();
  for (const record of records) {
    const key = record.id || coordinateSignature(record.nm, record.addr);
    if (key) unique.set(key, record);
  }
  const items = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(COORDINATE_INDEX_PATH, JSON.stringify({
    version: 1,
    source: '행정안전부 공중화장실정보 조회서비스 v1 마지막 공식 WGS84 좌표',
    capturedAt: new Date().toISOString(),
    total: items.length,
    items,
  }), 'utf8');
  return items.length;
}

function loadPreviousCoordinates() {
  const byId = new Map();
  const bySignature = new Map();
  const byAddress = new Map();
  const byLocalSignature = new Map();
  const previousOfficialRegionalIds = loadOfficialRegionalCoordinateIds();

  const addRecords = (records, skippedIds = new Set()) => {
    for (const item of records) {
      if (skippedIds.has(item.id)) continue;
      const coordinate = { lat: item.lat, lng: item.lng, addr: item.addr };
      if (item.id) byId.set(item.id, coordinate);
      bySignature.set(coordinateSignature(item.nm, item.addr), coordinate);
      byAddress.set(normalizedAddress(item.addr), coordinate);
      byLocalSignature.set(localCoordinateSignature(item.nm, item.addr), coordinate);
    }
  };

  if (fs.existsSync(COORDINATE_INDEX_PATH)) {
    addRecords(recordsFromJson(JSON.parse(fs.readFileSync(COORDINATE_INDEX_PATH, 'utf8'))));
  }

  let geocodedCount = 0;
  if (fs.existsSync(GEOCODE_CACHE_PATH)) {
    const geocodedRecords = recordsFromJson(JSON.parse(fs.readFileSync(GEOCODE_CACHE_PATH, 'utf8')));
    addRecords(geocodedRecords);
    geocodedCount = geocodedRecords.length;
  }

  let researchedCount = 0;
  if (fs.existsSync(RESEARCHED_COORDINATE_PATH)) {
    const researchedRecords = recordsFromJson(JSON.parse(fs.readFileSync(RESEARCHED_COORDINATE_PATH, 'utf8')));
    addRecords(researchedRecords);
    researchedCount = researchedRecords.length;
  }

  if (fs.existsSync(OUTPUT_DIR)) {
    for (const city of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
      if (!city.isDirectory()) continue;
      const cityDir = path.join(OUTPUT_DIR, city.name);
      for (const filename of fs.readdirSync(cityDir)) {
        if (!filename.endsWith('.json') || filename === 'index.json') continue;
        try {
          addRecords(
            recordsFromJson(JSON.parse(fs.readFileSync(path.join(cityDir, filename), 'utf8'))),
            previousOfficialRegionalIds,
          );
        } catch {
          // 손상된 과거 조각은 건너뛰고 나머지 좌표를 최대한 복구한다.
        }
      }
    }
  }

  if (LEGACY_COORDINATE_GIT_REF) {
    const legacyRecords = loadLegacyCoordinatesFromGit(LEGACY_COORDINATE_GIT_REF);
    addRecords(legacyRecords);
    const saved = saveCoordinateIndex(legacyRecords);
    console.log(`Git ${LEGACY_COORDINATE_GIT_REF}에서 공식 v1 좌표 인덱스 ${saved.toLocaleString()}건을 보존했습니다.`);
  }

  return {
    byId,
    bySignature,
    byAddress,
    byLocalSignature,
    geocodedCount,
    researchedCount,
    previousOfficialRegionalIds,
  };
}

function findCity(address) {
  for (const [cityKey, prefixes] of Object.entries(SUPPORTED_CITIES)) {
    if (!prefixes.some(prefix => address === prefix || address.startsWith(`${prefix} `))) continue;
    if (cityKey === 'gwangju') {
      const district = cleanTransitionAddress(address).split(/\s+/)[1] || '';
      if (!FORMER_GWANGJU_DISTRICTS.has(district)) return null;
    }
    return cityKey;
  }
  return null;
}

function districtOf(address, cityKey) {
  const tokens = cleanTransitionAddress(address).split(/\s+/).filter(Boolean);
  const candidates = tokens.slice(1);
  const district = candidates.find(token =>
    token.length <= 12
    && (token.endsWith('구') || token.endsWith('군') || (cityKey === 'jeju' && token.endsWith('시')))
  );
  return district || '기타';
}

function previousCoordinateForItem(item, previousCoordinates) {
  const id = String(item.MNG_NO || '');
  const name = String(item.RSTRM_NM || '무명 화장실');
  const address = cleanTransitionAddress(item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '주소 미상');
  return previousCoordinates.byId.get(id)
    || previousCoordinates.bySignature.get(coordinateSignature(name, address))
    || previousCoordinates.byAddress.get(normalizedAddress(address))
    || previousCoordinates.byLocalSignature.get(localCoordinateSignature(name, address))
    || null;
}

function optimizeItem(item, previousCoordinates, officialRegionalById) {
  const id = String(item.MNG_NO || '');
  const name = String(item.RSTRM_NM || '무명 화장실');
  const address = cleanTransitionAddress(item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '주소 미상');
  const embeddedLat = Number.parseFloat(item.WGS84_LAT || '0');
  const embeddedLng = Number.parseFloat(item.WGS84_LOT || '0');
  const previous = previousCoordinateForItem(item, previousCoordinates);
  const officialRegional = officialRegionalById.get(id);
  const lat = embeddedLat || previous?.lat || officialRegional?.lat || 0;
  const lng = embeddedLng || previous?.lng || officialRegional?.lng || 0;
  const openHours = String(item.OPN_HR || '');

  return {
    facility: {
      id,
      nm: name,
      lat,
      lng,
      addr: address,
      isOpenAtNight: /24|상시/.test(openHours) ? 'Y' : 'N',
      hasBell: item.EMRGNCBLL_INSTL_YN === 'Y' ? 'Y' : 'N',
      male: Number.parseInt(item.MALE_TOILT_CNT || 0, 10) || 0,
      female: Number.parseInt(item.FEMALE_TOILT_CNT || 0, 10) || 0,
      type: item.SE_NM || '공중화장실',
    },
    matchedAddress: previous?.addr || officialRegional?.sourceAddress || officialRegional?.addr || '',
  };
}

function resetCityDirectory(cityDir) {
  const resolvedRoot = path.resolve(OUTPUT_DIR);
  const resolvedTarget = path.resolve(cityDir);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace unexpected directory: ${resolvedTarget}`);
  }
  if (fs.existsSync(resolvedTarget)) fs.rmSync(resolvedTarget, { recursive: true, force: true });
  fs.mkdirSync(resolvedTarget, { recursive: true });
}

function updateDataManifest(metadata) {
  const manifest = fs.existsSync(DATA_MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(DATA_MANIFEST_PATH, 'utf8'))
    : { version: 1, datasets: {} };

  manifest.generatedAt = metadata.generatedAt;
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.restrooms = {
    label: '공중화장실',
    path: '/data/restrooms',
    sourceUrl: SOURCE_URL,
    downloadUrl: DOWNLOAD_URL,
    sourceDate: metadata.sourceDate,
    sourceDateLabel: '원본 행 최신 기준일',
    sourceDateSource: SOURCE_DATE_OVERRIDE
      ? 'workflow manual override'
      : 'LOCALDATA 원본 행 데이터기준일자 최신값',
    generatedAt: metadata.generatedAt,
    maxAgeDays: 30,
    coverageScope: 'supported-cities-with-verified-coordinates',
    supportedCityCount: Object.keys(SUPPORTED_CITIES).length,
    completenessStatus: metadata.missingCoordinateCount > 0 ? 'partial' : 'complete',
    total: metadata.coordinateMatchedCount,
    upstreamTotal: metadata.upstreamTotal,
    supportedCityTotal: metadata.supportedCityTotal,
    missingCoordinateCount: metadata.missingCoordinateCount,
    coordinateCoveragePercent: metadata.supportedCityTotal > 0
      ? Math.round((metadata.coordinateMatchedCount / metadata.supportedCityTotal) * 1_000) / 10
      : 0,
    coordinateSource: '정책 변경 전 마지막 공식 v1 WGS84 스냅샷 + 주소 지오코딩·교차검증 + 공식 지자체 1:1 이름·주소 좌표 보충',
    coordinateIndex: '/data/restroom-v1-coordinates.json',
    geocodeIndex: '/data/restroom-geocoded-coordinates.json',
    geocodedCount: metadata.geocodedCount,
    researchedCoordinateIndex: '/data/restroom-researched-coordinates.json',
    researchedCount: metadata.researchedCount,
    regionalCoordinateIndex: '/data/restroom-official-regional-coordinates.json',
    regionalCoordinateCount: metadata.officialRegionalIndex.total,
    coordinateJoinPolicy: 'normalized-name+exact-road-or-lot-address; unique-national-and-regional-match; jurisdiction-bounds',
    coordinateOverlays: metadata.officialRegionalIndex.sources.map(source => ({
      id: source.id,
      label: source.displayLabel
        || (source.district === '전체' ? source.city : source.district),
      sourceDate: source.sourceDate,
      sourceTotal: source.sourceTotal,
      validCoordinateCount: source.validCoordinateCount,
      matchedCount: source.exactMatchedCount,
      coverageGainCount: source.gainCount,
      existingCoordinateCount: source.existingCoordinateCount,
      invalidCoordinateCount: source.invalidCoordinateCount,
      outOfScopeCount: source.outOfScopeCount,
      ambiguousMatchCount: source.ambiguousNationalMatchCount
        + source.duplicateRegionalMatchCount,
      sourceUrl: source.sourceUrl,
      license: source.license,
    })),
  };

  fs.writeFileSync(DATA_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  console.log('전국 공중화장실 LOCALDATA CSV 동기화를 시작합니다.');
  const previousCoordinates = loadPreviousCoordinates();
  console.log(`기존 공식 좌표 ${previousCoordinates.byId.size.toLocaleString()}건을 불러왔습니다.`);
  if (previousCoordinates.geocodedCount > 0) {
    console.log(`주소 지오코딩 보충 좌표 ${previousCoordinates.geocodedCount.toLocaleString()}건을 불러왔습니다.`);
  }
  if (previousCoordinates.researchedCount > 0) {
    console.log(`교차검증 보충 좌표 ${previousCoordinates.researchedCount.toLocaleString()}건을 불러왔습니다.`);
  }

  const allItems = await downloadNationalItems();
  console.log(`원본 CSV 총 ${allItems.length.toLocaleString()}건`);

  const existingCoordinateIds = new Set(
    allItems
      .filter(item => previousCoordinateForItem(item, previousCoordinates))
      .map(item => String(item.MNG_NO || ''))
      .filter(Boolean),
  );
  const officialRegionalIndex = await fetchOfficialRegionalCoordinates(
    allItems,
    existingCoordinateIds,
  );
  fs.writeFileSync(
    OFFICIAL_REGIONAL_COORDINATE_PATH,
    JSON.stringify(officialRegionalIndex, null, 2),
    'utf8',
  );
  const officialRegionalById = new Map(
    officialRegionalIndex.items.map(item => [String(item.id), item]),
  );
  console.log(
    `공식 지역 좌표 ${officialRegionalIndex.total.toLocaleString()}건을 신규 결합합니다.`,
  );
  for (const source of officialRegionalIndex.sources) {
    console.log(
      `${source.label}: 원본 ${source.sourceTotal.toLocaleString()}건, `
      + `엄격 일치 ${source.exactMatchedCount.toLocaleString()}건, `
      + `기존 좌표 ${source.existingCoordinateCount.toLocaleString()}건, `
      + `신규 ${source.gainCount.toLocaleString()}건`,
    );
  }

  const byCity = Object.fromEntries(Object.keys(SUPPORTED_CITIES).map(key => [key, new Map()]));
  let supportedCityTotal = 0;
  let coordinateMatchedCount = 0;
  let missingCoordinateCount = 0;
  const gwangjuSourceDistricts = {};
  const gwangjuUnmatchedSamples = [];
  const geocodeGaps = [];

  for (const item of allItems) {
    const address = String(item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '');
    if (address.includes('광주')) {
      const district = districtOf(address, 'gwangju');
      gwangjuSourceDistricts[district] = (gwangjuSourceDistricts[district] || 0) + 1;
      if (!findCity(address) && gwangjuUnmatchedSamples.length < 5) {
        gwangjuUnmatchedSamples.push(address);
      }
    }
    const cityKey = findCity(address);
    if (!cityKey) continue;
    supportedCityTotal += 1;

    const { facility: optimized, matchedAddress } = optimizeItem(
      item,
      previousCoordinates,
      officialRegionalById,
    );
    if (!optimized.lat || !optimized.lng) {
      missingCoordinateCount += 1;
      if (cityKey === 'gwangju' || cityKey === 'incheon') {
        geocodeGaps.push({
          id: optimized.id,
          nm: optimized.nm,
          addr: optimized.addr,
          roadAddr: cleanTransitionAddress(item.LCTN_ROAD_NM_ADDR || ''),
          lotAddr: cleanTransitionAddress(item.LCTN_LOTNO_ADDR || ''),
          city: cityKey,
          district: districtOf(address, cityKey),
        });
      }
      continue;
    }
    coordinateMatchedCount += 1;

    const sourceDistrict = districtOf(address, cityKey);
    const district = sourceDistrict === '기타' && matchedAddress
      ? districtOf(matchedAddress, cityKey)
      : sourceDistrict;
    const cityMap = byCity[cityKey];
    if (!cityMap.has(district)) cityMap.set(district, []);
    cityMap.get(district).push(optimized);
  }

  const generatedAt = new Date().toISOString();
  const sourceDate = inferSourceDate(allItems);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [cityKey, districtMap] of Object.entries(byCity)) {
    const cityDir = path.join(OUTPUT_DIR, cityKey);
    resetCityDirectory(cityDir);
    let cityTotal = 0;
    const districts = {};

    for (const [district, items] of [...districtMap.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
      cityTotal += items.length;
      districts[district] = items.length;
      fs.writeFileSync(path.join(cityDir, `${district}.json`), JSON.stringify({ items }), 'utf8');
    }

    const index = {
      total: cityTotal,
      districts,
      metadata: {
        dataset: 'LOCALDATA 전국 공중화장실 표준데이터',
        sourceUrl: SOURCE_URL,
        downloadUrl: DOWNLOAD_URL,
        city: cityKey,
        sourceDate,
        generatedAt,
        coordinateSource: '정책 변경 전 마지막 공식 v1 WGS84 스냅샷 + 주소 지오코딩·교차검증 + 공식 지자체 1:1 이름·주소 좌표 보충',
        coordinateOverlays: officialRegionalIndex.sources
          .filter(source => source.cityKey === cityKey && source.gainCount > 0)
          .map(source => ({
            id: source.id,
            label: source.displayLabel
              || (source.district === '전체' ? source.city : source.district),
            sourceDate: source.sourceDate,
            coverageGainCount: source.gainCount,
            sourceUrl: source.sourceUrl,
          })),
      },
    };
    fs.writeFileSync(path.join(cityDir, 'index.json'), JSON.stringify(index), 'utf8');
    console.log(`${cityKey}: 좌표 결합 ${cityTotal.toLocaleString()}건`);
  }

  updateDataManifest({
    generatedAt,
    sourceDate,
    upstreamTotal: allItems.length,
    supportedCityTotal,
    coordinateMatchedCount,
    missingCoordinateCount,
    geocodedCount: previousCoordinates.geocodedCount,
    researchedCount: previousCoordinates.researchedCount,
    officialRegionalIndex,
  });

  if (GEOCODE_GAPS_PATH) {
    const resolvedGapPath = path.resolve(GEOCODE_GAPS_PATH);
    fs.mkdirSync(path.dirname(resolvedGapPath), { recursive: true });
    fs.writeFileSync(resolvedGapPath, JSON.stringify({
      version: 1,
      generatedAt,
      total: geocodeGaps.length,
      items: geocodeGaps,
    }), 'utf8');
    console.log(`광주·인천 좌표 보충 대상 ${geocodeGaps.length.toLocaleString()}건을 ${resolvedGapPath}에 기록했습니다.`);
  }

  console.log(`광주 원본 구별 행: ${JSON.stringify(gwangjuSourceDistricts)}`);
  if (gwangjuUnmatchedSamples.length > 0) {
    console.log(`광주 미분류 주소 예시: ${JSON.stringify(gwangjuUnmatchedSamples)}`);
  }
  console.log(`완료: 지원 도시 ${supportedCityTotal.toLocaleString()}건 중 좌표 결합 ${coordinateMatchedCount.toLocaleString()}건, 좌표 없음 ${missingCoordinateCount.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
