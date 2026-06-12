/**
 * 응급의료포털 API 프록시
 *
 * Routes:
 *   GET /api/er/beds?sido=서울특별시&gugun=   → 실시간 병상
 *   GET /api/er/list?sido=서울특별시&gugun=   → 기관 목록
 *   GET /api/er/location?lat=37.5&lng=127.0  → 위치 기반 검색
 */

import { encodeServiceKey } from './publicData';

const ER_BASE = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService';

/**
 * 업스트림 호출 + 응답 검증 (+1회 재시도)
 * - 업스트림이 간헐적으로 Cloudflare 게이트웨이 텍스트("error code: 504" 등)를 뱉는데,
 *   이걸 정상 XML처럼 감싸 반환하면 프론트가 깨진 데이터를 캐싱하게 됨 → 검증 후 재시도/에러
 */
async function fetchErXml(erUrl: string): Promise<string> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
    const text = await res.text();
    if (res.ok && text.trimStart().startsWith('<')) return text;
    lastErr = `ER upstream ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 100)}`;
  }
  throw new Error(lastErr || 'ER upstream error');
}

export async function handleER(path: string, url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = encodeServiceKey(apiKey, 'ER_API_KEY');

  switch (path) {
    case '/api/er/beds': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEmrrmRltmUsefulSckbdInfoInqire?serviceKey=${serviceKey}&STAGE1=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
      if (gugun) erUrl += `&STAGE2=${encodeURIComponent(gugun)}`;

      const text = await fetchErXml(erUrl);
      return { data: { xml: text }, cacheTtl: 60 }; // 1분 캐시 (실시간성 중요)
    }

    case '/api/er/list': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEgytListInfoInqire?serviceKey=${serviceKey}&Q0=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
      if (gugun) erUrl += `&Q1=${encodeURIComponent(gugun)}`;

      const text = await fetchErXml(erUrl);
      return { data: { xml: text }, cacheTtl: 300 }; // 5분 캐시
    }

    case '/api/er/location': {
      const lat = url.searchParams.get('lat') || '37.5665';
      const lng = url.searchParams.get('lng') || '126.9780';
      const erUrl = `${ER_BASE}/getEgytLcinfoInqire?serviceKey=${serviceKey}&WGS84_LON=${lng}&WGS84_LAT=${lat}&pageNo=1&numOfRows=20`;

      const text = await fetchErXml(erUrl);
      return { data: { xml: text }, cacheTtl: 60 };
    }

    case '/api/er/messages': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEmrrmSrsillDissMsgInqire?serviceKey=${serviceKey}&Q0=${encodeURIComponent(sido)}&pageNo=1&numOfRows=100`;
      if (gugun) erUrl += `&Q1=${encodeURIComponent(gugun)}`;

      const text = await fetchErXml(erUrl);
      return { data: { xml: text }, cacheTtl: 60 }; // 1분 캐시
    }

    case '/api/er/severe-illness': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getSrsillDissAceptncPosblInfoInqire?serviceKey=${serviceKey}&STAGE1=${encodeURIComponent(sido)}&pageNo=1&numOfRows=500`;
      if (gugun) erUrl += `&STAGE2=${encodeURIComponent(gugun)}`;

      const text = await fetchErXml(erUrl);
      return { data: { xml: text }, cacheTtl: 60 }; // 실시간성 중요
    }

    default:
      throw new Error(`Unknown ER route: ${path}`);
  }
}
