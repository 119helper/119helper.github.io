/**
 * 119 Helper — 통합 API 클라이언트
 *
 * 모든 외부 API 호출은 Cloudflare Worker를 통해 프록시됩니다.
 * 프론트엔드에는 API 키가 존재하지 않습니다.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';

const API_TIMEOUT_MS = 15_000; // 15초 타임아웃

function humanizeApiError(status: number, body: string): string {
  if (status === 502) return 'API 서비스 승인 대기 중이거나 공공데이터 서버 점검 중입니다.';
  if (status === 520) return '공공데이터 서버 연결 오류입니다. 잠시 후 다시 시도해주세요.';
  if (status === 403) return 'API 접근이 거부되었습니다. 서비스 키를 확인하세요.';
  if (status === 429) return 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  if (status >= 500) return `공공데이터 서버 오류 (${status})`;
  return `API 오류 (${status}): ${body}`;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(humanizeApiError(res.status, body));
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('API 응답 시간 초과 (15초). 공공데이터 서버가 응답하지 않습니다.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetchXml(path: string, params?: Record<string, string>): Promise<string> {
  const data = await apiFetch<{ xml: string }>(path, params);
  return data.xml;
}

// ═══════ 날씨 ═══════

export async function fetchWeatherNow(nx: number, ny: number) {
  return apiFetch<any[]>('/api/weather/now', { nx: String(nx), ny: String(ny) });
}

export async function fetchWeatherUltra(nx: number, ny: number) {
  return apiFetch<any[]>('/api/weather/ultra', { nx: String(nx), ny: String(ny) });
}

export async function fetchWeatherForecast(nx: number, ny: number) {
  return apiFetch<any[]>('/api/weather/forecast', { nx: String(nx), ny: String(ny) });
}

export async function fetchMidLand(regId: string) {
  return apiFetch<any[]>('/api/weather/mid-land', { regId });
}

export async function fetchMidTemp(regId: string) {
  return apiFetch<any[]>('/api/weather/mid-temp', { regId });
}

export async function fetchWeatherBriefing(stnId: string) {
  return apiFetch<{ briefing: string }>('/api/weather/briefing', { stnId });
}

// ═══════ 대기질 ═══════

export async function fetchAirQuality(sido: string) {
  return apiFetch<any[]>('/api/air', { sido });
}

// ═══════ 응급실 ═══════

export async function fetchERBeds(sido: string, gugun?: string) {
  return apiFetchXml('/api/er/beds', { sido, gugun: gugun || '' });
}

export async function fetchERList(sido: string, gugun?: string) {
  return apiFetchXml('/api/er/list', { sido, gugun: gugun || '' });
}

export async function fetchERMessages(sido: string, gugun?: string) {
  return apiFetchXml('/api/er/messages', { sido, gugun: gugun || '' });
}

export async function fetchERSevereIllness(sido: string, gugun?: string) {
  return apiFetchXml('/api/er/severe-illness', { sido, gugun: gugun || '' });
}

// ═══════ 건축물대장 ═══════

export async function fetchBuildingInfo(params: {
  sigunguCd: string; bjdongCd: string; platGbCd: string; bun: string; ji: string;
}) {
  return apiFetch<any[]>('/api/building', params);
}

// ═══════ 소방용수 ═══════

export async function fetchFireWater(city: string) {
  return apiFetch<any[]>('/api/firewater', { city });
}

// ═══════ 공휴일 ═══════

export async function fetchHolidays(year: number, month: number) {
  return apiFetchXml('/api/holiday', { year: String(year), month: String(month) });
}

// ═══════ 설정 (카카오맵 키) ═══════

export async function fetchConfig() {
  return apiFetch<{ kakaoMapKey: string }>('/api/config');
}

// ═══════ 대피소 (지진해일) ═══════

export async function fetchShelters(ctprvnNm: string, signguNm?: string, numOfRows = '100', pageNo = '1') {
  return apiFetch<any[]>('/api/shelter', { ctprvnNm, signguNm: signguNm || '', numOfRows, pageNo });
}

// ═══════ 다중이용업소 ═══════

export async function fetchMultiUseFacilities(ctprvnNm: string, signguNm?: string) {
  return apiFetch<any[]>('/api/multiuse', { ctprvnNm, signguNm: signguNm || '' });
}

// ═══════ 구급통계 ═══════

export async function fetchEmergencyStats(op: string, params?: Record<string, string>) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/emergency/stats/${op}`, params);
}

// ═══════ 구급정보 ═══════

export async function fetchEmergencyInfo(op: string, params?: Record<string, string>) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/emergency/info/${op}`, params);
}

// ═══════ 화재정보 ═══════

export async function fetchFireInfo(op: string, params?: Record<string, string>) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/fire/${op}`, params);
}

// ═══════ 특정소방대상물 (숙박시설 + 소방시설) ═══════

export async function fetchFireObjectAccom(ctpvNm: string, numOfRows = '100', pageNo = '1') {
  return apiFetch<{ items: any[]; totalCount: number }>('/api/fire-object/accom', { ctpvNm, numOfRows, pageNo });
}

export async function fetchFireObjectFireSys(ctpvNm: string, numOfRows = '100', pageNo = '1') {
  return apiFetch<{ items: any[]; totalCount: number }>('/api/fire-object/fire-sys', { ctpvNm, numOfRows, pageNo });
}

// ═══════ 지역별 화재피해 현황 ═══════

export interface FireDamageItem {
  ocrnYmdhh: string;       // 발생일자
  gutFsttOgidNm: string;   // 출동소방서
  deadPercnt: string;       // 사망자 인원수
  injrdprPercnt: string;    // 부상자 인원수
  prptDmgSbttAmt: string;  // 재산피해소계금액(천원)
  lawAddrName: string;      // 법정동주소(읍면동)
}

export interface FireDamageResponse {
  items: FireDamageItem[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  error?: string;
  errorCode?: string;
}

export async function fetchFireDamage(params?: {
  pageNo?: string;
  numOfRows?: string;
  lawAddrName?: string;
}): Promise<FireDamageResponse> {
  return apiFetch<FireDamageResponse>('/api/fire-damage', params);
}

// ═══════ 연간화재통계 ═══════

export interface AnnualFireStatsResponse {
  year: string;
  totalRecords: number;
  summary: {
    totalFires: number;
    totalDeaths: number;
    totalInjuries: number;
    totalCasualties: number;
    totalPropertyDamage: number;
  };
  bySido: { name: string; count: number }[];
  byFireType: { name: string; count: number }[];
  byPlace: { name: string; count: number }[];
  byCause: { name: string; count: number }[];
  byMonth: { month: string; count: number }[];
  casualtiesBySido: { name: string; deaths: number; injuries: number }[];
}

export async function fetchAnnualFireStats(year: string): Promise<AnnualFireStatsResponse> {
  // 대량 데이터 집계이므로 30초 타임아웃
  const url = new URL(`${API_BASE}/api/fire-annual/${year}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(humanizeApiError(res.status, body));
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('연간화재통계 데이터 집계 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    throw err;
  }
}
