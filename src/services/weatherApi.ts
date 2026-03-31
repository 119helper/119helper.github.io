// 기상청 API Hub 서비스 (Full Version)
// Platform: apihub.kma.go.kr
// Vite Proxy: /api/kma → https://apihub.kma.go.kr

const API_KEY = import.meta.env.VITE_KMA_API_KEY;

// ══════════ 좌표 변환 ══════════
export function latLngToGrid(lat: number, lng: number) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
  const OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

export const CITY_GRIDS: Record<string, { nx: number; ny: number; name: string }> = {
  seoul: { nx: 60, ny: 127, name: '서울' },
  busan: { nx: 98, ny: 76, name: '부산' },
  daegu: { nx: 89, ny: 90, name: '대구' },
  incheon: { nx: 55, ny: 124, name: '인천' },
  gwangju: { nx: 58, ny: 74, name: '광주' },
  daejeon: { nx: 67, ny: 100, name: '대전' },
  ulsan: { nx: 102, ny: 84, name: '울산' },
  sejong: { nx: 66, ny: 103, name: '세종' },
  jeju: { nx: 52, ny: 38, name: '제주' },
};

// ══════════ 코드 매핑 ══════════
export const SKY_MAP: Record<string, string> = { '1': '맑음', '3': '구름많음', '4': '흐림' };
export const PTY_MAP: Record<string, string> = { '0': '없음', '1': '비', '2': '비/눈', '3': '눈', '4': '소나기' };
export const SKY_ICON: Record<string, string> = { '1': '☀️', '3': '⛅', '4': '☁️' };
export const PTY_ICON: Record<string, string> = { '0': '', '1': '🌧️', '2': '🌨️', '3': '❄️', '4': '🌦️' };

