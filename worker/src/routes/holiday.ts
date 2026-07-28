/**
 * 공휴일 API 프록시
 * Route: GET /api/holiday?year=2026&month=4
 */

import { encodeServiceKey, fetchWithRetry, findPublicDataError } from './publicData';

export async function handleHoliday(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const year = url.searchParams.get('year') || String(new Date().getFullYear());
  const month = (url.searchParams.get('month') || '1').padStart(2, '0');

  // 키가 인코딩/디코딩 어느 형태로 저장돼 있어도 정확히 1회만 인코딩되도록 정규화
  const serviceKey = encodeServiceKey(apiKey, 'HOLIDAY_API_KEY');
  const apiUrl = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${serviceKey}&solYear=${year}&solMonth=${month}&numOfRows=30`;

  const res = await fetchWithRetry(apiUrl, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Holiday API ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  // 인증 에러 XML(returnReasonCode 등)을 정상 응답처럼 캐시하지 않도록 표면화
  const upstreamError = findPublicDataError(text);
  if (upstreamError) throw new Error(`Holiday: ${upstreamError}`);

  return { data: { xml: text }, cacheTtl: 604800 }; // 7일 캐시
}
