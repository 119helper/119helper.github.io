import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'firewater');
const API_KEY = process.env.FIRE_WATER_API_KEY || process.env.PUBLIC_DATA_API_KEY;
const SOURCE_DATE_OVERRIDE = process.env.FIREWATER_SOURCE_DATE || '';
const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_ffus_wtrcns_api';
const NUM_OF_ROWS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const FACILITY_TYPE_BY_CODE = {
  '1': '소화전',
  '01': '소화전',
  '2': '소화전',
  '02': '소화전',
  '3': '급수탑',
  '03': '급수탑',
  '4': '저수조',
  '04': '저수조',
  '5': '소화전',
  '05': '소화전',
  '6': '비상소화장치',
  '06': '비상소화장치',
};

const CITIES = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '제주특별자치도',
];

const SPLIT_CITIES = new Set(['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시']);

function encodeServiceKey(key) {
  const value = key?.trim();
  if (!value) {
    throw new Error('FIRE_WATER_API_KEY 또는 PUBLIC_DATA_API_KEY 환경변수가 필요합니다.');
  }
  return /%[0-9A-Fa-f]{2}/.test(value) ? value : encodeURIComponent(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeType(item) {
  const raw = String(item.fcltySeNm || item.fcltyKndNm || item.fcltyTyNm || '').trim();
  if (raw.includes('비상소화')) return '비상소화장치';
  if (raw.includes('급수탑')) return '급수탑';
  if (raw.includes('저수조')) return '저수조';
  if (raw.includes('소화전')) return '소화전';
  return FACILITY_TYPE_BY_CODE[String(item.fcltySeCode || '').trim()] || raw;
}

function isWaterTowerType(item) {
  const type = normalizeType(item);
  return type === '급수탑' || type === '저수조';
}

function isHydrantType(item) {
  const type = normalizeType(item);
  return type === '소화전' || type === '비상소화장치';
}

function sourceDateOf(item) {
  return String(
    item.referenceDate ||
    item.dataStdde ||
    item.lastUpdtDt ||
    item.데이터기준일자 ||
    '',
  ).trim();
}

function inferSourceDate(items) {
  if (SOURCE_DATE_OVERRIDE) return SOURCE_DATE_OVERRIDE;
  const dates = items.map(sourceDateOf).filter(Boolean).sort();
  return dates.at(-1) || null;
}

function envelope(items, metadata) {
  return {
    metadata,
    response: {
      body: {
        items,
        totalCount: items.length,
      },
    },
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

async function fetchPage(city, pageNo) {
  const url = `${BASE_URL}?serviceKey=${encodeServiceKey(API_KEY)}&type=json&ctprvnNm=${encodeURIComponent(city)}&numOfRows=${NUM_OF_ROWS}&pageNo=${pageNo}`;
  let lastMessage = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': '119-helper-data-sync/2.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`JSON 응답이 아닙니다. ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
      }

      const header = json.response?.header || json.header || {};
      const resultCode = String(header.resultCode || '00');
      if (!/^0+$/.test(resultCode)) {
        throw new Error(`API_RESULT_${resultCode} ${header.resultMsg || ''}`.trim());
      }

      const body = json.response?.body || json.body || {};
      const rawItems = body.items?.item ?? body.items ?? body.item ?? [];
      return {
        items: asArray(rawItems),
        totalCount: Number(body.totalCount) || 0,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }

  throw new Error(`${city} page ${pageNo}: ${lastMessage}`);
}

async function fetchCity(city) {
  const first = await fetchPage(city, 1);
  const totalCount = first.totalCount || first.items.length;
  const returnedPageSize = first.items.length || NUM_OF_ROWS;
  const totalPages = Math.max(1, Math.ceil(totalCount / returnedPageSize));
  const allItems = [...first.items];

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    const page = await fetchPage(city, pageNo);
    allItems.push(...page.items);
    if (pageNo % 10 === 0 || pageNo === totalPages) {
      console.log(`${city}: 다운로드 ${pageNo}/${totalPages}페이지`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  if (allItems.length !== totalCount) {
    throw new Error(`${city}: API 총계 ${totalCount.toLocaleString()}건과 수집 ${allItems.length.toLocaleString()}건이 다릅니다.`);
  }

  return allItems.map(item => ({
    ...item,
    fcltySeNm: normalizeType(item),
  }));
}

function cityMetadata(city, items, district) {
  return {
    dataset: '전국소방용수시설표준데이터',
    sourceUrl: 'https://www.data.go.kr/data/15034538/standard.do',
    city,
    district,
    sourceDate: inferSourceDate(items),
    generatedAt: new Date().toISOString(),
    total: items.length,
    hydrants: items.filter(isHydrantType).length,
    waterTowers: items.filter(isWaterTowerType).length,
  };
}

function writeSplitCity(city, items, cityMeta) {
  const cityDir = path.join(OUTPUT_DIR, city);
  const resolvedRoot = path.resolve(OUTPUT_DIR);
  const resolvedTarget = path.resolve(cityDir);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace unexpected directory: ${resolvedTarget}`);
  }
  if (fs.existsSync(cityDir)) {
    fs.rmSync(cityDir, { recursive: true, force: true });
  }
  fs.mkdirSync(cityDir, { recursive: true });

  const byDistrict = new Map();
  for (const item of items) {
    const district = String(item.signguNm || item.sigunguNm || '기타').trim() || '기타';
    if (!byDistrict.has(district)) byDistrict.set(district, []);
    byDistrict.get(district).push(item);
  }

  const districts = {};
  for (const [district, districtItems] of [...byDistrict.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko-KR'))) {
    districts[district] = districtItems.length;
    writeJson(
      path.join(cityDir, `${district}.json`),
      envelope(districtItems, cityMetadata(city, districtItems, district)),
    );
  }

  const index = {
    total: items.length,
    districts,
    hydrants: cityMeta.hydrants,
    waterTowers: cityMeta.waterTowers,
    metadata: cityMeta,
  };
  writeJson(path.join(cityDir, 'index.json'), index);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dataset: '전국소방용수시설표준데이터',
    sourceUrl: 'https://www.data.go.kr/data/15034538/standard.do',
    maxAgeDays: 120,
    cities: {},
  };

  for (const city of CITIES) {
    console.log(`Fetching ${city}...`);
    const items = await fetchCity(city);
    const meta = cityMetadata(city, items);
    manifest.cities[city] = meta;

    writeJson(path.join(OUTPUT_DIR, `${city}.json`), envelope(items, meta));
    if (SPLIT_CITIES.has(city)) writeSplitCity(city, items, meta);

    console.log(`Saved ${city}: ${items.length.toLocaleString()} records`);
  }

  writeJson(path.join(OUTPUT_DIR, 'manifest.json'), manifest);
  console.log('Firewater sync complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
