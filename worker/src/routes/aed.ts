/**
 * 국립중앙의료원 전국 AED 위치정보 조회 프록시.
 *
 * GET /api/aed/nearby?lat=35.1595&lng=126.8526&numOfRows=50&pageNo=1
 * Source: https://www.data.go.kr/data/15000652/openapi.do
 */

import { sanitizeNumericParam } from '../middleware/cors';
import { encodeServiceKey, fetchWithRetry, findPublicDataError } from './publicData';

const AED_LOCATION_URL =
  'https://apis.data.go.kr/B552657/AEDInfoInqireService/getAedLcinfoInqire';

function requiredCoordinate(url: URL, key: string, min: number, max: number): string {
  const raw = url.searchParams.get(key);
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`INVALID_COORDINATE: ${key} 값이 대한민국 좌표 범위를 벗어났습니다.`);
  }
  return String(value);
}
export async function handleAed(
  url: URL,
  apiKey: string,
): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = encodeServiceKey(apiKey, 'PUBLIC_DATA_API_KEY/ER_API_KEY');
  const lat = requiredCoordinate(url, 'lat', 33, 39);
  const lng = requiredCoordinate(url, 'lng', 124, 132);
  const pageNo = sanitizeNumericParam(url, 'pageNo', 1, 1000, 1);
  const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 100, 50);

  const upstream = `${AED_LOCATION_URL}?serviceKey=${serviceKey}`
    + `&WGS84_LON=${encodeURIComponent(lng)}`
    + `&WGS84_LAT=${encodeURIComponent(lat)}`
    + `&pageNo=${pageNo}&numOfRows=${numOfRows}`;

  const response = await fetchWithRetry(upstream, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AED API ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  const apiError = findPublicDataError(text);
  if (apiError) throw new Error(`AED: ${apiError}`);
  if (!text.trimStart().startsWith('<')) {
    throw new Error(`AED: INVALID_XML ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }

  return { data: { xml: text }, cacheTtl: 300 };
}
