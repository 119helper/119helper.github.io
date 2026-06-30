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

import { z } from 'zod';
import { asArray, errorMessage, isRecord } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';

const BASE = 'https://apihub.kma.go.kr';

const kmaEnvelopeSchema = z.object({
  response: z.object({
    header: z.object({
      resultCode: z.unknown().optional(),
      resultMsg: z.unknown().optional(),
    }).catchall(z.unknown()).optional(),
    body: z.object({
      items: z.object({
        item: z.unknown().optional(),
      }).catchall(z.unknown()).optional(),
    }).catchall(z.unknown()).optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());

const openMeteoSchema = z.object({
  current: z.object({
    time: z.string().optional(),
    temperature_2m: z.number().optional(),
    relative_humidity_2m: z.number().optional(),
    wind_speed_10m: z.number().optional(),
    wind_direction_10m: z.number().optional(),
    precipitation: z.number().optional(),
    weather_code: z.number().optional(),
  }).catchall(z.unknown()).optional(),
  hourly: z.object({
    time: z.array(z.string()).optional(),
    temperature_2m: z.array(z.number()).optional(),
    relative_humidity_2m: z.array(z.number()).optional(),
    wind_speed_10m: z.array(z.number()).optional(),
    wind_direction_10m: z.array(z.number()).optional(),
    precipitation_probability: z.array(z.number()).optional(),
    precipitation: z.array(z.number()).optional(),
    weather_code: z.array(z.number()).optional(),
  }).catchall(z.unknown()).optional(),
  daily: z.object({
    weather_code: z.array(z.number()).optional(),
    temperature_2m_max: z.array(z.number()).optional(),
    temperature_2m_min: z.array(z.number()).optional(),
    precipitation_probability_max: z.array(z.number()).optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());

type OpenMeteoData = z.infer<typeof openMeteoSchema>;

interface KmaNowRow {
  baseDate: string;
  baseTime: string;
  category: string;
  nx: number;
  ny: number;
  obsrValue: string;
}

interface KmaForecastRow {
  baseDate: string;
  baseTime: string;
  fcstDate: string;
  fcstTime: string;
  nx: number;
  ny: number;
  category: string;
  fcstValue: string;
}

const GRID_COORDS: Record<string, { lat: number; lng: number }> = {
  '60,127': { lat: 37.5665, lng: 126.9780 },
  '98,76': { lat: 35.1796, lng: 129.0756 },
  '89,90': { lat: 35.8714, lng: 128.6014 },
  '55,124': { lat: 37.4563, lng: 126.7052 },
  '58,74': { lat: 35.1595, lng: 126.8526 },
  '67,100': { lat: 36.3504, lng: 127.3845 },
  '102,84': { lat: 35.5384, lng: 129.3114 },
  '66,103': { lat: 36.4800, lng: 127.0000 },
  '52,38': { lat: 33.4996, lng: 126.5312 },
};

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

function isKmaSuccessCode(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  return /^0+$/.test(String(code).trim());
}

function parseKmaEnvelope(raw: unknown, source: string): z.infer<typeof kmaEnvelopeSchema> {
  const parsed = kmaEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${source}: KMA_SCHEMA_VALIDATION_ERROR`);
  }

  const header = parsed.data.response?.header;
  const resultCode = header?.resultCode;
  if (!isKmaSuccessCode(resultCode)) {
    throw new Error(`${source}: KMA_RESULT_${String(resultCode)} ${String(header?.resultMsg ?? '')}`.trim());
  }

  return parsed.data;
}

async function fetchKMA(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const qs = new URLSearchParams({ authKey: apiKey, dataType: 'JSON', ...params });
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
  if (!res.ok) throw new Error(`KMA API ${res.status}: ${res.statusText}`);
  const data = parseKmaEnvelope(await res.json(), path);
  const items = asArray(data.response?.body?.items?.item);
  if (items.length === 0) throw new Error(`${path}: KMA_EMPTY_ITEMS`);
  return items;
}

function toKmaDateTime(isoTime: string): { date: string; time: string } {
  const d = new Date(isoTime);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`,
    time: `${String(kst.getUTCHours()).padStart(2, '0')}00`,
  };
}

function weatherCodeToKma(code: number): { sky: string; pty: string } {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return { sky: '4', pty: '1' };
  if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return { sky: '4', pty: '3' };
  if ([1, 2].includes(code)) return { sky: '3', pty: '0' };
  if ([3, 45, 48].includes(code)) return { sky: '4', pty: '0' };
  return { sky: '1', pty: '0' };
}

async function fetchOpenMeteo(nx: string, ny: string): Promise<OpenMeteoData> {
  const coord = GRID_COORDS[`${nx},${ny}`] || GRID_COORDS['60,127'];
  const params = new URLSearchParams({
    latitude: String(coord.lat),
    longitude: String(coord.lng),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code',
    hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Asia/Seoul',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`OpenMeteo API ${res.status}`);
  return openMeteoSchema.parse(await res.json());
}

async function fallbackWeather(path: string, url: URL): Promise<{ data: unknown; cacheTtl: number }> {
  const nx = sanitizeNumericParam(url, 'nx', 1, 200, 60);
  const ny = sanitizeNumericParam(url, 'ny', 1, 200, 127);
  const data = await fetchOpenMeteo(nx, ny);
  const now = data.current || {};
  const nowDt = toKmaDateTime(now.time || new Date().toISOString());
  const nowSky = weatherCodeToKma(Number(now.weather_code) || 0);

  if (path === '/api/weather/now') {
    const rows: KmaNowRow[] = [
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'PTY', nx: Number(nx), ny: Number(ny), obsrValue: nowSky.pty },
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'REH', nx: Number(nx), ny: Number(ny), obsrValue: String(Math.round(Number(now.relative_humidity_2m) || 0)) },
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'RN1', nx: Number(nx), ny: Number(ny), obsrValue: String(Number(now.precipitation) || 0) },
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'T1H', nx: Number(nx), ny: Number(ny), obsrValue: String(Number(now.temperature_2m) || 0) },
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'VEC', nx: Number(nx), ny: Number(ny), obsrValue: String(Math.round(Number(now.wind_direction_10m) || 0)) },
      { baseDate: nowDt.date, baseTime: nowDt.time, category: 'WSD', nx: Number(nx), ny: Number(ny), obsrValue: String(Number(now.wind_speed_10m) || 0) },
    ];
    return {
      data: rows,
      cacheTtl: 0,
    };
  }

  if (path === '/api/weather/ultra' || path === '/api/weather/forecast') {
    const hourly = data.hourly || {};
    const times: string[] = hourly.time || [];
    const rows: KmaForecastRow[] = [];
    for (let i = 0; i < Math.min(times.length, path === '/api/weather/ultra' ? 12 : 48); i++) {
      const dt = toKmaDateTime(times[i]);
      const code = Number(hourly.weather_code?.[i]) || 0;
      const sky = weatherCodeToKma(code);
      const common = { baseDate: nowDt.date, baseTime: nowDt.time, fcstDate: dt.date, fcstTime: dt.time, nx: Number(nx), ny: Number(ny) };
      rows.push({ ...common, category: 'TMP', fcstValue: String(Number(hourly.temperature_2m?.[i]) || 0) });
      rows.push({ ...common, category: 'REH', fcstValue: String(Math.round(Number(hourly.relative_humidity_2m?.[i]) || 0)) });
      rows.push({ ...common, category: 'WSD', fcstValue: String(Number(hourly.wind_speed_10m?.[i]) || 0) });
      rows.push({ ...common, category: 'VEC', fcstValue: String(Math.round(Number(hourly.wind_direction_10m?.[i]) || 0)) });
      rows.push({ ...common, category: 'POP', fcstValue: String(Math.round(Number(hourly.precipitation_probability?.[i]) || 0)) });
      rows.push({ ...common, category: 'PCP', fcstValue: String(Number(hourly.precipitation?.[i]) || 0) });
      rows.push({ ...common, category: 'SKY', fcstValue: sky.sky });
      rows.push({ ...common, category: 'PTY', fcstValue: sky.pty });
    }
    return { data: rows, cacheTtl: 0 };
  }

  if (path === '/api/weather/mid-land') {
    const daily = data.daily || {};
    const result: Record<string, unknown> = { regId: sanitizeStringParam(url, 'regId', 12) || '11B00000' };
    for (let day = 3; day <= 7; day++) {
      const idx = day - 1;
      const sky = weatherCodeToKma(Number(daily.weather_code?.[idx]) || 0);
      const wf = sky.pty !== '0' ? '비' : sky.sky === '1' ? '맑음' : sky.sky === '3' ? '구름많음' : '흐림';
      result[`rnSt${day}Am`] = Math.round(Number(daily.precipitation_probability_max?.[idx]) || 0);
      result[`rnSt${day}Pm`] = Math.round(Number(daily.precipitation_probability_max?.[idx]) || 0);
      result[`wf${day}Am`] = wf;
      result[`wf${day}Pm`] = wf;
    }
    return { data: [result], cacheTtl: 0 };
  }

  if (path === '/api/weather/mid-temp') {
    const daily = data.daily || {};
    const result: Record<string, unknown> = { regId: sanitizeStringParam(url, 'regId', 12) || '11B10101' };
    for (let day = 3; day <= 7; day++) {
      const idx = day - 1;
      result[`taMin${day}`] = Math.round(Number(daily.temperature_2m_min?.[idx]) || 0);
      result[`taMax${day}`] = Math.round(Number(daily.temperature_2m_max?.[idx]) || 0);
    }
    return { data: [result], cacheTtl: 0 };
  }

  if (path === '/api/weather/briefing') {
    return { data: { briefing: '기상청 API Hub 키 오류로 공개 기상 예보 fallback을 표시 중입니다.' }, cacheTtl: 0 };
  }

  throw new Error(`Unknown weather route: ${path}`);
}

// ═══════ Route Handler ═══════

export async function handleWeather(path: string, url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const nx = sanitizeNumericParam(url, 'nx', 1, 200, 60);
  const ny = sanitizeNumericParam(url, 'ny', 1, 200, 127);

  try {
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
      const regId = sanitizeStringParam(url, 'regId', 12) || '11B00000';
      const tmFc = getMidTermFc();
      const data = await fetchKMA(
        '/api/typ02/openApi/MidFcstInfoService/getMidLandFcst',
        { numOfRows: '1', pageNo: '1', regId, tmFc },
        apiKey
      );
      return { data, cacheTtl: 21600 }; // 6시간 캐시
    }

    case '/api/weather/mid-temp': {
      const regId = sanitizeStringParam(url, 'regId', 12) || '11B10101';
      const tmFc = getMidTermFc();
      const data = await fetchKMA(
        '/api/typ02/openApi/MidFcstInfoService/getMidTa',
        { numOfRows: '1', pageNo: '1', regId, tmFc },
        apiKey
      );
      return { data, cacheTtl: 21600 };
    }

    case '/api/weather/briefing': {
      const stnId = sanitizeNumericParam(url, 'stnId', 1, 999, 108);
      const qs = new URLSearchParams({
        authKey: apiKey, dataType: 'JSON', numOfRows: '1', pageNo: '1', stnId,
      });
      const res = await fetch(
        `${BASE}/api/typ02/openApi/VilageFcstMsgService/getWthrSituation?${qs}`,
        { headers: { 'User-Agent': '119-helper-worker/1.0' } }
      );
      if (!res.ok) throw new Error(`KMA briefing ${res.status}: ${res.statusText}`);
      const json = parseKmaEnvelope(await res.json(), 'KMA briefing');
      const item = asArray(json.response?.body?.items?.item)[0];
      const text = isRecord(item) ? String(item.wfSv1 || item.wfSv || '기상개황 데이터 없음') : '기상개황 데이터 없음';
      return { data: { briefing: text }, cacheTtl: 3600 };
    }

    default:
      throw new Error(`Unknown weather route: ${path}`);
    }
  } catch (err) {
    console.warn(`KMA API failed, using fallback: ${errorMessage(err)}`);
    return fallbackWeather(path, url);
  }
}
