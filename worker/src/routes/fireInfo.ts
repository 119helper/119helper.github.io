/**
 * 소방청_화재정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/FireInformationService
 */

const BASE = 'https://apis.data.go.kr/1661000/FireInformationService';

// 18개 오퍼레이션 매핑
const OPS: Record<string, string> = {
  'station':        'getOcByfrstFireSmrzPcnd',    // 소방관서별 화재발생현황
  'sido-summary':   'getOcBysidoFireSmrzPcnd',    // 시도단위 화재발생현황
  'sido-casualty':  'getOcBysidoFpcnd',           // 시도별 화재인명피해현황
  'casualty':       'getOcFirePcnd',              // 화재인명피해현황
  'property':       'getOcFirePrcnd',             // 화재재산피해현황
  'place':          'getOcArFireByplceFpcnd',     // 화재장소별 화재현황
  'cause':          'getOcIgntnByfctrFpcnd',      // 발화요인별 화재현황
  'heat-source':    'getOcIgntnByahsFpcnd',       // 발화열원별 화재현황
  'ignition-point': 'getOcIgntnByptFpcnd',        // 발화지점별 화재현황
  'ignition-place': 'getOcIgntnByplceFpcnd',      // 발화장소별 화재현황
  'first-material': 'getOcFrstBychlrdFpcnd',      // 최초착화물별 화재현황
  'building':       'getOcBldgStrcByfpcnd',       // 건물구조별 화재현황
  'region':         'getOcByarByfpcnd',           // 지역별 화재현황
  'vehicle':        'getOcVhclByigntnPtFpcnd',    // 차량발화지점별 화재현황
  'ship-aircraft':  'getOcShipByarplFpcnd',       // 선박항공기별 화재현황
  'building2':      'getOcStrcStrcstFpcnd',       // 건물구조별 화재현황 (유형2)
  'forest':         'getOcBywdldFpcnd',           // 임야별 화재현황
  'hazmat':         'getOcRockMnfctyPcnd',        // 위험물제조소등현황
};

export async function handleFireInfo(
  path: string, url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const segments = path.split('/');
  const opKey = segments[segments.length - 1];
  const opName = OPS[opKey];
  if (!opName) throw new Error(`Unknown fire info operation: ${opKey}`);

  const params = new URLSearchParams({ serviceKey: apiKey, type: 'json' });
  // 공통 파라미터
  for (const key of ['pageNo', 'numOfRows', 'searchStDt', 'searchEdDt', 'sido', 'fireStn']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  if (!params.has('pageNo')) params.set('pageNo', '1');
  if (!params.has('numOfRows')) params.set('numOfRows', '1000');

  const res = await fetch(`${BASE}/${opName}?${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`FireInfo/${opName} ${res.status}`);

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
