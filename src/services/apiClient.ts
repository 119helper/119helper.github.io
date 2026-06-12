/**
 * 119 Helper — 통합 API 클라이언트
 *
 * 모든 외부 API 호출은 Cloudflare Worker를 통해 프록시됩니다.
 * 프론트엔드에는 API 키가 존재하지 않습니다.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';
const API_TIMEOUT_MS = 15_000;
const CACHE_PREFIX = '119_cache_v1_';

export class StaleDataError extends Error {
  cachedData: any;
  cachedAt: number;
  constructor(cachedData: any, message: string, cachedAt: number) {
    super(message);
    this.name = 'StaleDataError';
    this.cachedData = cachedData;
    this.cachedAt = cachedAt;
  }
}

export function isStaleDataError(err: any): err is StaleDataError {
  return err instanceof StaleDataError || (err && typeof err === 'object' && err.name === 'StaleDataError' && 'cachedData' in err);
}

// ═══════ 데이터 신선도 태깅 ═══════
// 서비스 레이어가 StaleDataError를 풀어 캐시 데이터를 반환할 때,
// "언제 데이터인지"를 데이터 객체에 비열거형으로 심어 뷰가 배지로 표시할 수 있게 한다.
// (JSON.stringify에 안 잡히므로 캐시에 재저장될 일 없음)
const STALE_AT_KEY = '__staleAt119';

export function tagStale<T>(data: T, cachedAt: number): T {
  if (data && typeof data === 'object') {
    try {
      Object.defineProperty(data, STALE_AT_KEY, { value: cachedAt, enumerable: false, configurable: true });
    } catch { /* frozen object 등 — 태깅 실패해도 데이터는 유효 */ }
  }
  return data;
}

export function getStaleAt(data: unknown): number | null {
  if (data && typeof data === 'object') {
    const v = (data as Record<string, unknown>)[STALE_AT_KEY];
    if (typeof v === 'number') return v;
  }
  return null;
}

// ═══════ 네트워크 상태 신호 ═══════
// navigator.onLine은 "와이파이는 잡혔는데 인터넷이 안 되는" 상황을 못 잡는다.
// 실제 fetch 성공/네트워크 실패를 이벤트로 흘려 ConnectivityStatus가 판정에 합산한다.
export const NETWORK_HEALTH_EVENT = '119:network-health';

function reportNetworkHealth(ok: boolean) {
  try {
    window.dispatchEvent(new CustomEvent(NETWORK_HEALTH_EVENT, { detail: { ok } }));
  } catch { /* non-browser 환경 무시 */ }
}

interface CacheItem {
  version: number;
  cachedAt: number;
  data: any;
}

export interface ApiFetchOptions {
  useCache?: boolean;
  cacheTtlMs?: number;
  customCacheKey?: string;
  timeoutMs?: number;
  forceRefresh?: boolean;
}

function humanizeApiError(status: number, body: string): string {
  const text = body.toLowerCase();
  
  if (text.includes('invalid_json')) {
    return '공공데이터 서버 응답 오류 (JSON 파싱 실패)입니다. 잠시 후 다시 시도해주세요.';
  }
  if (status === 429 || text.includes('limit') || text.includes('초과') || text.includes('22')) {
    return 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (status === 401 || status === 403 || text.includes('service_key') || text.includes('access_denied') || text.includes('승인') || text.includes('인증') || text.includes('30')) {
    return 'API 키가 유효하지 않거나 서비스 승인 대기 중입니다.';
  }
  if (status === 404 || text.includes('no data') || text.includes('빈 응답') || text.includes('결과가 없습니다') || text.includes('empty_data') || text.includes('03')) {
    return '제공된 데이터가 없습니다.';
  }
  if (status >= 500 || text.includes('timeout') || text.includes('failed to fetch') || text.includes('network') || status === 0 || text.includes('01') || text.includes('02') || text.includes('04')) {
    return '공공데이터 서버 연결 오류 또는 응답 지연입니다.';
  }
  return `API 오류 (${status}): 서버에서 데이터를 처리할 수 없습니다.`;
}

function saveToCache(key: string, data: any) {
  try {
    const item: CacheItem = { version: 1, cachedAt: Date.now(), data };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
  } catch (e: any) {
    // Handle QuotaExceededError
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
        }
        // Remove 20% of oldest items or just clear them all to be safe and simple
        keysToRemove.forEach(k => localStorage.removeItem(k));
        const item: CacheItem = { version: 1, cachedAt: Date.now(), data };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
      } catch {
        // Ignore if still fails
      }
    }
  }
}

function getFromCache(key: string, ttlMs?: number): { data: any; cachedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const item: CacheItem = JSON.parse(raw);
    if (item.version !== 1) return null;
    if (ttlMs && Date.now() - item.cachedAt > ttlMs) {
      // TTL expired, do not return for normal fetch, but allow for fallback if we don't pass ttlMs
      return null;
    }
    return { data: item.data, cachedAt: item.cachedAt };
  } catch {
    // If parse fails or structure is broken, clean it up
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
    return null;
  }
}

