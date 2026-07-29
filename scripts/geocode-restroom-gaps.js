import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'public',
  'data',
  'restroom-geocoded-coordinates.json',
);

const INPUT_PATH = process.env.RESTROOM_GEOCODE_GAPS_PATH || '';
const OUTPUT_PATH = path.resolve(process.env.RESTROOM_GEOCODE_OUTPUT_PATH || DEFAULT_OUTPUT_PATH);
const KAKAO_KEY = (process.env.KAKAO_MAP_JS_KEY || process.env.VITE_KAKAO_MAP_KEY || '').trim();
const KAKAO_ORIGIN = process.env.KAKAO_MAP_ORIGIN || 'https://119.teemozipsa.com';
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;

const CITY_BOUNDS = {
  gwangju: { minLat: 34.95, maxLat: 35.35, minLng: 126.55, maxLng: 127.05 },
  incheon: { minLat: 37.0, maxLat: 38.1, minLng: 124.4, maxLng: 126.95 },
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function kakaoHeader() {
  const origin = encodeURIComponent(new URL(KAKAO_ORIGIN).origin);
  return `sdk/4.5.13 os/javascript lang/ko-KR device/Node origin/${origin}`;
}

function candidateAddresses(item) {
  const candidates = [item.addr, item.roadAddr, item.lotAddr].filter(Boolean);
  if (item.city === 'gwangju') {
    candidates.push(...candidates.map(address =>
      address.replace(/^전남광주통합특별시/, '광주광역시')
    ));
  }
  if (item.city === 'incheon') {
    const { district } = item;
    const legacyDistrict = district === '영종구'
      ? '중구'
      : district === '서해구' || district === '검단구'
        ? '서구'
        : '';
    if (legacyDistrict) {
      candidates.push(...candidates.map(address =>
        address.replace(
          new RegExp(`^인천광역시\\s+${district}`),
          `인천광역시 ${legacyDistrict}`,
        )
      ));
    }
  }
  return [...new Set(candidates)];
}

function isInsideCity(city, lat, lng) {
  const bounds = CITY_BOUNDS[city];
  return bounds
    && lat >= bounds.minLat
    && lat <= bounds.maxLat
    && lng >= bounds.minLng
    && lng <= bounds.maxLng;
}

async function fetchSearch(type, query) {
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${type}.json`);
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('size', '5');

  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_KEY}`,
          KA: kakaoHeader(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (response.status !== 429 && response.status < 500) break;
      } else {
        const data = JSON.parse(text);
        return Array.isArray(data.documents) ? data.documents : [];
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 3) await delay(250 * attempt);
  }
  throw new Error(lastError || '주소 검색 실패');
}

async function geocodeAddress(item) {
  for (const query of candidateAddresses(item)) {
    const documents = await fetchSearch('address', query);
    const match = documents
      .map(document => ({
        lat: Number(document.y),
        lng: Number(document.x),
      }))
      .find(point =>
        Number.isFinite(point.lat)
        && Number.isFinite(point.lng)
        && isInsideCity(item.city, point.lat, point.lng)
      );
    if (match) return match;
  }

  const cityName = item.city === 'gwangju' ? '광주' : '인천';
  const keywordQueries = [
    `${cityName} ${item.district} ${item.nm}`,
    `${item.district} ${item.nm}`,
  ];
  for (const query of keywordQueries) {
    const documents = await fetchSearch('keyword', query);
    const match = documents
      .filter(document => {
        const matchedAddress = `${document.road_address_name || ''} ${document.address_name || ''}`;
        return matchedAddress.includes(item.district)
          || (item.city === 'incheon'
            && item.district === '검단구'
            && matchedAddress.includes('서구'))
          || (item.city === 'incheon'
            && item.district === '서해구'
            && matchedAddress.includes('서구'));
      })
      .map(document => ({
        lat: Number(document.y),
        lng: Number(document.x),
      }))
      .find(point =>
        Number.isFinite(point.lat)
        && Number.isFinite(point.lng)
        && isInsideCity(item.city, point.lat, point.lng)
      );
    if (match) return match;
  }
  return null;
}

async function mapWithConcurrency(items, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
      await delay(20);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

async function main() {
  if (!INPUT_PATH) {
    throw new Error('RESTROOM_GEOCODE_GAPS_PATH 환경변수가 필요합니다.');
  }
  if (!KAKAO_KEY) {
    throw new Error('KAKAO_MAP_JS_KEY 또는 VITE_KAKAO_MAP_KEY 환경변수가 필요합니다.');
  }

  const input = JSON.parse(fs.readFileSync(path.resolve(INPUT_PATH), 'utf8'));
  const gaps = Array.isArray(input.items) ? input.items : [];
  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    : { items: [] };
  const existingItems = Array.isArray(existing.items) ? existing.items : [];
  const coordinates = new Map(
    existingItems
      .filter(item => item.city && item.addr)
      .map(item => [
        `${item.city}|${item.addr}`,
        { lat: Number(item.lat), lng: Number(item.lng) },
      ]),
  );
  const uniqueByAddress = new Map();
  for (const gap of gaps) {
    const key = `${gap.city}|${gap.addr}`;
    if (!coordinates.has(key) && !uniqueByAddress.has(key)) uniqueByAddress.set(key, gap);
  }
  const unique = [...uniqueByAddress.values()];
  console.log(`주소 ${unique.length.toLocaleString()}개를 지오코딩합니다. (시설 ${gaps.length.toLocaleString()}건)`);

  let completed = 0;
  const resolved = await mapWithConcurrency(unique, async item => {
    let coordinate = null;
    try {
      coordinate = await geocodeAddress(item);
    } catch {
      // 개별 실패는 전체 작업을 중단하지 않고 마지막에 집계한다.
    }
    completed += 1;
    if (completed % 100 === 0 || completed === unique.length) {
      console.log(`지오코딩 ${completed.toLocaleString()}/${unique.length.toLocaleString()}`);
    }
    return { key: `${item.city}|${item.addr}`, coordinate };
  });

  for (const result of resolved) {
    coordinates.set(result.key, result.coordinate);
  }
  const merged = new Map(
    existingItems.map(item => [String(item.id), item]),
  );

  let matched = 0;
  for (const gap of gaps) {
    const coordinate = coordinates.get(`${gap.city}|${gap.addr}`);
    if (!coordinate) continue;
    matched += 1;
    merged.set(String(gap.id), {
      id: String(gap.id),
      nm: String(gap.nm),
      addr: String(gap.addr),
      lat: coordinate.lat,
      lng: coordinate.lng,
      city: gap.city,
      district: gap.district,
    });
  }

  const generatedAt = new Date().toISOString();
  const items = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    version: 1,
    source: '행정안전부 공중화장실 주소 + Kakao Maps 주소 검색 좌표',
    sourceUrl: 'https://www.data.go.kr/data/15012892/standard.do',
    geocoder: 'https://dapi.kakao.com/v2/local/search/address.json',
    generatedAt,
    total: items.length,
    items,
  }), 'utf8');

  console.log(`완료: 시설 ${matched.toLocaleString()}/${gaps.length.toLocaleString()}건 좌표 복원, 누적 ${items.length.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
