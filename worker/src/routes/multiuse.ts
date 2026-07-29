/**
 * 다중이용업소 통계 (소방청 공식 공개자료)
 * Route: GET /api/multiuse?page=1&perPage=100
 * 
 * 기본값: 2025-09-15 공식 개별 영업장 OpenAPI의 "정상" 영업장 실시간 집계
 * 폴백: 동일 CSV를 검증해 체크인한 지역·업종별 정적 집계
 * 과거 연도: api.odcloud.kr 연도별 소방본부 집계 (2019/2023/2024)
 * 
 * 2025 Swagger: https://infuser.odcloud.kr/oas/docs?namespace=15083979/v1
 * 과거 연도 Swagger: https://infuser.odcloud.kr/oas/docs?namespace=15066545/v1
 */

import { encodeServiceKey, fetchWithRetry, isRecord, parsePublicDataJson } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { MULTIUSE_2025_AGGREGATES } from '../data/multiuse2025';

const CURRENT_MULTIUSE_UDDI = 'uddi:42865d20-be48-41cb-b9ce-95665c31a5b5';
const CURRENT_MULTIUSE_ENDPOINT =
  `https://api.odcloud.kr/api/15083979/v1/${CURRENT_MULTIUSE_UDDI}`;
const CURRENT_MULTIUSE_PER_PAGE = 1000;
const CURRENT_MULTIUSE_MAX_PAGES = 50;
const CURRENT_MULTIUSE_PAGE_BATCH = 5;

// 연도별 UDDI 엔드포인트
const MULTIUSE_ENDPOINTS: Record<string, string> = {
  '2024': 'uddi:68611b5a-b208-436c-9e32-990df1907bfe',  // 20240101
  '2023': 'uddi:f5d6c40d-88ad-43fb-9793-b9b4e6a47230',  // 20230101
  '2019': 'uddi:fb23ce80-a55f-45e5-89fe-966c42e67c97',  // 20191231
};

const CATEGORY_ALIASES: Record<string, string> = {
  '인터넷컴퓨터게임시설제공업(PC방)': 'PC방',
  노래연습장업: '노래연습장',
  고시원업: '고시원',
  '가상체험체육시설(스크린골프연습장)': '골프연습장',
  비디오물감상실업: '비디오물감상',
  '전화방업(화상대화방업)': '전화방',
  복합유통게임제공업: '복합유통업',
  '목욕장(찜질방)': '찜질방',
  제과점: '제과영업점',
  비디오물소극장업: '비디오소극장',
};

interface CurrentMultiUsePage {
  items: Record<string, unknown>[];
  matchCount: number;
}

function normalizeCategory(value: unknown): string {
  const category = String(value ?? '').trim();
  if (!category) return '업종 미분류';
  return CATEGORY_ALIASES[category] ?? category;
}

function staticCurrentRows(city: string | null): Record<string, string | number>[] {
  const rows = city
    ? MULTIUSE_2025_AGGREGATES.filter(row => row.소방본부 === city)
    : MULTIUSE_2025_AGGREGATES;
  return rows.map(row => ({ ...row }));
}

async function fetchCurrentPage(
  page: number,
  city: string,
  serviceKey: string,
): Promise<CurrentMultiUsePage> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(CURRENT_MULTIUSE_PER_PAGE),
    'cond[주소::LIKE]': city,
    'cond[영업상태::EQ]': '정상',
  });
  const res = await fetchWithRetry(
    `${CURRENT_MULTIUSE_ENDPOINT}?serviceKey=${serviceKey}&${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `MultiUse current API ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`,
    );
  }

  const json = parsePublicDataJson(text, 'MultiUse current');
  const items = Array.isArray(json.data) ? json.data.filter(isRecord) : [];
  const matchCount = Number(json.matchCount);
  if (!Number.isInteger(matchCount) || matchCount < 0) {
    throw new Error('MultiUse current: INVALID_MATCH_COUNT');
  }
  return { items, matchCount };
}

async function fetchCurrentAggregate(
  city: string,
  apiKey: string,
): Promise<Record<string, string | number>> {
  const serviceKey = encodeServiceKey(apiKey, 'MULTI_USE_API_KEY');
  const firstPage = await fetchCurrentPage(1, city, serviceKey);
  const pageCount = Math.ceil(firstPage.matchCount / CURRENT_MULTIUSE_PER_PAGE);
  if (pageCount > CURRENT_MULTIUSE_MAX_PAGES) {
    throw new Error(`MultiUse current: PAGE_LIMIT_EXCEEDED ${pageCount}`);
  }

  const pages: CurrentMultiUsePage[] = [firstPage];
  for (let start = 2; start <= pageCount; start += CURRENT_MULTIUSE_PAGE_BATCH) {
    const end = Math.min(start + CURRENT_MULTIUSE_PAGE_BATCH, pageCount + 1);
    const batch = Array.from(
      { length: end - start },
      (_, index) => fetchCurrentPage(start + index, city, serviceKey),
    );
    pages.push(...await Promise.all(batch));
  }

  const items = pages.flatMap(page => page.items);
  if (items.length !== firstPage.matchCount) {
    throw new Error(
      `MultiUse current: INCOMPLETE_ROWS ${items.length}/${firstPage.matchCount}`,
    );
  }

  const aggregate: Record<string, string | number> = {
    소방본부: city,
    연도: '2025',
  };
  for (const item of items) {
    if (String(item.영업상태 ?? '').trim() !== '정상') continue;
    const category = normalizeCategory(item.업종);
    aggregate[category] = Number(aggregate[category] ?? 0) + 1;
  }
  return aggregate;
}

export async function handleMultiUse(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const requestedYear = url.searchParams.get('year') || '2025';

  if (requestedYear === '2025') {
    const requestedCity = sanitizeStringParam(url, 'ctprvnNm', 40);
    const legacyCity = requestedCity === '전남광주통합특별시' ? '광주광역시' : requestedCity;
    const fallback = staticCurrentRows(legacyCity);

    // 임의 주소 조건으로 외부 API를 대량 호출하지 않도록 검증된 9개 지역만 실시간 집계한다.
    if (legacyCity && fallback.length === 1 && apiKey.trim()) {
      try {
        const current = await fetchCurrentAggregate(legacyCity, apiKey);
        return { data: [current], cacheTtl: 30 * 86400 };
      } catch (error) {
        console.warn(
          '[MultiUse] current API failed; serving verified 2025 aggregate',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return {
      data: fallback,
      cacheTtl: 30 * 86400,
    };
  }

  const year = Object.hasOwn(MULTIUSE_ENDPOINTS, requestedYear) ? requestedYear : '2024';
  const page = sanitizeNumericParam(url, url.searchParams.has('page') ? 'page' : 'pageNo', 1, 1000, 1);
  const perPage = sanitizeNumericParam(url, url.searchParams.has('perPage') ? 'perPage' : 'numOfRows', 1, 1000, 100);

  const uddi = MULTIUSE_ENDPOINTS[year] || MULTIUSE_ENDPOINTS['2024'];

  const serviceKey = encodeServiceKey(apiKey, 'MULTI_USE_API_KEY');
  const params = new URLSearchParams({
    page,
    perPage,
  });

  const res = await fetchWithRetry(
    `https://api.odcloud.kr/api/15066545/v1/${uddi}?serviceKey=${serviceKey}&${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`MultiUse API ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  const json = parsePublicDataJson(text, 'MultiUse');

  // odcloud 응답 형식: { currentCount, data: [...], matchCount, page, perPage, totalCount }
  const items = json.data ?? [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
