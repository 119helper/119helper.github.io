import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'civil');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
const API_KEY = process.env.CIVIL_SHELTER_SYNC_API_KEY
  || process.env.RESTROOM_API_KEY
  || process.env.FIRE_WATER_API_KEY
  || process.env.PUBLIC_DATA_API_KEY;
const SOURCE_DATE_OVERRIDE = process.env.CIVIL_SOURCE_DATE || '';
const API_URL = 'https://apis.data.go.kr/1741000/civil_defense_shelter_info/info';
const SOURCE_URL = 'https://www.data.go.kr/data/15155067/openapi.do';
// 이 API는 더 큰 값을 요청해도 현재 최대 100행만 반환한다.
const NUM_OF_ROWS = 100;

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

function serviceKey() {
  const value = API_KEY?.trim();
  if (!value) throw new Error('민방위대피시설 동기화에 사용할 공공데이터 API 키가 필요합니다.');
  return /%[0-9A-Fa-f]{2}/.test(value) ? value : encodeURIComponent(value);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDate(value) {
  const match = String(value || '').match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function sourceDate(items) {
  if (SOURCE_DATE_OVERRIDE) return normalizeDate(SOURCE_DATE_OVERRIDE) || SOURCE_DATE_OVERRIDE;
  return items
    .map(item => normalizeDate(item.DAT_UPDT_PNT || item.LAST_MDFCN_PNT))
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function addressOf(item) {
  return String(item.LCTN_WHOL_ADDR || item.ROAD_NM_WHOL_ADDR || '');
}

function cityKeyOf(item) {
  const address = addressOf(item);
  for (const [cityKey, prefixes] of Object.entries(SUPPORTED_CITIES)) {
    if (prefixes.some(prefix => address.startsWith(prefix))) return cityKey;
  }
  return null;
}

function isActive(item) {
  const status = String(item.OPER_STTS || '').trim();
  return status === '사용중' || (!status.includes('중지') && !status.includes('폐'));
}

function recordTimestamp(item) {
  return String(item.DAT_UPDT_PNT || item.LAST_MDFCN_PNT || '').replace(/\D/g, '');
}

function recordIdentity(item) {
  const managementNumber = String(item.MNG_NO || '').trim();
  if (managementNumber) return managementNumber;
  return [
    String(item.FCLT_NM || '').trim(),
    addressOf(item).trim(),
    String(item.DSGN_YMD || '').trim(),
  ].join('|');
}

function latestRecords(items) {
  const records = new Map();
  for (const item of items) {
    const identity = recordIdentity(item);
    const previous = records.get(identity);
    if (!previous || recordTimestamp(item) >= recordTimestamp(previous)) {
      records.set(identity, item);
    }
  }
  return [...records.values()];
}

function statusCounts(items) {
  const counts = {};
  for (const item of items) {
    const status = String(item.OPER_STTS || '').trim() || '(없음)';
    counts[status] = (counts[status] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function optimize(item) {
  return {
    MNG_NO: item.MNG_NO,
    FCLT_NM: item.FCLT_NM,
    FCLT_SE: item.FCLT_SE,
    FCLTLOC_GRND_UDGD: item.FCLTLOC_GRND_UDGD,
    FCLT_AREA: item.FCLT_AREA,
    MAX_ACTC_PERNE: item.MAX_ACTC_PERNE,
    OPER_STTS: item.OPER_STTS,
    LCTN_WHOL_ADDR: item.LCTN_WHOL_ADDR,
    ROAD_NM_WHOL_ADDR: item.ROAD_NM_WHOL_ADDR,
    ROAD_NM_ZIP: item.ROAD_NM_ZIP,
    LAT_EPSG4326: item.LAT_EPSG4326,
    LOT_EPST4326: item.LOT_EPST4326,
    CRD_INFO_X_EPSG5179: item.CRD_INFO_X_EPSG5179,
    CRD_INFO_Y_EPSG5179: item.CRD_INFO_Y_EPSG5179,
    DAT_UPDT_PNT: item.DAT_UPDT_PNT,
    LAST_MDFCN_PNT: item.LAST_MDFCN_PNT,
    DSGN_YMD: item.DSGN_YMD,
  };
}

async function fetchPage(pageNo) {
  const url = `${API_URL}?serviceKey=${serviceKey()}&type=json&numOfRows=${NUM_OF_ROWS}&pageNo=${pageNo}`;
  let lastMessage = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': '119-helper-data-sync/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);

      const json = JSON.parse(text);
      const header = json.response?.header || json.header || {};
      const code = String(header.resultCode ?? '0');
      if (!/^0+$/.test(code)) {
        throw new Error(`API_RESULT_${code} ${header.resultMsg || ''}`.trim());
      }

      const body = json.response?.body || json.body || {};
      const rawItems = body.items?.item ?? body.items ?? [];
      return {
        items: Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [],
        totalCount: Number(body.totalCount) || 0,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await delay(300 * attempt);
    }
  }

  throw new Error(`민방위대피시설 page ${pageNo}: ${lastMessage}`);
}

function resetOutputDirectory() {
  const resolvedRoot = path.resolve(path.join(__dirname, '..', 'public', 'data'));
  const resolvedTarget = path.resolve(OUTPUT_DIR);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace unexpected directory: ${resolvedTarget}`);
  }
  if (fs.existsSync(resolvedTarget)) fs.rmSync(resolvedTarget, { recursive: true, force: true });
  fs.mkdirSync(resolvedTarget, { recursive: true });
}

function updateManifest(metadata) {
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { version: 1, datasets: {} };
  manifest.generatedAt = metadata.generatedAt;
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.civil = {
    label: '민방위 대피시설',
    path: '/data/civil/{city}.json',
    sourceUrl: SOURCE_URL,
    apiUrl: API_URL,
    sourceDate: metadata.sourceDate,
    sourceDateLabel: '원본 행 최신 갱신일',
    generatedAt: metadata.generatedAt,
    maxAgeDays: 14,
    total: metadata.total,
    upstreamTotal: metadata.upstreamTotal,
    uniqueUpstreamTotal: metadata.uniqueUpstreamTotal,
    activeUpstreamTotal: metadata.activeUpstreamTotal,
    latestStatusCounts: metadata.latestStatusCounts,
    cities: metadata.cities,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  const first = await fetchPage(1);
  const returnedPageSize = first.items.length || NUM_OF_ROWS;
  const pages = Math.max(1, Math.ceil(first.totalCount / returnedPageSize));
  const allItems = [...first.items];
  console.log(`민방위대피시설 원본 ${first.totalCount.toLocaleString()}건, ${pages}페이지`);

  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    const page = await fetchPage(pageNo);
    allItems.push(...page.items);
    if (pageNo % 5 === 0 || pageNo === pages) console.log(`다운로드 ${pageNo}/${pages}페이지`);
    await delay(100);
  }

  const uniqueItems = latestRecords(allItems);
  const latestStatusCounts = statusCounts(uniqueItems);
  const activeItems = uniqueItems.filter(isActive);
  console.log(
    `관리번호별 최신 ${uniqueItems.length.toLocaleString()}건, 상태 ${JSON.stringify(latestStatusCounts)}`,
  );
  const byCity = Object.fromEntries(Object.keys(SUPPORTED_CITIES).map(key => [key, []]));
  for (const item of activeItems) {
    const cityKey = cityKeyOf(item);
    if (cityKey) byCity[cityKey].push(optimize(item));
  }

  resetOutputDirectory();
  const cities = {};
  let total = 0;
  for (const [cityKey, items] of Object.entries(byCity)) {
    items.sort((a, b) => String(a.FCLT_NM || '').localeCompare(String(b.FCLT_NM || ''), 'ko'));
    fs.writeFileSync(path.join(OUTPUT_DIR, `${cityKey}.json`), JSON.stringify(items), 'utf8');
    cities[cityKey] = items.length;
    total += items.length;
    console.log(`${cityKey}: 사용중 ${items.length.toLocaleString()}건`);
  }

  const generatedAt = new Date().toISOString();
  updateManifest({
    generatedAt,
    sourceDate: sourceDate(uniqueItems),
    total,
    upstreamTotal: first.totalCount,
    uniqueUpstreamTotal: uniqueItems.length,
    activeUpstreamTotal: activeItems.length,
    latestStatusCounts,
    cities,
  });
  console.log(`완료: 지원 도시 사용중 대피시설 ${total.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
