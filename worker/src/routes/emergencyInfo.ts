/**
 * 소방청_구급정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyInformationService
 */

import { encodeServiceKey, parsePublicDataJson } from './publicData';

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
  for (const key of ['pageNo', 'numOfRows', 'sidoHqOgidNm', 'stmtYm', 'rsacGutFsttOgidNm']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  // 레거시 파라미터 호환
  const legacyYm = url.searchParams.get('reportYm') || url.searchParams.get('reportYmd')?.slice(0, 6);
  if (legacyYm && !params.has('stmtYm')) params.set('stmtYm', legacyYm);
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
  if (!res.ok) throw new Error(`EmergencyInfo/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data: any = parsePublicDataJson(text, `EmergencyInfo/${opName}`);

  const root = data?.response || data || {};
  const body = root.body || {};
  const rawItems = body?.items?.item ?? body?.items ?? root?.items?.item ?? root?.items ?? (Array.isArray(body) ? body : []);
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(Boolean);
  const totalCount = Number(root.totalCount ?? body.totalCount) || items.length;

  return { data: { items, totalCount }, cacheTtl: 3600 };
}
