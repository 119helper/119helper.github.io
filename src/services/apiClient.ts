/**
 * 119 Helper — 통합 API 클라이언트
 *
 * 모든 외부 API 호출은 Cloudflare Worker를 통해 프록시됩니다.
 * 프론트엔드에는 API 키가 존재하지 않습니다.
 */

import { createStore, del, get, keys, set } from 'idb-keyval';
import { z } from 'zod';
import { reportClientError } from './telemetry';
import { API_BASE, workerHeaders } from './apiConfig';

const API_TIMEOUT_MS = 15_000;
const CACHE_PREFIX = '119_cache_v1_';
const CACHE_VERSION = 1;
const CACHE_EVICT_RATIO = 0.2;
const cacheStore = createStore('119-helper-cache', 'api-cache');

export class StaleDataError extends Error {
  cachedData: unknown;
  cachedAt: number;
  constructor(cachedData: unknown, message: string, cachedAt: number) {
    super(message);
    this.name = 'StaleDataError';
    this.cachedData = cachedData;
    this.cachedAt = cachedAt;
  }
}

export function isStaleDataError(err: unknown): err is StaleDataError {
  if (err instanceof StaleDataError) return true;
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { name?: unknown };
  return candidate.name === 'StaleDataError' && 'cachedData' in err;
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
  data: unknown;
}

export interface ApiFetchOptions<T = unknown> {
  useCache?: boolean;
  cacheTtlMs?: number;
  customCacheKey?: string;
  timeoutMs?: number;
  forceRefresh?: boolean;
  schema?: z.ZodType<T>;
  /**
   * 네트워크 실패 시 만료 캐시를 폴백으로 보여줄 수 있는 최대 나이(ms).
   * 이보다 오래된 캐시는 폴백하지 않고 일반 오류를 던진다.
   * 응급실 병상·재난문자처럼 오래된 값이 위험을 부르는 데이터에 지정한다.
   * 미지정 시 기존 동작(나이 제한 없음)을 유지한다.
   */
  maxStaleMs?: number;
}

const apiRecordSchema = z.record(z.string(), z.unknown());
const apiRecordArraySchema = z.array(apiRecordSchema);
const xmlResponseSchema = z.object({ xml: z.string() }).passthrough();
const weatherBriefingSchema = z.object({ briefing: z.string().catch('') }).passthrough();

export type ApiRecord = z.infer<typeof apiRecordSchema>;

export interface PaginatedItemsResponse<T = ApiRecord> {
  items: T[];
  totalCount: number;
}

const paginatedApiRecordSchema = z.object({
  items: apiRecordArraySchema,
  totalCount: z.coerce.number().catch(0),
}).passthrough() satisfies z.ZodType<PaginatedItemsResponse>;

