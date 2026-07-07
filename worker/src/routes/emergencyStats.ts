/**
 * 소방청_구급통계서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyStatisticsService
 */

import { encodeServiceKey, fetchWithTimeout, parsePublicDataJson, pickItemsAndCount } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';

const BASE = 'https://apis.data.go.kr/1661000/EmergencyStatisticsService';

// 오퍼레이션 매핑
const OPS: Record<string, string> = {
  'activity':       'get119EmgencyActivityStats',       // 119구급활동현황
  'traffic':        'getTrafficAccidentEmgActStats',    // 교통사고구급활동현황
  'dispatch-type':  'getEmgDispatchResultStats',        // 구급출동유형별현황
  'location':       'getTrasferPatientByPlaceStats',    // 사고장소별이송환자현황
  'age':            'getTrasferPatientByAgeGroupStats',  // 연령별이송환자현황
  'history':        'getTrasferPatientByCaseHistoryStats', // 이송환자병력현황
  'center':         'get119EmgMngCenterOprStats',       // 119구급상황관리센터운영현황
};

export async function handleEmergencyStats(
  path: string, url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  // /api/emergency/stats/{op}
  const segments = path.split('/');
  const opKey = segments[segments.length - 1]; // activity, traffic, etc.
  const opName = OPS[opKey];
  if (!opName) throw new Error(`Unknown stats operation: ${opKey}`);

  // 명세(2022 개편): serviceKey, pageNo, numOfRows, resultType, sidoHqOgidNm(시도본부), rcptYm(접수년월), rsacGutFsttOgidNm(출동소방서)
  const params = new URLSearchParams({ resultType: 'json' });
  params.set('pageNo', sanitizeNumericParam(url, 'pageNo', 1, 1000, 1));
  params.set('numOfRows', sanitizeNumericParam(url, 'numOfRows', 1, 1000, 1000));
  for (const key of ['sidoHqOgidNm', 'rcptYm', 'rsacGutFsttOgidNm']) {
    const v = sanitizeStringParam(url, key, key.endsWith('Ym') ? 6 : 40);
    if (v) params.set(key, v);
  }
  // 레거시 파라미터 호환
  const legacyYm = sanitizeStringParam(url, 'reqYm', 6);
  if (legacyYm && !params.has('rcptYm')) params.set('rcptYm', legacyYm);
  const legacySido = sanitizeStringParam(url, 'sido', 40);
  if (legacySido && !params.has('sidoHqOgidNm')) params.set('sidoHqOgidNm', legacySido);
  const legacyStn = sanitizeStringParam(url, 'fireStn', 40);
  if (legacyStn && !params.has('rsacGutFsttOgidNm')) params.set('rsacGutFsttOgidNm', legacyStn);

  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const res = await fetchWithTimeout(`${BASE}/${opName}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmergencyStats/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data = parsePublicDataJson(text, `EmergencyStats/${opName}`);
  const { items, totalCount } = pickItemsAndCount(data);

  return { data: { items, totalCount }, cacheTtl: 3600 };
}