export function windDirectionText(deg: number): string {
  const dirs = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ══════════ 공통 타입 ══════════
export interface ForecastItem {
  baseDate: string; baseTime: string; category: string;
  fcstDate: string; fcstTime: string; fcstValue: string;
  obsrValue?: string;  // 초단기실황은 obsrValue 사용
  nx: number; ny: number;
}

export interface CurrentWeather {
  temperature: number; humidity: number; windSpeed: number;
  windDirection: string; sky: string; skyIcon: string;
  precipitation: string; precipType: string; precipIcon: string;
  lastUpdate: string;
}

export interface HourlyForecast {
  time: string; date: string; temp: number; sky: string; skyIcon: string;
  pop: number; precipType: string; precipIcon: string;
  humidity: number; windSpeed: number;
}

// ══════════ 발표 시각 계산 ══════════
function getBaseDateTime(type: 'short' | 'ultra') {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  const hhmm = now.getHours() * 100 + now.getMinutes();

  if (type === 'ultra') {
    let h = now.getHours();
    if (now.getMinutes() < 40) h -= 1;
    if (h < 0) { const yd = new Date(now); yd.setDate(yd.getDate() - 1); return { baseDate: `${yd.getFullYear()}${String(yd.getMonth()+1).padStart(2,'0')}${String(yd.getDate()).padStart(2,'0')}`, baseTime: '2300' }; }
    return { baseDate: `${y}${m}${d}`, baseTime: `${String(h).padStart(2, '0')}00` };
  }

  const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  let baseDate = `${y}${m}${d}`, baseTime = '2300';
  if (hhmm < 210) {
    const yd = new Date(now); yd.setDate(yd.getDate() - 1);
    baseDate = `${yd.getFullYear()}${String(yd.getMonth()+1).padStart(2,'0')}${String(yd.getDate()).padStart(2,'0')}`;
  } else {
    for (let i = baseTimes.length - 1; i >= 0; i--) {
      if (hhmm >= parseInt(baseTimes[i]) + 10) { baseTime = baseTimes[i]; break; }
    }
  }
  return { baseDate, baseTime };
}

// ══════════ JSON fetch 헬퍼 ══════════
async function fetchKMA(path: string, params: Record<string, string>): Promise<ForecastItem[]> {
  const qs = new URLSearchParams({ authKey: API_KEY, dataType: 'JSON', ...params });
  try {
    const res = await fetch(`https://apihub.kma.go.kr${path}?${qs}`);
    const data = await res.json();
    return data?.response?.body?.items?.item || [];
  } catch (e) { console.error('KMA API 호출 실패:', path, e); return []; }
}

// ══════════ 1. 초단기실황 (4.1) ══════════
export async function getUltraShortNow(nx = 60, ny = 127): Promise<ForecastItem[]> {
  const { baseDate, baseTime } = getBaseDateTime('ultra');
  return fetchKMA('/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst', {
    numOfRows: '60', pageNo: '1', base_date: baseDate, base_time: baseTime, nx: String(nx), ny: String(ny),
  });
}

// ══════════ 2. 초단기예보 (4.2) ══════════
export async function getUltraShortFcst(nx = 60, ny = 127): Promise<ForecastItem[]> {
  const { baseDate, baseTime } = getBaseDateTime('ultra');
  return fetchKMA('/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst', {
    numOfRows: '100', pageNo: '1', base_date: baseDate, base_time: baseTime, nx: String(nx), ny: String(ny),
  });
}

// ══════════ 3. 단기예보 (4.3) ══════════
export async function getShortTermFcst(nx = 60, ny = 127): Promise<ForecastItem[]> {
  const { baseDate, baseTime } = getBaseDateTime('short');
  return fetchKMA('/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst', {
    numOfRows: '1000', pageNo: '1', base_date: baseDate, base_time: baseTime, nx: String(nx), ny: String(ny),
  });
}

// ══════════ 4. 기상개황 (3.1) — 텍스트 브리핑 ══════════
export async function getWeatherBriefing(): Promise<string> {
  const stnId = '108'; // 서울 관측소
  const params = new URLSearchParams({
    authKey: API_KEY, dataType: 'JSON', numOfRows: '1', pageNo: '1', stnId,
  });
  try {
    const res = await fetch(`https://apihub.kma.go.kr/api/typ02/openApi/ForecastGribInfoService_2.0/getOverview?${params}`);
    const data = await res.json();
    const text = data?.response?.body?.items?.item?.[0]?.wfSv || '';
    return text || '기상개황 데이터를 불러올 수 없습니다.';
  } catch { return '기상개황 조회 실패'; }
}

// ══════════ 5. 중기육상예보 (중기 2.3) — 주간 날씨 ══════════
export interface MidTermForecast {
  regId: string;
  rnSt3Am: number; rnSt3Pm: number; rnSt4Am: number; rnSt4Pm: number;
  rnSt5Am: number; rnSt5Pm: number; rnSt6Am: number; rnSt6Pm: number;
  rnSt7Am: number; rnSt7Pm: number;
  wf3Am: string; wf3Pm: string; wf4Am: string; wf4Pm: string;
  wf5Am: string; wf5Pm: string; wf6Am: string; wf6Pm: string;
  wf7Am: string; wf7Pm: string;
}

export async function getMidTermLand(regId = '11B00000'): Promise<MidTermForecast | null> {
  const now = new Date();
  let h = now.getHours();
  let tmFc: string;
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  if (h >= 18) tmFc = `${y}${m}${d}1800`;
  else if (h >= 6) tmFc = `${y}${m}${d}0600`;
  else {
    const yd = new Date(now); yd.setDate(yd.getDate()-1);
    tmFc = `${yd.getFullYear()}${String(yd.getMonth()+1).padStart(2,'0')}${String(yd.getDate()).padStart(2,'0')}1800`;
  }

  const params = new URLSearchParams({
    authKey: API_KEY, dataType: 'JSON', numOfRows: '1', pageNo: '1', regId, tmFc,
  });
  try {
    const res = await fetch(`https://apihub.kma.go.kr/api/typ02/openApi/MidFcstInfoService/getMidLandFcst?${params}`);
    const data = await res.json();
    return data?.response?.body?.items?.item?.[0] || null;
  } catch { return null; }
}

// ══════════ 6. 중기기온 (중기 2.2) ══════════
export interface MidTermTemp {
  regId: string;
  taMin3: number; taMax3: number; taMin4: number; taMax4: number;
  taMin5: number; taMax5: number; taMin6: number; taMax6: number;
  taMin7: number; taMax7: number;
}

export async function getMidTermTemp(regId = '11B10101'): Promise<MidTermTemp | null> {
  const now = new Date();
  let h = now.getHours();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  let tmFc: string;
  if (h >= 18) tmFc = `${y}${m}${d}1800`;
  else if (h >= 6) tmFc = `${y}${m}${d}0600`;
  else {
    const yd = new Date(now); yd.setDate(yd.getDate()-1);
    tmFc = `${yd.getFullYear()}${String(yd.getMonth()+1).padStart(2,'0')}${String(yd.getDate()).padStart(2,'0')}1800`;
  }
  const params = new URLSearchParams({ authKey: API_KEY, dataType: 'JSON', numOfRows: '1', pageNo: '1', regId, tmFc });
  try {
    const res = await fetch(`https://apihub.kma.go.kr/api/typ02/openApi/MidFcstInfoService/getMidTa?${params}`);
    const data = await res.json();
    return data?.response?.body?.items?.item?.[0] || null;
  } catch { return null; }
}

// ══════════ 파싱 유틸 ══════════
export function parseCurrentWeather(items: ForecastItem[]): CurrentWeather {
  // 초단기실황은 obsrValue, 단기예보는 fcstValue를 사용
  const get = (cat: string) => {
    const item = items.find(i => i.category === cat);
    if (!item) return '0';
    return item.obsrValue || item.fcstValue || '0';
  };
  const pty = get('PTY');
  const sky = get('SKY') || '1';
  const wd = parseInt(get('VEC')) || 0;
  return {
    temperature: parseFloat(get('T1H')) || parseFloat(get('TMP')) || 0,
    humidity: parseInt(get('REH')) || 0,
    windSpeed: parseFloat(get('WSD')) || 0,
    windDirection: windDirectionText(wd),
    sky: SKY_MAP[sky] || '–',
    skyIcon: PTY_ICON[pty] || SKY_ICON[sky] || '☀️',
    precipitation: get('RN1') || get('PCP') || '0',
    precipType: PTY_MAP[pty] || '없음',
    precipIcon: PTY_ICON[pty] || '',
    lastUpdate: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function parseHourlyForecast(items: ForecastItem[]): HourlyForecast[] {
  const grouped: Record<string, Record<string, string>> = {};
  items.forEach(item => {
    const key = `${item.fcstDate}-${item.fcstTime}`;
    if (!grouped[key]) grouped[key] = {};
    grouped[key][item.category] = item.fcstValue;
    grouped[key]['_date'] = item.fcstDate;
    grouped[key]['_time'] = item.fcstTime;
  });

  return Object.values(grouped)
    .filter(g => g['TMP'] || g['T1H'])
    .map(g => {
      const pty = g['PTY'] || '0';
      const sky = g['SKY'] || '1';
      return {
        date: g['_date'],
        time: g['_time'],
        temp: parseFloat(g['TMP'] || g['T1H'] || '0'),
        sky: SKY_MAP[sky] || '–',
        skyIcon: PTY_ICON[pty] || SKY_ICON[sky] || '☀️',
        pop: parseInt(g['POP'] || '0'),
        precipType: PTY_MAP[pty] || '없음',
        precipIcon: PTY_ICON[pty] || '',
        humidity: parseInt(g['REH'] || '0'),
        windSpeed: parseFloat(g['WSD'] || '0'),
      };
    })
    .sort((a, b) => `${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1);
}