const inFlightRequests = new Map<string, Promise<any>>();

export async function apiFetch<T>(path: string, params?: Record<string, string>, options?: ApiFetchOptions): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
    url.searchParams.sort();
  }

  const {
    useCache = true,
    cacheTtlMs = 1000 * 60 * 60 * 24 * 7, // Default 7 days
    customCacheKey,
    timeoutMs = API_TIMEOUT_MS,
    forceRefresh = false,
  } = options || {};

  const safeKey = customCacheKey || encodeURIComponent(url.pathname + url.search);
  const cacheKey = safeKey;

  // Deduplication
  if (inFlightRequests.has(cacheKey) && !forceRefresh) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const promise = (async () => {
    // 1. Try Cache if within TTL
    if (useCache && !forceRefresh) {
      const cached = getFromCache(cacheKey, cacheTtlMs);
      if (cached) {
        return cached.data;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response | undefined;
    let bodyText = '';
    let isTimeout = false;

    try {
      res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });
      reportNetworkHealth(true); // 응답이 왔다 = 네트워크 자체는 살아 있음 (HTTP 에러와 무관)
      bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        console.warn(`[API Error] ${url.pathname} | Status: ${res.status} | Body: ${bodyText.slice(0, 150)}`);
        throw new Error('HTTP_ERROR');
      }

      let data;
      try {
        data = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        throw new Error('INVALID_JSON');
      }
      if (!data) throw new Error('EMPTY_DATA');

      if (data && typeof data === 'object' && 'error' in data) {
        console.warn(`[API Logic Error] ${url.pathname} | Error: ${JSON.stringify(data).slice(0, 150)}`);
        throw new Error('API_LOGIC_ERROR');
      }

      if (useCache) {
        saveToCache(cacheKey, data);
      }
      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') isTimeout = true;

      // res가 없으면 fetch 자체가 실패한 것 = 네트워크 레벨 장애 (타임아웃 포함)
      if (!res) reportNetworkHealth(false);

      const causeText = isTimeout ? 'timeout' : (err.message + ' ' + bodyText);
      const errMsg = humanizeApiError(res?.status || 0, causeText);

      console.warn(`[API Fetch Failed] ${url.pathname} -> ${errMsg}`);

      if (useCache) {
        // Retrieve expired cache if available as fallback
        const fallback = getFromCache(cacheKey); // No TTL check
        if (fallback) {
          throw new StaleDataError(fallback.data, errMsg, fallback.cachedAt);
        }
      }

      throw new Error(errMsg);
    } finally {
      clearTimeout(timer);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

async function apiFetchXml(path: string, params?: Record<string, string>, options?: ApiFetchOptions): Promise<string> {
  const data = await apiFetch<{ xml: string }>(path, params, options);
  return data.xml;
}

// ═══════ 날씨 (TTL 짧게 30분) ═══════
const WEATHER_OPTS: ApiFetchOptions = { cacheTtlMs: 1000 * 60 * 30 };
export async function fetchWeatherNow(nx: number, ny: number) { return apiFetch<any[]>('/api/weather/now', { nx: String(nx), ny: String(ny) }, WEATHER_OPTS); }
export async function fetchWeatherUltra(nx: number, ny: number) { return apiFetch<any[]>('/api/weather/ultra', { nx: String(nx), ny: String(ny) }, WEATHER_OPTS); }
export async function fetchWeatherForecast(nx: number, ny: number) { return apiFetch<any[]>('/api/weather/forecast', { nx: String(nx), ny: String(ny) }, WEATHER_OPTS); }
export async function fetchMidLand(regId: string) { return apiFetch<any[]>('/api/weather/mid-land', { regId }, WEATHER_OPTS); }
export async function fetchMidTemp(regId: string) { return apiFetch<any[]>('/api/weather/mid-temp', { regId }, WEATHER_OPTS); }
export async function fetchWeatherBriefing(stnId: string) { return apiFetch<{ briefing: string }>('/api/weather/briefing', { stnId }, WEATHER_OPTS); }

// ═══════ 대기질 (TTL 짧게 30분) ═══════
const AIR_OPTS: ApiFetchOptions = { cacheTtlMs: 1000 * 60 * 30 };
export async function fetchAirQuality(sido: string) { return apiFetch<any[]>('/api/air', { sido }, AIR_OPTS); }

// ═══════ 응급실 (TTL 짧게 5분) ═══════
const ER_OPTS: ApiFetchOptions = { cacheTtlMs: 1000 * 60 * 5 };
export async function fetchERBeds(sido: string, gugun?: string) { return apiFetchXml('/api/er/beds', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERList(sido: string, gugun?: string) { return apiFetchXml('/api/er/list', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERMessages(sido: string, gugun?: string) { return apiFetchXml('/api/er/messages', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERSevereIllness(sido: string, gugun?: string) { return apiFetchXml('/api/er/severe-illness', { sido, gugun: gugun || '' }, ER_OPTS); }

// ═══════ 건축물대장 (변경 적음 7일) ═══════
export async function fetchBuildingInfo(params: { sigunguCd: string; bjdongCd: string; platGbCd: string; bun: string; ji: string; }, forceRefresh?: boolean) {
  return apiFetch<any[]>('/api/building', params, { forceRefresh });
}

// ═══════ 소방용수 (7일) ═══════
export async function fetchFireWater(city: string) { return apiFetch<any[]>('/api/firewater', { city }); }

// ═══════ 공휴일 (30일) ═══════
export async function fetchHolidays(year: number, month: number) { return apiFetchXml('/api/holiday', { year: String(year), month: String(month) }, { cacheTtlMs: 1000 * 60 * 60 * 24 * 30 }); }

// ═══════ 설정 (카카오맵 키) ═══════
export async function fetchConfig(forceRefresh?: boolean) { return apiFetch<{ kakaoMapKey: string }>('/api/config', undefined, { useCache: false, forceRefresh }); }

// ═══════ 대피소 (지진해일) (7일) ═══════
export async function fetchShelters(ctprvnNm: string, signguNm?: string, numOfRows = '100', pageNo = '1') {
  return apiFetch<any[]>('/api/shelter', { ctprvnNm, signguNm: signguNm || '', numOfRows, pageNo });
}
export async function fetchTsunamiShelters() {
  const { default: tsunamiData } = await import('../../public/data/tsunami.json');
  return tsunamiData;
}

// ═══════ 민방위대피시설 ═══════
export async function fetchCivilShelters(ctprvnNm?: string, sgnNm?: string) {
  void ctprvnNm;
  void sgnNm;
  const { civilData } = await import('../data/civilData');
  return civilData;
}

// ═══════ 다중이용업소 (7일) ═══════
export async function fetchMultiUseFacilities(ctprvnNm: string, signguNm?: string) {
  return apiFetch<any[]>('/api/multiuse', { ctprvnNm, signguNm: signguNm || '' });
}

// ═══════ 구급통계 (7일) ═══════
export async function fetchEmergencyStats(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/emergency/stats/${op}`, params, { forceRefresh });
}

// ═══════ 구급정보 (7일) ═══════
export async function fetchEmergencyInfo(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/emergency/info/${op}`, params, { forceRefresh });
}

// ═══════ 화재정보 (TTL 30분 - 실시간) ═══════
export async function fetchFireInfo(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<{ items: any[]; totalCount: number }>(`/api/fire/${op}`, params, { cacheTtlMs: 1000 * 60 * 30, forceRefresh });
}

// ═══════ 특정소방대상물 (7일) ═══════
export async function fetchFireObjectAccom(ctpvNm: string, numOfRows = '100', pageNo = '1', forceRefresh?: boolean) {
  return apiFetch<{ items: any[]; totalCount: number }>('/api/fire-object/accom', { ctpvNm, numOfRows, pageNo }, { forceRefresh });
}
export async function fetchFireObjectFireSys(ctpvNm: string, numOfRows = '100', pageNo = '1', forceRefresh?: boolean) {
  return apiFetch<{ items: any[]; totalCount: number }>('/api/fire-object/fire-sys', { ctpvNm, numOfRows, pageNo }, { forceRefresh });
}

// ═══════ 지역별 화재피해 현황 (1일) ═══════
export interface FireDamageItem { ocrnYmdhh: string; gutFsttOgidNm: string; deadPercnt: string; injrdprPercnt: string; prptDmgSbttAmt: string; lawAddrName: string; }
export interface FireDamageResponse { items: FireDamageItem[]; totalCount: number; pageNo: number; numOfRows: number; error?: string; errorCode?: string; }
export async function fetchFireDamage(params?: { pageNo?: string; numOfRows?: string; lawAddrName?: string; }, forceRefresh?: boolean): Promise<FireDamageResponse> {
  return apiFetch<FireDamageResponse>('/api/fire-damage', params, { cacheTtlMs: 1000 * 60 * 60 * 24, forceRefresh });
}

// ═══════ 연간화재통계 (30일) ═══════
export interface AnnualFireStatsResponse { year: string; totalRecords: number; summary: { totalFires: number; totalDeaths: number; totalInjuries: number; totalCasualties: number; totalPropertyDamage: number; }; bySido: { name: string; count: number }[]; byFireType: { name: string; count: number }[]; byPlace: { name: string; count: number }[]; byCause: { name: string; count: number }[]; byMonth: { month: string; count: number }[]; casualtiesBySido: { name: string; deaths: number; injuries: number }[]; }

export async function fetchAnnualFireStats(year: string, forceRefresh?: boolean): Promise<AnnualFireStatsResponse> {
  return apiFetch<AnnualFireStatsResponse>(`/api/fire-annual/${year}`, undefined, { timeoutMs: 30_000, cacheTtlMs: 1000 * 60 * 60 * 24 * 30, forceRefresh });
}
