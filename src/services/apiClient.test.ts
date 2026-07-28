import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, fetchCivilShelters, fetchTsunamiShelters, StaleDataError } from './apiClient';

const cache = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
  createStore: () => 'api-cache',
  get: vi.fn(async (key: string) => cache.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    cache.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    cache.delete(key);
  }),
  keys: vi.fn(async () => [...cache.keys()]),
}));

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch stale cache fallback', () => {
  beforeEach(() => {
    cache.clear();
    vi.restoreAllMocks();
  });

  it('does not use expired cache forever when maxStaleMs is omitted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));

    await apiFetch('/api/test', undefined, {
      customCacheKey: 'default-stale-limit',
      cacheTtlMs: 1_000,
    });

    vi.spyOn(Date, 'now').mockReturnValue(3_000);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('failed to fetch');
    }));

    await expect(apiFetch('/api/test', undefined, {
      customCacheKey: 'default-stale-limit',
      cacheTtlMs: 1_000,
    })).rejects.not.toBeInstanceOf(StaleDataError);
  });

  it('still allows explicitly wider stale windows', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));

    await apiFetch('/api/test', undefined, {
      customCacheKey: 'explicit-stale-limit',
      cacheTtlMs: 1_000,
      maxStaleMs: 5_000,
    });

    vi.spyOn(Date, 'now').mockReturnValue(3_000);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('failed to fetch');
    }));

    await expect(apiFetch('/api/test', undefined, {
      customCacheKey: 'explicit-stale-limit',
      cacheTtlMs: 1_000,
      maxStaleMs: 5_000,
    })).rejects.toBeInstanceOf(StaleDataError);
  });

  it('surfaces Worker last-known-good metadata as stale data', async () => {
    const cachedAt = '2026-07-28T01:02:03.000Z';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-119-Data-Stale': 'true',
        'X-119-Data-Cached-At': cachedAt,
      },
    })));

    try {
      await apiFetch('/api/test', undefined, {
        customCacheKey: 'worker-last-known-good',
        useCache: false,
      });
      expect.fail('expected stale data error');
    } catch (error) {
      expect(error).toBeInstanceOf(StaleDataError);
      expect((error as StaleDataError).cachedData).toEqual({ ok: true });
      expect((error as StaleDataError).cachedAt).toBe(Date.parse(cachedAt));
    }
  });
});

describe('fetchTsunamiShelters', () => {
  it('loads the public static JSON without bundling it into JavaScript', async () => {
    const data = [{ name: '테스트 대피소' }];
    const fetchMock = vi.fn(async () => jsonResponse(data));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTsunamiShelters()).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith('/data/tsunami.json');
  });

  it('rejects malformed static data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })));
    await expect(fetchTsunamiShelters()).rejects.toThrow('형식이 올바르지 않습니다');
  });
});

describe('fetchCivilShelters', () => {
  it('loads the selected city partition', async () => {
    const data = [{ FCLT_NM: '테스트 민방위 대피시설' }];
    const fetchMock = vi.fn(async () => jsonResponse(data));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCivilShelters('부산광역시')).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith('/data/civil/busan.json');
  });

  it('maps the reorganized Gwangju name to the Gwangju partition', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCivilShelters('전남광주통합특별시');
    expect(fetchMock).toHaveBeenCalledWith('/data/civil/gwangju.json');
  });

  it('rejects malformed city data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })));
    await expect(fetchCivilShelters('서울특별시')).rejects.toThrow('형식이 올바르지 않습니다');
  });
});
