/**
 * 소방청_구급통계서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyStatisticsService
 */

import { encodeServiceKey, parsePublicDataJson } from './publicData';

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
  for (const key of ['pageNo', 'numOfRows', 'sidoHqOgidNm', 'rcptYm', 'rsacGutFsttOgidNm']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  // 레거시 파라미터 호환
  const legacyYm = url.searchParams.get('reqYm');
  if (legacyYm && !params.has('rcptYm')) params.set('rcptYm', legacyYm);
  const legacySido = url.searchParams.get('sido');
  if (legacySido && !params.has('sidoHqOgidNm')) params.set('sidoHqOgidNm', legacySido);
  const legacyStn = url.searchParams.get('fireStn');
  if (legacyStn && !params.has('rsacGutFsttOgidNm')) params.set('rsacGutFsttOgidNm', legacyStn);
  if (!params.has('pageNo')) params.set('pageNo', '1');
  if (!params.has('numOfRows')) params.set('numOfRows', '1000');

  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const res = await fetch(`${BASE}/${opName}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmergencyStats/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data: any = parsePublicDataJson(text, `EmergencyStats/${opName}`);

  const root = data?.response || data || {};
  const body = root.body || {};
  const rawItems = body?.items?.item ?? body?.items ?? root?.items?.item ?? root?.items ?? (Array.isArray(body) ? body : []);
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(Boolean);
  const totalCount = Number(root.totalCount ?? body.totalCount) || items.length;

  return { data: { items, totalCount }, cacheTtl: 3600 };
}
