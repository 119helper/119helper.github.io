import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'restrooms');
const COORDINATE_INDEX_PATH = path.join(__dirname, '..', 'public', 'data', 'restroom-v1-coordinates.json');
const DATA_MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');

const API_KEY = process.env.RESTROOM_API_KEY || process.env.PUBLIC_DATA_API_KEY;
const SOURCE_DATE_OVERRIDE = process.env.RESTROOM_SOURCE_DATE || process.env.STATIC_DATA_SOURCE_DATE || '';
const LEGACY_COORDINATE_GIT_REF = process.env.RESTROOM_LEGACY_COORDINATE_GIT_REF || '';
const API_URL = 'https://apis.data.go.kr/1741000/public_restroom_info_v2/info_v2';
const SOURCE_URL = 'https://www.data.go.kr/data/15155058/openapi.do';
const NUM_OF_ROWS = 1000;
const REQUEST_TIMEOUT_MS = 20_000;

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

function encodeServiceKey(key) {
  const value = key?.trim();
  if (!value) {
    throw new Error('RESTROOM_API_KEY 또는 PUBLIC_DATA_API_KEY 환경변수가 필요합니다.');
  }
  return /%[0-9A-Fa-f]{2}/.test(value) ? value : encodeURIComponent(value);
}

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

function normalizedName(value) {
  return String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizedAddress(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^전남광주통합특별시/, '광주광역시')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function coordinateSignature(name, address) {
  return `${normalizedName(name)}|${normalizedAddress(address)}`;
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

  const addRecords = records => {
    for (const item of records) {
      const coordinate = { lat: item.lat, lng: item.lng };
      if (item.id) byId.set(item.id, coordinate);
      bySignature.set(coordinateSignature(item.nm, item.addr), coordinate);
      byAddress.set(normalizedAddress(item.addr), coordinate);
    }
  };

  if (fs.existsSync(COORDINATE_INDEX_PATH)) {
    addRecords(recordsFromJson(JSON.parse(fs.readFileSync(COORDINATE_INDEX_PATH, 'utf8'))));
  }

  if (fs.existsSync(OUTPUT_DIR)) {
    for (const city of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
      if (!city.isDirectory()) continue;
      const cityDir = path.join(OUTPUT_DIR, city.name);
      for (const filename of fs.readdirSync(cityDir)) {
        if (!filename.endsWith('.json') || filename === 'index.json') continue;
        try {
          addRecords(recordsFromJson(JSON.parse(fs.readFileSync(path.join(cityDir, filename), 'utf8'))));
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

  return { byId, bySignature, byAddress };
}

function findCity(address) {
  for (const [cityKey, prefixes] of Object.entries(SUPPORTED_CITIES)) {
    if (prefixes.some(prefix => address.startsWith(prefix))) return cityKey;
  }
  return null;
}

function districtOf(address, cityKey) {
  const tokens = address.split(/\s+/).filter(Boolean);
  const candidates = tokens.slice(1);
  const district = candidates.find(token =>
    token.length <= 12
    && (token.endsWith('구') || token.endsWith('군') || (cityKey === 'jeju' && token.endsWith('시')))
  );
  return district || candidates[0] || '기타';
}

function optimizeItem(item, previousCoordinates) {
  const id = String(item.MNG_NO || '');
  const name = String(item.RSTRM_NM || '무명 화장실');
  const address = String(item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '주소 미상');
  const embeddedLat = Number.parseFloat(item.WGS84_LAT || '0');
  const embeddedLng = Number.parseFloat(item.WGS84_LOT || '0');
  const previous = previousCoordinates.byId.get(id)
    || previousCoordinates.bySignature.get(coordinateSignature(name, address))
    || previousCoordinates.byAddress.get(normalizedAddress(address));
  const lat = embeddedLat || previous?.lat || 0;
  const lng = embeddedLng || previous?.lng || 0;
  const openHours = String(item.OPN_HR || '');

  return {
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
  };
}

async function fetchPage(pageNo) {
  const url = `${API_URL}?serviceKey=${encodeServiceKey(API_KEY)}&type=json&numOfRows=${NUM_OF_ROWS}&pageNo=${pageNo}`;
  let lastMessage = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': '119-helper-data-sync/2.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      if (!res.ok) {
        lastMessage = `HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
        if (res.status < 500) break;
      } else {
        const data = JSON.parse(text);
        const header = data.response?.header || data.header || {};
        const resultCode = String(header.resultCode ?? '0');
        if (!/^0+$/.test(resultCode)) {
          throw new Error(`API_RESULT_${resultCode} ${header.resultMsg || header.returnAuthMsg || ''}`.trim());
        }
        const body = data.response?.body || data.body || {};
        const rawItems = body.items?.item ?? body.items ?? [];
        return {
          items: Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [],
          totalCount: Number(body.totalCount) || 0,
        };
      }
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 3) await delay(300 * attempt);
  }

  throw new Error(`page ${pageNo}: ${lastMessage}`);
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
    apiUrl: API_URL,
    sourceDate: metadata.sourceDate,
    sourceDateLabel: '원본 행 최신 기준일',
    generatedAt: metadata.generatedAt,
    maxAgeDays: 30,
    total: metadata.coordinateMatchedCount,
    upstreamTotal: metadata.upstreamTotal,
    supportedCityTotal: metadata.supportedCityTotal,
    missingCoordinateCount: metadata.missingCoordinateCount,
    coordinateSource: '2026-06 API 정책 변경 전 마지막 공식 v1 WGS84 스냅샷',
    coordinateIndex: '/data/restroom-v1-coordinates.json',
  };

  fs.writeFileSync(DATA_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  console.log('전국 공중화장실 v2 데이터 동기화를 시작합니다.');
  const previousCoordinates = loadPreviousCoordinates();
  console.log(`기존 공식 좌표 ${previousCoordinates.byId.size.toLocaleString()}건을 불러왔습니다.`);

  const first = await fetchPage(1);
  const returnedPageSize = first.items.length || NUM_OF_ROWS;
  const totalPages = Math.max(1, Math.ceil(first.totalCount / returnedPageSize));
  const allItems = [...first.items];
  console.log(`원본 API 총 ${first.totalCount.toLocaleString()}건, ${totalPages}페이지`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    const page = await fetchPage(pageNo);
    allItems.push(...page.items);
    if (pageNo % 10 === 0 || pageNo === totalPages) {
      console.log(`다운로드 ${pageNo}/${totalPages}페이지`);
    }
    await delay(100);
  }

  const byCity = Object.fromEntries(Object.keys(SUPPORTED_CITIES).map(key => [key, new Map()]));
  let supportedCityTotal = 0;
  let coordinateMatchedCount = 0;
  let missingCoordinateCount = 0;

  for (const item of allItems) {
    const address = String(item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '');
    const cityKey = findCity(address);
    if (!cityKey) continue;
    supportedCityTotal += 1;

    const optimized = optimizeItem(item, previousCoordinates);
    if (!optimized.lat || !optimized.lng) {
      missingCoordinateCount += 1;
      continue;
    }
    coordinateMatchedCount += 1;

    const district = districtOf(address, cityKey);
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
        dataset: '행정안전부_공중화장실정보 조회서비스 v2',
        sourceUrl: SOURCE_URL,
        apiUrl: API_URL,
        city: cityKey,
        sourceDate,
        generatedAt,
        coordinateSource: 'API 정책 변경 전 마지막 공식 v1 WGS84 스냅샷',
      },
    };
    fs.writeFileSync(path.join(cityDir, 'index.json'), JSON.stringify(index), 'utf8');
    console.log(`${cityKey}: 좌표 결합 ${cityTotal.toLocaleString()}건`);
  }

  updateDataManifest({
    generatedAt,
    sourceDate,
    upstreamTotal: first.totalCount,
    supportedCityTotal,
    coordinateMatchedCount,
    missingCoordinateCount,
  });

  console.log(`완료: 지원 도시 ${supportedCityTotal.toLocaleString()}건 중 좌표 결합 ${coordinateMatchedCount.toLocaleString()}건, 좌표 없음 ${missingCoordinateCount.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
