/**
 * 소방청_화재정보서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/FireInformationService
 */

import { encodeServiceKey, parsePublicDataJson, pickItemsAndCount } from './publicData';

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

  // 2026-03 개편 명세: serviceKey, pageNo, numOfRows, resultType(xml/json), ocrn_ymd(발생일자, 필수)
  const params = new URLSearchParams({ resultType: 'json' });
  for (const key of ['pageNo', 'numOfRows', 'ocrn_ymd']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }
  // 레거시 호환: searchStDt가 오면 발생일자로 사용
  if (!params.has('ocrn_ymd')) {
    const legacy = url.searchParams.get('searchStDt');
    if (legacy) params.set('ocrn_ymd', legacy);
  }
  // 기본값: 어제 (일간 업데이트 데이터)
  if (!params.has('ocrn_ymd')) {
    const d = new Date(Date.now() + 9 * 3600_000 - 86400_000); // KST 어제
    params.set('ocrn_ymd', `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  if (!params.has('pageNo')) params.set('pageNo', '1');
  if (!params.has('numOfRows')) params.set('numOfRows', '1000');

  const serviceKey = encodeServiceKey(apiKey, 'FIRE_INFO_API_KEY');
  const res = await fetch(`${BASE}/${opName}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FireInfo/${opName} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  // 응답 구조 방어적 파싱 (response 래핑형 / 평탄형 모두 지원)
  const data = parsePublicDataJson(text, `FireInfo/${opName}`);
  const { items, totalCount } = pickItemsAndCount(data);

  return { data: { items, totalCount }, cacheTtl: 3600 };
}