function findResultCode(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 5) return null;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if ((normalizedKey === 'resultcode' || normalizedKey === 'errorcode') && (typeof child === 'string' || typeof child === 'number')) {
      return String(child);
    }

    if (normalizedKey === 'error' && typeof child === 'string') {
      const match = child.match(/^API_RESULT_(.+)$/);
      if (match) return match[1];
    }
  }

  for (const child of Object.values(value)) {
    const found = findResultCode(child, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractPublicDataResultCode(body: string): string | null {
  if (!body) return null;

  try {
    const parsed: unknown = JSON.parse(body);
    const code = findResultCode(parsed);
    if (code) return code;
  } catch {
    // Body may be XML or a composed error string.
  }

  const xmlMatch = body.match(/<(?:resultCode|errorCode)>\s*([^<\s]+)\s*<\/(?:resultCode|errorCode)>/i);
  if (xmlMatch) return xmlMatch[1];

  const workerMatch = body.match(/API_RESULT_([A-Z0-9_-]+)/i);
  return workerMatch?.[1] ?? null;
}

function humanizeApiError(status: number, body: string): string {
  const text = body.toLowerCase();
  const resultCode = extractPublicDataResultCode(body);

  if (resultCode === '22') {
    return 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (resultCode === '30') {
    return 'API 키가 유효하지 않거나 서비스 승인 대기 중입니다.';
  }
  if (resultCode === '03') {
    return '제공된 데이터가 없습니다.';
  }
  if (resultCode && ['01', '02', '04'].includes(resultCode)) {
    return '공공데이터 서버 연결 오류 또는 응답 지연입니다.';
  }
  
  if (text.includes('invalid_json')) {
    return '공공데이터 서버 응답 오류 (JSON 파싱 실패)입니다. 잠시 후 다시 시도해주세요.';
  }
  if (text.includes('schema_validation')) {
    return '공공데이터 응답 형식이 예상과 다릅니다. 캐시를 보존하고 잠시 후 다시 시도합니다.';
  }
  if (status === 429 || text.includes('limit') || text.includes('초과')) {
    return 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (status === 401 || status === 403 || text.includes('service_key') || text.includes('access_denied') || text.includes('승인') || text.includes('인증')) {
    return 'API 키가 유효하지 않거나 서비스 승인 대기 중입니다.';
  }
  if (status === 404 || text.includes('no data') || text.includes('빈 응답') || text.includes('결과가 없습니다') || text.includes('empty_data')) {
    return '제공된 데이터가 없습니다.';
  }
  if (status >= 500 || text.includes('timeout') || text.includes('failed to fetch') || text.includes('network') || status === 0) {
    return '공공데이터 서버 연결 오류 또는 응답 지연입니다.';
  }
  return `API 오류 (${status}): 서버에서 데이터를 처리할 수 없습니다.`;
}

function isQuotaExceededError(error: unknown): boolean {
  return typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    : typeof error === 'object'
      && error !== null
      && 'name' in error
      && ((error as { name?: unknown }).name === 'QuotaExceededError' || (error as { name?: unknown }).name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function isCacheItem(value: unknown): value is CacheItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CacheItem>;
  return item.version === CACHE_VERSION
    && typeof item.cachedAt === 'number'
    && 'data' in item;
}

function localStorageKey(key: string): string {
  return CACHE_PREFIX + key;
}

function getLocalStorageItem(storageKey: string): CacheItem | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const item: unknown = JSON.parse(raw);
    if (isCacheItem(item)) return item;
    localStorage.removeItem(storageKey);
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }
  return null;
}

function saveToLocalStorage(storageKey: string, item: CacheItem): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(item));
  } catch (error) {
    if (!isQuotaExceededError(error)) return;

    try {
      evictOldestLocalStorageItems();
      localStorage.setItem(storageKey, JSON.stringify(item));
    } catch {
      // Best-effort cache only.
    }
  }
}

function evictOldestLocalStorageItems(): void {
  const entries: { key: string; cachedAt: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    const item = getLocalStorageItem(key);
    if (item) entries.push({ key, cachedAt: item.cachedAt });
  }

  entries.sort((a, b) => a.cachedAt - b.cachedAt);
  const removeCount = Math.max(1, Math.ceil(entries.length * CACHE_EVICT_RATIO));
  entries.slice(0, removeCount).forEach(entry => localStorage.removeItem(entry.key));
}

async function evictOldestIndexedDbItems(): Promise<void> {
  const allKeys = await keys(cacheStore);
  const cacheKeys = allKeys.filter((key): key is string => typeof key === 'string' && key.startsWith(CACHE_PREFIX));
  const entries = await Promise.all(cacheKeys.map(async key => {
    const item = await get<unknown>(key, cacheStore).catch(() => null);
    return isCacheItem(item) ? { key, cachedAt: item.cachedAt } : null;
  }));
  const validEntries = entries.filter((entry): entry is { key: string; cachedAt: number } => entry !== null);

  validEntries.sort((a, b) => a.cachedAt - b.cachedAt);
  const removeCount = Math.max(1, Math.ceil(validEntries.length * CACHE_EVICT_RATIO));
  await Promise.all(validEntries.slice(0, removeCount).map(entry => del(entry.key, cacheStore)));
}

