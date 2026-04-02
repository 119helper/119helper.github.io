/**
 * 소방청_구급통계서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyStatisticsService
 */

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

  const params = new URLSearchParams({ serviceKey: apiKey, type: 'json' });
  // 선택적 파라미터 전달
  for (const key of ['pageNo', 'numOfRows', 'reqYm', 'sido', 'fireStn', 'safeCnter']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  if (!params.has('pageNo')) params.set('pageNo', '1');
  if (!params.has('numOfRows')) params.set('numOfRows', '1000');

  const res = await fetch(`${BASE}/${opName}?${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`EmergencyStats/${opName} ${res.status}`);

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // XML 응답인 경우 빈 배열 반환
    data = { response: { body: { items: { item: [] }, totalCount: 0 } } };
  }

  const items = data?.response?.body?.items?.item || [];
  const totalCount = data?.response?.body?.totalCount || 0;

  return { data: { items: Array.isArray(items) ? items : [items], totalCount }, cacheTtl: 3600 };
}
