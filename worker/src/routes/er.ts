/**
 * 응급의료포털 API 프록시
 * 
 * Routes:
 *   GET /api/er/beds?sido=서울특별시&gugun=   → 실시간 병상
 *   GET /api/er/list?sido=서울특별시&gugun=   → 기관 목록
 *   GET /api/er/location?lat=37.5&lng=127.0  → 위치 기반 검색
 */

const ER_BASE = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService';

export async function handleER(path: string, url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  switch (path) {
    case '/api/er/beds': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEmrrmRltmUsefulSckbdInfoInqire?serviceKey=${apiKey}&STAGE1=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
      if (gugun) erUrl += `&STAGE2=${encodeURIComponent(gugun)}`;
      
      const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      const text = await res.text();
      return { data: { xml: text }, cacheTtl: 60 }; // 1분 캐시 (실시간성 중요)
    }

    case '/api/er/list': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEgytListInfoInqire?serviceKey=${apiKey}&Q0=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
      if (gugun) erUrl += `&Q1=${encodeURIComponent(gugun)}`;

      const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      const text = await res.text();
      return { data: { xml: text }, cacheTtl: 300 }; // 5분 캐시
    }

    case '/api/er/location': {
      const lat = url.searchParams.get('lat') || '37.5665';
      const lng = url.searchParams.get('lng') || '126.9780';
      const erUrl = `${ER_BASE}/getEgytLcinfoInqire?serviceKey=${apiKey}&WGS84_LON=${lng}&WGS84_LAT=${lat}&pageNo=1&numOfRows=20`;

      const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      const text = await res.text();
      return { data: { xml: text }, cacheTtl: 60 };
    }

    case '/api/er/messages': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getEmrrmSrsillDissMsgInqire?serviceKey=${apiKey}&Q0=${encodeURIComponent(sido)}&pageNo=1&numOfRows=100`;
      if (gugun) erUrl += `&Q1=${encodeURIComponent(gugun)}`;

      const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      const text = await res.text();
      return { data: { xml: text }, cacheTtl: 60 }; // 1분 캐시
    }

    case '/api/er/severe-illness': {
      const sido = url.searchParams.get('sido') || '서울특별시';
      const gugun = url.searchParams.get('gugun') || '';
      let erUrl = `${ER_BASE}/getSrsillDissAceptncPosblInfoInqire?serviceKey=${apiKey}&STAGE1=${encodeURIComponent(sido)}&pageNo=1&numOfRows=500`;
      if (gugun) erUrl += `&STAGE2=${encodeURIComponent(gugun)}`;

      const res = await fetch(erUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
      const text = await res.text();
      return { data: { xml: text }, cacheTtl: 60 }; // 실시간성 중요
    }

    default:
      throw new Error(`Unknown ER route: ${path}`);
  }
}