function isFresh(item: CacheItem, ttlMs?: number): boolean {
  return !ttlMs || Date.now() - item.cachedAt <= ttlMs;
}

async function saveCacheItem(storageKey: string, item: CacheItem): Promise<void> {
  try {
    await set(storageKey, item, cacheStore);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Old localStorage migration cleanup is best-effort.
    }
    return;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      try {
        await evictOldestIndexedDbItems();
        await set(storageKey, item, cacheStore);
        return;
      } catch {
        // Fall through to localStorage fallback.
      }
    }
  }

  saveToLocalStorage(storageKey, item);
}

async function saveToCache(key: string, data: unknown): Promise<void> {
  const storageKey = localStorageKey(key);
  const item: CacheItem = { version: CACHE_VERSION, cachedAt: Date.now(), data };
  await saveCacheItem(storageKey, item);
}

async function getFromCache(key: string, ttlMs?: number): Promise<{ data: unknown; cachedAt: number } | null> {
  const storageKey = localStorageKey(key);

  try {
    const item = await get<unknown>(storageKey, cacheStore);
    if (isCacheItem(item)) {
      if (isFresh(item, ttlMs)) return { data: item.data, cachedAt: item.cachedAt };
      return null;
    }
    if (item !== undefined) await del(storageKey, cacheStore);
  } catch {
    // IndexedDB can be unavailable in private/restricted contexts; try legacy fallback.
  }

  const legacyItem = getLocalStorageItem(storageKey);
  if (!legacyItem) return null;

  void saveCacheItem(storageKey, legacyItem);
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Migration cleanup is best-effort.
  }

  if (isFresh(legacyItem, ttlMs)) return { data: legacyItem.data, cachedAt: legacyItem.cachedAt };
  return null;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

