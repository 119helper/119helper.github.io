/**
 * 소방용수시설 API 프록시 (전국소방용수시설표준데이터)
 * Route: GET /api/firewater?city=서울특별시
 */

import { encodeServiceKey, parsePublicDataJson, coerceEnvelope } from './publicData';

const STATIC_FIREWATER_BASE = 'https://119helper.github.io/firewater';
const CITY_MAP: Record<string, string> = {
  seoul: '서울특별시',
  busan: '부산광역시',
  daegu: '대구광역시',
  incheon: '인천광역시',
  gwangju: '광주광역시',
  daejeon: '대전광역시',
  ulsan: '울산광역시',
  sejong: '세종특별자치시',
  jeju: '제주특별자치도',
};

async function fetchStaticFireWater(city: string): Promise<unknown> {
  const normalizedCity = CITY_MAP[city] || city;
  const staticUrl = `${STATIC_FIREWATER_BASE}/${encodeURIComponent(normalizedCity)}.json`;
  const res = await fetch(staticUrl, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });

  if (!res.ok) {
    throw new Error(`FireWater static fallback ${res.status}`);
  }

  const json = coerceEnvelope(await res.json());
  return json.response?.body?.items ?? [];
}

export async function handleFireWater(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const city = url.searchParams.get('city') || '서울특별시';

  try {
    const serviceKey = encodeServiceKey(apiKey, 'FIRE_WATER_API_KEY');
    const params = new URLSearchParams({
      pageNo: '1',
      numOfRows: '50000',
      type: 'json',
      ctprvnNm: city,
    });

    // 업스트림이 간헐적으로 525(SSL) 등을 뱉음 → http/https 번갈아 최대 3회 시도
    const paths = [
      `http://api.data.go.kr/openapi/tn_pubr_public_ffus_wtrcns_api?serviceKey=${serviceKey}&${params}`,
      `https://api.data.go.kr/openapi/tn_pubr_public_ffus_wtrcns_api?serviceKey=${serviceKey}&${params}`,
      `http://api.data.go.kr/openapi/tn_pubr_public_ffus_wtrcns_api?serviceKey=${serviceKey}&${params}`,
    ];
    let res: Response | null = null;
    let text = '';
    for (const apiUrl of paths) {
      res = await fetch(apiUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      text = await res.text();
      if (res.ok && !text.trimStart().toLowerCase().startsWith('error code:')) break;
    }
    if (!res || !res.ok) throw new Error(`FireWater API ${res?.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

    const json = parsePublicDataJson(text, 'FireWater');
    const items = json.response?.body?.items ?? [];

    return { data: items, cacheTtl: 86400 };
  } catch {
    const items = await fetchStaticFireWater(city);
    return { data: items, cacheTtl: 86400 };
  }
}
