/**
 * 기상청 API Hub 프록시
 * 
 * Routes:
 *   GET /api/weather/now?nx=60&ny=127       → 초단기실황
 *   GET /api/weather/forecast?nx=60&ny=127  → 단기예보
 *   GET /api/weather/ultra?nx=60&ny=127     → 초단기예보
 *   GET /api/weather/mid-land?regId=11B00000  → 중기육상예보
 *   GET /api/weather/mid-temp?regId=11B10101  → 중기기온
 *   GET /api/weather/briefing?stnId=108     → 기상개황
 */

const BASE = 'https://apihub.kma.go.kr';

// ═══════ 발표시각 계산 ═══════

function getBaseDateTime(type: 'short' | 'ultra'): { baseDate: string; baseTime: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hhmm = now.getUTCHours() * 100 + now.getUTCMinutes();

  if (type === 'ultra') {
    let h = now.getUTCHours();
    if (now.getUTCMinutes() < 40) h -= 1;
    if (h < 0) {
      const yd = new Date(now.getTime() - 86400000);
      return {
        baseDate: `${yd.getUTCFullYear()}${String(yd.getUTCMonth() + 1).padStart(2, '0')}${String(yd.getUTCDate()).padStart(2, '0')}`,
        baseTime: '2300',
      };
    }
    return { baseDate: `${y}${m}${d}`, baseTime: `${String(h).padStart(2, '0')}00` };
  }

  // 단기예보
  const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  let baseDate = `${y}${m}${d}`;
  let baseTime = '2300';
  if (hhmm < 210) {
    const yd = new Date(now.getTime() - 86400000);
    baseDate = `${yd.getUTCFullYear()}${String(yd.getUTCMonth() + 1).padStart(2, '0')}${String(yd.getUTCDate()).padStart(2, '0')}`;
  } else {
    for (let i = baseTimes.length - 1; i >= 0; i--) {
      if (hhmm >= parseInt(baseTimes[i]) + 10) { baseTime = baseTimes[i]; break; }
    }
  }
  return { baseDate, baseTime };
}

function getMidTermFc(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = now.getUTCHours();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  if (h >= 18) return `${y}${m}${d}1800`;
  if (h >= 6) return `${y}${m}${d}0600`;
  const yd = new Date(now.getTime() - 86400000);
  return `${yd.getUTCFullYear()}${String(yd.getUTCMonth() + 1).padStart(2, '0')}${String(yd.getUTCDate()).padStart(2, '0')}1800`;
}

// ═══════ 공통 fetch ═══════

async function fetchKMA(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const qs = new URLSearchParams({ authKey: apiKey, dataType: 'JSON', ...params });
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
  if (!res.ok) throw new Error(`KMA API ${res.status}: ${res.statusText}`);
  const data: any = await res.json();
  return data?.response?.body?.items?.item || [];
}

// ═══════ Route Handler ═══════

export async function handleWeather(path: string, url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const nx = url.searchParams.get('nx') || '60';
  const ny = url.searchParams.get('ny') || '127';

  switch (path) {
    case '/api/weather/now': {
      const { baseDate, baseTime } = getBaseDateTime('ultra');
      const data = await fetchKMA(
        '/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst',
        { numOfRows: '60', pageNo: '1', base_date: baseDate, base_time: baseTime, nx, ny },
        apiKey
      );
      return { data, cacheTtl: 600 }; // 10분 캐시
    }

    case '/api/weather/ultra': {
      const { baseDate, baseTime } = getBaseDateTime('ultra');
      const data = await fetchKMA(
        '/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst',
        { numOfRows: '100', pageNo: '1', base_date: baseDate, base_time: baseTime, nx, ny },
        apiKey
      );
      return { data, cacheTtl: 600 };
    }

    case '/api/weather/forecast': {
      const { baseDate, baseTime } = getBaseDateTime('short');
      const data = await fetchKMA(
        '/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst',
        { numOfRows: '1000', pageNo: '1', base_date: baseDate, base_time: baseTime, nx, ny },
        apiKey
      );
      return { data, cacheTtl: 1800 }; // 30분 캐시
    }

    case '/api/weather/mid-land': {
      const regId = url.searchParams.get('regId') || '11B00000';
      const tmFc = getMidTermFc();
      const data = await fetchKMA(
        '/api/typ02/openApi/MidFcstInfoService/getMidLandFcst',
        { numOfRows: '1', pageNo: '1', regId, tmFc },
        apiKey
      );
      return { data, cacheTtl: 21600 }; // 6시간 캐시
    }

    case '/api/weather/mid-temp': {
      const regId = url.searchParams.get('regId') || '11B10101';
      const tmFc = getMidTermFc();
      const data = await fetchKMA(
        '/api/typ02/openApi/MidFcstInfoService/getMidTa',
        { numOfRows: '1', pageNo: '1', regId, tmFc },
        apiKey
      );
      return { data, cacheTtl: 21600 };
    }

    case '/api/weather/briefing': {
      const stnId = url.searchParams.get('stnId') || '108';
      const qs = new URLSearchParams({
        authKey: apiKey, dataType: 'JSON', numOfRows: '1', pageNo: '1', stnId,
      });
      const res = await fetch(
        `${BASE}/api/typ02/openApi/ForecastGribInfoService_2.0/getOverview?${qs}`,
        { headers: { 'User-Agent': '119-helper-worker/1.0' } }
      );
      const json: any = await res.json();
      const text = json?.response?.body?.items?.item?.[0]?.wfSv || '기상개황 데이터 없음';
      return { data: { briefing: text }, cacheTtl: 3600 };
    }

    default:
      throw new Error(`Unknown weather route: ${path}`);
  }
}
