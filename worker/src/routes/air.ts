/**
 * 에어코리아 대기질 API 프록시
 * 
 * Route: GET /api/air?sido=서울
 */

import { coerceEnvelope, encodeServiceKey, fetchWithTimeout } from './publicData';
import { sanitizeStringParam } from '../middleware/cors';

export async function handleAir(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const sido = sanitizeStringParam(url, 'sido', 20) || '서울';
  const serviceKey = encodeServiceKey(apiKey, 'AIR_API_KEY');
  const params = new URLSearchParams({
    returnType: 'json',
    numOfRows: '100',
    pageNo: '1',
    sidoName: sido,
    ver: '1.0',
  });

  const res = await fetchWithTimeout(
    `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${serviceKey}&${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );

  if (!res.ok) throw new Error(`Air API ${res.status}`);
  const json = coerceEnvelope(await res.json());
  const items = json.response?.body?.items ?? [];

  return { data: items, cacheTtl: 1800 }; // 30분 캐시
}
