/**
 * 소방청_구급정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyInformationService
 */

import { encodeServiceKey, fetchWithTimeout, parsePublicDataJson, pickItemsAndCount } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';

const BASE = 'https://apis.data.go.kr/1661000/EmergencyInformationService';

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

  // 명세(2022 개편): serviceKey, pageNo, numOfRows, resultType, sidoHqOgidNm(시도본부), stmtYm(신고년월), rsacGutFsttOgidNm(출동소방서)
  const params = new URLSearchParams({ resultType: 'json' });
  params.set('pageNo', sanitizeNumericParam(url, 'pageNo', 1, 1000, 1));
  params.set('numOfRows', sanitizeNumericParam(url, 'numOfRows', 1, 1000, 1000));
  for (const key of ['sidoHqOgidNm', 'stmtYm', 'rsacGutFsttOgidNm']) {
    const v = sanitizeStringParam(url, key, key.endsWith('Ym') ? 6 : 40);
    if (v) params.set(key, v);
  }
  // 레거시 파라미터 호환
  const legacyYm = sanitizeStringParam(url, 'reportYm', 6) || sanitizeStringParam(url, 'reportYmd', 8)?.slice(0, 6);
  if (legacyYm && !params.has('stmtYm')) params.set('stmtYm', legacyYm);
  const legacySido = sanitizeStringParam(url, 'sido', 40);
  if (legacySido && !params.has('sidoHqOgidNm')) params.set('sidoHqOgidNm', legacySido);
  const legacyStn = sanitizeStringParam(url, 'fireStn', 40);
  if (legacyStn && !params.has('rsacGutFsttOgidNm')) params.set('rsacGutFsttOgidNm', legacyStn);

  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const res = await fetchWithTimeout(`${BASE}/${opName}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmergencyInfo/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data = parsePublicDataJson(text, `EmergencyInfo/${opName}`);
  const { items, totalCount } = pickItemsAndCount(data);

  return { data: { items, totalCount }, cacheTtl: 3600 };
}
