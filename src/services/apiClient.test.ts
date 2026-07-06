import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, StaleDataError } from './apiClient';

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
});
