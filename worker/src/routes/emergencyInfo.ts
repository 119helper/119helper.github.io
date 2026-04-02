/**
 * 소방청_구급정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyInformationService
 */

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

  const params = new URLSearchParams({ serviceKey: apiKey, type: 'json' });
  for (const key of ['pageNo', 'numOfRows', 'sido', 'fireStn', 'safeCnter', 'reportYm', 'reportYmd']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  if (!params.has('pageNo')) params.set('pageNo', '1');
  if (!params.has('numOfRows')) params.set('numOfRows', '1000');

  const res = await fetch(`${BASE}/${opName}?${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`EmergencyInfo/${opName} ${res.status}`);

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { response: { body: { items: { item: [] }, totalCount: 0 } } };
  }

  const items = data?.response?.body?.items?.item || [];
  const totalCount = data?.response?.body?.totalCount || 0;

  return { data: { items: Array.isArray(items) ? items : [items], totalCount }, cacheTtl: 3600 };
}
