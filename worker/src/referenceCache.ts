const CACHE_PREFIX = 'reference:last-good:v1:';

interface ReferenceCachePolicy {
  maxAgeSeconds: number;
}

interface ReferenceCacheEntry {
  version: 1;
  cachedAt: number;
  data: unknown;
}

export interface ReferenceCacheHit {
  cachedAt: number;
  data: unknown;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * 현재 수치로 오인해도 위험하지 않은 저변동·참고용 데이터만 허용한다.
 * 기상, 응급실, 재난문자, 산불위험처럼 시의성이 중요한 경로는 의도적으로 제외한다.
 */
export function referenceCachePolicy(pathname: string): ReferenceCachePolicy | null {
  if (pathname === '/api/consumer-hazard') return { maxAgeSeconds: 14 * DAY_SECONDS };
  if (pathname === '/api/holiday') return { maxAgeSeconds: 180 * DAY_SECONDS };
  if (pathname === '/api/building') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/multiuse') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/shelter') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/civil-shelter') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/tsunami-shelter') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/fire-damage') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname === '/api/ambulance') return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname.startsWith('/api/fire-object/')) return { maxAgeSeconds: 30 * DAY_SECONDS };
  if (pathname.startsWith('/api/fire-annual/')) return { maxAgeSeconds: 365 * DAY_SECONDS };
  return null;
}

function cacheKey(requestUrl: URL): string {
  const normalized = new URL(requestUrl.toString());
  normalized.searchParams.delete('_t');
  normalized.searchParams.delete('_ev');
  normalized.searchParams.sort();
  return `${CACHE_PREFIX}${normalized.pathname}${normalized.search}`;
}

function isEntry(value: unknown): value is ReferenceCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ReferenceCacheEntry>;
  return entry.version === 1
    && typeof entry.cachedAt === 'number'
    && Number.isFinite(entry.cachedAt)
    && 'data' in entry;
}

export async function saveLastKnownGood(
  kv: KVNamespace | undefined,
  requestUrl: URL,
  data: unknown,
): Promise<void> {
  const policy = referenceCachePolicy(requestUrl.pathname);
  if (!kv || !policy) return;

  const entry: ReferenceCacheEntry = {
    version: 1,
    cachedAt: Date.now(),
    data,
  };

  try {
    await kv.put(cacheKey(requestUrl), JSON.stringify(entry), {
      expirationTtl: policy.maxAgeSeconds,
    });
  } catch (error) {
    console.warn('[Reference cache] put failed', error);
  }
}

export async function readLastKnownGood(
  kv: KVNamespace | undefined,
  requestUrl: URL,
): Promise<ReferenceCacheHit | null> {
  const policy = referenceCachePolicy(requestUrl.pathname);
  if (!kv || !policy) return null;

  try {
    const value = await kv.get<unknown>(cacheKey(requestUrl), 'json');
    if (!isEntry(value)) return null;
    if (Date.now() - value.cachedAt > policy.maxAgeSeconds * 1000) return null;
    return { cachedAt: value.cachedAt, data: value.data };
  } catch (error) {
    console.warn('[Reference cache] read failed', error);
    return null;
  }
}
