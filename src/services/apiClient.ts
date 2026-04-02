/**
 * 119 Helper — 통합 API 클라이언트
 *
 * 모든 외부 API 호출은 Cloudflare Worker를 통해 프록시됩니다.
 * 프론트엔드에는 API 키가 존재하지 않습니다.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), { cache: 'no-store' });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API 오류 (${res.status}): ${body}`);
  }

  return res.json();
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
