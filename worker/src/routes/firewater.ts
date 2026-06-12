/**
 * 소방용수시설 API 프록시 (전국소방용수시설표준데이터)
 * Route: GET /api/firewater?city=서울특별시
 */

import { encodeServiceKey, parsePublicDataJson } from './publicData';

export async function handleFireWater(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const city = url.searchParams.get('city') || '서울특별시';
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

  const json: any = parsePublicDataJson(text, 'FireWater');
  const items = json?.response?.body?.items || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 엣지 캐시
}
