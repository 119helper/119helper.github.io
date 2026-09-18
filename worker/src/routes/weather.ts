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
import { asArray, encodeServiceKey, errorMessage, fetchWithTimeout, isRecord } from './publicData';
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

// ═══════ 기상청 격자(nx, ny) → 위경도 (Lambert Conformal Conic 역변환) ═══════
// 프론트의 latLngToGrid와 같은 상수를 쓰며, 폴백 조회 좌표를 요청 격자에 맞춘다.
const GRID_PROJECTION = (() => {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olat = OLAT * DEGRAD;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2))
    / Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
  const sf = (Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;
  const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
  return { re, sn, sf, ro, olon: OLON * DEGRAD, xo: 43, yo: 136 };
})();

export function gridToLatLng(nx: number, ny: number): { lat: number; lng: number } {
  const { re, sn, sf, ro, olon, xo, yo } = GRID_PROJECTION;
  const xn = nx - xo;
  const yn = ro - ny + yo;
  let ra = Math.hypot(xn, yn);
  if (sn < 0) ra = -ra;
  const alat = 2.0 * Math.atan(Math.pow((re * sf) / ra, 1.0 / sn)) - Math.PI * 0.5;
  let theta = 0;
  if (xn !== 0) {
    theta = yn === 0 ? (xn < 0 ? -Math.PI * 0.5 : Math.PI * 0.5) : Math.atan2(xn, yn);
  }
  const alon = theta / sn + olon;
  return { lat: alat * 180.0 / Math.PI, lng: alon * 180.0 / Math.PI };
}

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
  const authKey = encodeServiceKey(apiKey, 'KMA_API_KEY');
  const qs = new URLSearchParams({ dataType: 'JSON', ...params });
  const url = `${BASE}${path}?authKey=${authKey}&${qs}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
  if (!res.ok) throw new Error(`KMA API ${res.status}: ${res.statusText}`);
  const data = parseKmaEnvelope(await res.json(), path);
  const items = asArray(data.response?.body?.items?.item);
  if (items.length === 0) throw new Error(`${path}: KMA_EMPTY_ITEMS`);
  return items;
}

// Open-Meteo는 timezone=Asia/Seoul이면 오프셋 없는 현지 시각('YYYY-MM-DDTHH:mm')을 준다.
// Worker는 UTC로 동작하므로 Date로 해석하지 않고 문자열 그대로 KST로 읽는다.
const KST_LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function currentKstLocalTime(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function toKmaDateTime(kstLocalTime: string): { date: string; time: string } {
  const match = kstLocalTime.match(KST_LOCAL_TIME) ?? currentKstLocalTime().match(KST_LOCAL_TIME)!;
  return { date: `${match[1]}${match[2]}${match[3]}`, time: `${match[4]}00` };
}

function weatherCodeToKma(code: number): { sky: string; pty: string } {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return { sky: '4', pty: '1' };
  if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return { sky: '4', pty: '3' };
  if ([1, 2].includes(code)) return { sky: '3', pty: '0' };
  if ([3, 45, 48].includes(code)) return { sky: '4', pty: '0' };
  return { sky: '1', pty: '0' };
}

async function fetchOpenMeteo(nx: string, ny: string): Promise<OpenMeteoData> {
  const coord = gridToLatLng(Number(nx), Number(ny));
  const params = new URLSearchParams({
    latitude: coord.lat.toFixed(4),
    longitude: coord.lng.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code',
    hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    // 기상청 WSD와 같은 m/s로 받는다(기본값은 km/h).
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    // daily[0]이 오늘이므로 중기예보 7일 후(daily[7])까지 받으려면 8일이 필요하다.
    forecast_days: '8',
  });
  const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {
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
  const nowLocal = now.time && KST_LOCAL_TIME.test(now.time) ? now.time : currentKstLocalTime();
  const nowDt = toKmaDateTime(nowLocal);
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
    // hourly는 오늘 00시부터 시작하므로 현재 시각의 정시부터 잘라낸다.
    const currentHour = `${nowLocal.slice(0, 13)}:00`;
    const startIdx = times.findIndex(time => time >= currentHour);
    const hours = path === '/api/weather/ultra' ? 12 : 48;
    const endIdx = startIdx < 0 ? 0 : Math.min(times.length, startIdx + hours);
    for (let i = Math.max(startIdx, 0); i < endIdx; i++) {
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
      const idx = day; // daily[0] = 오늘, 화면은 'N일 후'를 오늘+N으로 표시한다.
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
      const idx = day; // daily[0] = 오늘, 화면은 'N일 후'를 오늘+N으로 표시한다.
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
      const authKey = encodeServiceKey(apiKey, 'KMA_API_KEY');
      const qs = new URLSearchParams({
        dataType: 'JSON', numOfRows: '1', pageNo: '1', stnId,
      });
      const res = await fetchWithTimeout(
        `${BASE}/api/typ02/openApi/VilageFcstMsgService/getWthrSituation?authKey=${authKey}&${qs}`,
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
