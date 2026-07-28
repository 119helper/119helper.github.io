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
});
