/**
 * 소방청_구급정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyInformationService
 */

import { encodeServiceKey, fetchWithRetry, parsePublicDataJson, pickItemsAndCount } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { normalizeEmergencyHeadquarters } from './emergencyRegions';

const BASE = 'https://apis.data.go.kr/1661000/EmergencyInformationService';
const SOURCE_NAME = '소방청_구급정보서비스';

const OPS: Record<string, string> = {
  'transfer':       'getEmgPatientTransferInfo',     // 구급환자이송정보
  'patient-status': 'getEmgPatientConditionInfo',    // 구급환자상태정보
  'first-aid':      'getEmgPatientFirstaidInfo',     // 구급환자응급처치정보
  'dispatch':       'getEmgVehicleDispatchInfo',     // 구급차량출동정보
  'vehicles':       'getEmgVehicleInfo',             // 구급차량정보
  'activity':       'getEmgencyActivityInfo',        // 구급활동정보
};

export async function handleEmergencyInfo(
  path: string, url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const segments = path.split('/');
  const opKey = segments[segments.length - 1];
  const opName = OPS[opKey];
  if (!opName) throw new Error(`Unknown info operation: ${opKey}`);

  // 상세 기능마다 월 파라미터가 다르다.
  // 환자/차량출동: stmtYm(신고년월), 구급활동: gutYm(출동년월), 차량기준정보: 월 없음.
  const params = new URLSearchParams({ resultType: 'json' });
  params.set('pageNo', sanitizeNumericParam(url, 'pageNo', 1, 1000, 1));
  params.set('numOfRows', sanitizeNumericParam(url, 'numOfRows', 1, 1000, 1000));
  const headquarters = normalizeEmergencyHeadquarters(
    sanitizeStringParam(url, 'sidoHqOgidNm', 40)
      || sanitizeStringParam(url, 'sido', 40),
  );
  if (headquarters) params.set('sidoHqOgidNm', headquarters);

  const station = sanitizeStringParam(url, 'rsacGutFsttOgidNm', 40)
    || sanitizeStringParam(url, 'fireStn', 40);
  if (station) params.set('rsacGutFsttOgidNm', station);

  const legacyMonth = sanitizeStringParam(url, 'reportYm', 6)
    || sanitizeStringParam(url, 'reportYmd', 8)?.slice(0, 6);

  if (opKey === 'activity') {
    const activityMonth = sanitizeStringParam(url, 'gutYm', 6) || legacyMonth;
    if (!station || !activityMonth) {
      throw new Error('구급활동 상세 조회에는 출동소방서와 출동년월이 필요합니다.');
    }
    params.set('gutYm', activityMonth);
    for (const key of ['egrcSidoCdNm', 'egrcSiggCdNm']) {
      const value = sanitizeStringParam(url, key, 40);
      if (value) params.set(key, value);
    }
  } else if (opKey !== 'vehicles') {
    const statementMonth = sanitizeStringParam(url, 'stmtYm', 6) || legacyMonth;
    if (!station || !statementMonth) {
      throw new Error('구급 상세 조회에는 출동소방서와 신고년월이 필요합니다.');
    }
    params.set('stmtYm', statementMonth);
  }

  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const res = await fetchWithRetry(`${BASE}/${opName}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmergencyInfo/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data = parsePublicDataJson(text, `EmergencyInfo/${opName}`);
  const { items, totalCount } = pickItemsAndCount(data);

  return {
    data: {
      items,
      totalCount,
      requestedYm: params.get('stmtYm') || params.get('gutYm'),
      headquarters: headquarters || null,
      station: station || null,
      sourceName: SOURCE_NAME,
    },
    cacheTtl: 3600,
  };
}