export async function apiFetch<T>(path: string, params?: Record<string, string>, options?: ApiFetchOptions<T>): Promise<T> {
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
    schema,
    maxStaleMs,
  } = options || {};
  const staleLimitMs = maxStaleMs ?? cacheTtlMs;

  const safeKey = customCacheKey || encodeURIComponent(url.pathname + url.search);
  const cacheKey = safeKey;

  // Deduplication
  if (inFlightRequests.has(cacheKey) && !forceRefresh) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const promise = (async () => {
    // 1. Try Cache if within TTL
    if (useCache && !forceRefresh) {
      const cached = await getFromCache(cacheKey, cacheTtlMs);
      if (cached) {
        return cached.data as T;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response | undefined;
    let bodyText = '';
    let isTimeout = false;

    try {
      res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal, headers: workerHeaders() });
      reportNetworkHealth(true); // 응답이 왔다 = 네트워크 자체는 살아 있음 (HTTP 에러와 무관)
      bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        console.warn(`[API Error] ${url.pathname} | Status: ${res.status} | Body: ${bodyText.slice(0, 150)}`);
        throw new Error('HTTP_ERROR');
      }

      let data: unknown;
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

      if (schema) {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          console.warn(`[API Schema Error] ${url.pathname} | ${parsed.error.issues.slice(0, 3).map(issue => issue.path.join('.') || '<root>').join(', ')}`);
          throw new Error('SCHEMA_VALIDATION_ERROR');
        }
        data = parsed.data;
      }

      if (useCache) {
        await saveToCache(cacheKey, data);
      }
      return data as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') isTimeout = true;

      // res가 없으면 fetch 자체가 실패한 것 = 네트워크 레벨 장애 (타임아웃 포함)
      if (!res) reportNetworkHealth(false);

      const errMessage = err instanceof Error ? err.message : String(err);
      const causeText = isTimeout ? 'timeout' : `${errMessage} ${bodyText}`;
      const errMsg = humanizeApiError(res?.status || 0, causeText);

      console.warn(`[API Fetch Failed] ${url.pathname} -> ${errMsg}`);

      // 업스트림 "계약 위반"(응답 형식 변경/키 문제)은 관측성 대상.
      // 단순 오프라인/타임아웃 같은 현장 흔한 장애는 보고하지 않는다(노이즈 방지).
      if (errMessage === 'SCHEMA_VALIDATION_ERROR' || errMessage === 'API_LOGIC_ERROR' || errMessage === 'INVALID_JSON') {
        reportClientError(errMessage, {
          context: 'apiFetch',
          level: 'warn',
          meta: { path: url.pathname, status: res?.status ?? 0, bodyPreview: bodyText.slice(0, 200) },
        });
      }

      if (useCache) {
        // Retrieve expired cache if available as fallback
        const fallback = await getFromCache(cacheKey); // No TTL check
        if (fallback) {
          // 너무 오래된 캐시는 폴백하지 않는다.
          // (예: 며칠 전 응급실 병상 수를 "정상"처럼 보여주는 위험 방지)
          // 명시값이 없으면 TTL을 폴백 한계로 써서 무기한 만료 캐시 노출을 막는다.
          const tooStale = staleLimitMs !== undefined && Date.now() - fallback.cachedAt > staleLimitMs;
          if (!tooStale) {
            throw new StaleDataError(fallback.data, errMsg, fallback.cachedAt);
          }
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

async function apiFetchXml(path: string, params?: Record<string, string>, options?: ApiFetchOptions<{ xml: string }>): Promise<string> {
  const data = await apiFetch<{ xml: string }>(path, params, { ...options, schema: options?.schema ?? xmlResponseSchema });
  return data.xml;
}

// ═══════ 날씨 (TTL 짧게 30분, 폴백 최대 6시간) ═══════
const WEATHER_OPTS: ApiFetchOptions = { cacheTtlMs: 1000 * 60 * 30, maxStaleMs: 1000 * 60 * 60 * 6 };
export async function fetchWeatherNow(nx: number, ny: number): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/weather/now', { nx: String(nx), ny: String(ny) }, { ...WEATHER_OPTS, schema: apiRecordArraySchema });
}
export async function fetchWeatherUltra(nx: number, ny: number): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/weather/ultra', { nx: String(nx), ny: String(ny) }, { ...WEATHER_OPTS, schema: apiRecordArraySchema });
}
export async function fetchWeatherForecast(nx: number, ny: number): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/weather/forecast', { nx: String(nx), ny: String(ny) }, { ...WEATHER_OPTS, schema: apiRecordArraySchema });
}
export async function fetchMidLand(regId: string): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/weather/mid-land', { regId }, { ...WEATHER_OPTS, schema: apiRecordArraySchema });
}
export async function fetchMidTemp(regId: string): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/weather/mid-temp', { regId }, { ...WEATHER_OPTS, schema: apiRecordArraySchema });
}
export async function fetchWeatherBriefing(stnId: string): Promise<{ briefing: string }> {
  return apiFetch<{ briefing: string }>('/api/weather/briefing', { stnId }, { ...WEATHER_OPTS, schema: weatherBriefingSchema });
}

// ═══════ 산불위험예보지수 (3시간 주기, 폴백 최대 6시간) ═══════
export interface ForestFireRiskResponse {
  items: ApiRecord[];
  totalCount: number;
  source?: string;
  fetchedAt?: string;
}

const FOREST_FIRE_RISK_OPTS: ApiFetchOptions<ForestFireRiskResponse> = {
  cacheTtlMs: 1000 * 60 * 60,
  maxStaleMs: 1000 * 60 * 60 * 6,
};

const forestFireRiskResponseSchema = z.object({
  items: apiRecordArraySchema,
  totalCount: z.coerce.number().catch(0),
  source: z.string().optional(),
  fetchedAt: z.string().optional(),
}).passthrough() satisfies z.ZodType<ForestFireRiskResponse>;

