import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLastKnownGood, referenceCachePolicy, saveLastKnownGood } from './referenceCache';

function memoryKv() {
  const values = new Map<string, string>();
  return {
    values,
    binding: {
      get: vi.fn(async (key: string) => {
        const value = values.get(key);
        return value ? JSON.parse(value) : null;
      }),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    } as unknown as KVNamespace,
  };
}

describe('last-known-good reference cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('excludes operationally time-sensitive endpoints', () => {
    expect(referenceCachePolicy('/api/consumer-hazard')).not.toBeNull();
    expect(referenceCachePolicy('/api/weather/now')).toBeNull();
    expect(referenceCachePolicy('/api/er/beds')).toBeNull();
    expect(referenceCachePolicy('/api/disaster-msg')).toBeNull();
  });

  it('keeps current-year fire snapshots shorter than completed years', () => {
    const currentYear = new Date().getUTCFullYear();
    expect(referenceCachePolicy(`/api/fire-annual/${currentYear}`)?.maxAgeSeconds).toBe(14 * 24 * 60 * 60);
    expect(referenceCachePolicy('/api/fire-annual/2025')?.maxAgeSeconds).toBe(
      currentYear === 2025 ? 14 * 24 * 60 * 60 : 365 * 24 * 60 * 60,
    );
  });

  it('stores and restores a normalized successful response', async () => {
    const { binding } = memoryKv();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const writeUrl = new URL('https://worker.test/api/holiday?month=01&year=2026&_t=123');
    await saveLastKnownGood(binding, writeUrl, { xml: '<ok />' });

    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const readUrl = new URL('https://worker.test/api/holiday?year=2026&month=01');
    await expect(readLastKnownGood(binding, readUrl)).resolves.toEqual({
      cachedAt: 1_000,
      data: { xml: '<ok />' },
    });
  });

  it('never replaces a good copy with an upstream error payload', async () => {
    const { binding, values } = memoryKv();
    const url = new URL('https://worker.test/api/civil-shelter?ctprvnNm=서울');
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await saveLastKnownGood(binding, url, [{ FCLT_NM: '정상 대피소' }]);

    await saveLastKnownGood(binding, url, { error: 'API_HTTP_503', message: 'Service Unavailable' });

    expect(values.size).toBe(1);
    await expect(readLastKnownGood(binding, url)).resolves.toEqual({
      cachedAt: 1_000,
      data: [{ FCLT_NM: '정상 대피소' }],
    });
  });

  it('ignores error payloads that an older worker version already stored', async () => {
    const { binding, values } = memoryKv();
    const url = new URL('https://worker.test/api/tsunami-shelter');
    await saveLastKnownGood(binding, url, [{ name: 'seed' }]);
    const [key] = [...values.keys()];
    values.set(key, JSON.stringify({ version: 1, cachedAt: Date.now(), data: { error: 'WORKER_FETCH_ERROR' } }));

    await expect(readLastKnownGood(binding, url)).resolves.toBeNull();
  });
});