export async function fetchForestFireRisk(forceRefresh?: boolean): Promise<ForestFireRiskResponse> {
  return apiFetch<ForestFireRiskResponse>(
    '/api/forest-fire-risk',
    { numOfRows: '1000', pageNo: '1' },
    { ...FOREST_FIRE_RISK_OPTS, forceRefresh, schema: forestFireRiskResponseSchema },
  );
}

// ═══════ 대기질 (TTL 짧게 30분, 폴백 최대 6시간) ═══════
const AIR_OPTS: ApiFetchOptions = { cacheTtlMs: 1000 * 60 * 30, maxStaleMs: 1000 * 60 * 60 * 6 };
export async function fetchAirQuality(sido: string): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/air', { sido }, { ...AIR_OPTS, schema: apiRecordArraySchema });
}

// ═══════ 응급실 (TTL 짧게 5분, 폴백 최대 1시간 — 오래된 병상 정보는 위험) ═══════
const ER_OPTS: ApiFetchOptions<{ xml: string }> = { cacheTtlMs: 1000 * 60 * 5, maxStaleMs: 1000 * 60 * 60 };
export async function fetchERBeds(sido: string, gugun?: string) { return apiFetchXml('/api/er/beds', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERList(sido: string, gugun?: string) { return apiFetchXml('/api/er/list', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERMessages(sido: string, gugun?: string) { return apiFetchXml('/api/er/messages', { sido, gugun: gugun || '' }, ER_OPTS); }
export async function fetchERSevereIllness(sido: string, gugun?: string) { return apiFetchXml('/api/er/severe-illness', { sido, gugun: gugun || '' }, ER_OPTS); }

// ═══════ 건축물대장 (변경 적음 7일) ═══════
export async function fetchBuildingInfo(params: { sigunguCd: string; bjdongCd: string; platGbCd: string; bun: string; ji: string; }, forceRefresh?: boolean) {
  return apiFetch<ApiRecord[]>('/api/building', params, { forceRefresh, schema: apiRecordArraySchema });
}

// ═══════ 소방용수 (7일) ═══════
export async function fetchFireWater(city: string): Promise<ApiRecord[]> {
  return apiFetch<ApiRecord[]>('/api/firewater', { city }, { schema: apiRecordArraySchema });
}

// ═══════ 공휴일 (30일) ═══════
export async function fetchHolidays(year: number, month: number) { return apiFetchXml('/api/holiday', { year: String(year), month: String(month) }, { cacheTtlMs: 1000 * 60 * 60 * 24 * 30 }); }

// ═══════ 대피소 (지진해일) (7일) ═══════
export async function fetchShelters(ctprvnNm: string, signguNm?: string, numOfRows = '100', pageNo = '1') {
  return apiFetch<ApiRecord[]>('/api/shelter', { ctprvnNm, signguNm: signguNm || '', numOfRows, pageNo }, { schema: apiRecordArraySchema });
}
export async function fetchTsunamiShelters() {
  const { default: tsunamiData } = await import('../../public/data/tsunami.json');
  return tsunamiData;
}

// ═══════ 민방위대피시설 ═══════
export async function fetchCivilShelters(ctprvnNm?: string, sgnNm?: string) {
  void ctprvnNm;
  void sgnNm;
  const response = await fetch('/data/civil.json');
  if (!response.ok) {
    throw new Error(`민방위 대피시설 데이터를 불러오지 못했습니다. (${response.status})`);
  }

  const data: unknown = await response.json();
  const parsed = apiRecordArraySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('민방위 대피시설 데이터 형식이 올바르지 않습니다.');
  }

  return parsed.data;
}

// ═══════ 다중이용업소 (7일) ═══════
export async function fetchMultiUseFacilities(ctprvnNm: string, signguNm?: string) {
  return apiFetch<ApiRecord[]>('/api/multiuse', { ctprvnNm, signguNm: signguNm || '' }, { schema: apiRecordArraySchema });
}

// ═══════ 구급통계 (7일) ═══════
export async function fetchEmergencyStats(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<PaginatedItemsResponse>(`/api/emergency/stats/${op}`, params, { forceRefresh, schema: paginatedApiRecordSchema });
}

// ═══════ 구급정보 (7일) ═══════
export async function fetchEmergencyInfo(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<PaginatedItemsResponse>(`/api/emergency/info/${op}`, params, { forceRefresh, schema: paginatedApiRecordSchema });
}

// ═══════ 화재정보 (TTL 30분 - 실시간) ═══════
export async function fetchFireInfo(op: string, params?: Record<string, string>, forceRefresh?: boolean) {
  return apiFetch<PaginatedItemsResponse>(`/api/fire/${op}`, params, { cacheTtlMs: 1000 * 60 * 30, forceRefresh, schema: paginatedApiRecordSchema });
}

// ═══════ 특정소방대상물 (7일) ═══════
export async function fetchFireObjectAccom(ctpvNm: string, numOfRows = '100', pageNo = '1', forceRefresh?: boolean) {
  return apiFetch<PaginatedItemsResponse>('/api/fire-object/accom', { ctpvNm, numOfRows, pageNo }, { forceRefresh, schema: paginatedApiRecordSchema });
}
export async function fetchFireObjectFireSys(ctpvNm: string, numOfRows = '100', pageNo = '1', forceRefresh?: boolean) {
  return apiFetch<PaginatedItemsResponse>('/api/fire-object/fire-sys', { ctpvNm, numOfRows, pageNo }, { forceRefresh, schema: paginatedApiRecordSchema });
}

// ═══════ 지역별 화재피해 현황 (1일) ═══════
export interface FireDamageItem { ocrnYmdhh: string; gutFsttOgidNm: string; deadPercnt: string; injrdprPercnt: string; prptDmgSbttAmt: string; lawAddrName: string; }
export interface FireDamageResponse { items: FireDamageItem[]; totalCount: number; pageNo: number; numOfRows: number; error?: string; errorCode?: string; }
export async function fetchFireDamage(params?: { pageNo?: string; numOfRows?: string; lawAddrName?: string; sidoNm?: string; startYmd?: string; endYmd?: string; }, forceRefresh?: boolean): Promise<FireDamageResponse> {
  return apiFetch<FireDamageResponse>('/api/fire-damage', params, { cacheTtlMs: 1000 * 60 * 60 * 24, forceRefresh });
}

// ═══════ 연간화재통계 (30일) ═══════
export interface AnnualFireStatsResponse { year: string; totalRecords: number; summary: { totalFires: number; totalDeaths: number; totalInjuries: number; totalCasualties: number; totalPropertyDamage: number; }; bySido: { name: string; count: number }[]; byFireType: { name: string; count: number }[]; byPlace: { name: string; count: number }[]; byCause: { name: string; count: number }[]; byMonth: { month: string; count: number }[]; casualtiesBySido: { name: string; deaths: number; injuries: number }[]; }
export interface AnnualFireYearsResponse { years: string[]; latestYear: string | null; sourceName?: string; nextExpectedUpdate?: string; }

const annualFireYearsSchema = z.object({
  years: z.array(z.string()),
  latestYear: z.string().nullable(),
  sourceName: z.string().optional(),
  nextExpectedUpdate: z.string().optional(),
}).passthrough() satisfies z.ZodType<AnnualFireYearsResponse>;

export async function fetchAnnualFireYears(): Promise<AnnualFireYearsResponse> {
  return apiFetch<AnnualFireYearsResponse>('/api/fire-annual/years', undefined, {
    cacheTtlMs: 1000 * 60 * 60 * 24,
    schema: annualFireYearsSchema,
  });
}

export async function fetchAnnualFireStats(year: string, forceRefresh?: boolean): Promise<AnnualFireStatsResponse> {
  return apiFetch<AnnualFireStatsResponse>(`/api/fire-annual/${year}`, undefined, { timeoutMs: 30_000, cacheTtlMs: 1000 * 60 * 60 * 24 * 30, forceRefresh });
}
