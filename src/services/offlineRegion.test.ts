// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVerifiedRegionStatus } from './offlineRegion';

const STATUS_KEY = '119helper-offline-region';

describe('getVerifiedRegionStatus', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks legacy status without an expected URL list as unverified', async () => {
    localStorage.setItem(STATUS_KEY, JSON.stringify({
      city: 'seoul', downloadedAt: 1, fileCount: 4, failedCount: 0,
    }));
    vi.stubGlobal('caches', { open: vi.fn() });

    await expect(getVerifiedRegionStatus()).resolves.toMatchObject({ verified: false });
  });

  it('recounts missing files from the actual data cache', async () => {
    const expectedUrls = ['/data/a.json', '/data/b.json', '/data/c.json'];
    localStorage.setItem(STATUS_KEY, JSON.stringify({
      city: 'seoul', downloadedAt: 1, fileCount: 3, failedCount: 0, expectedUrls,
    }));
    const match = vi.fn(async (url: string) => url === '/data/b.json' ? undefined : new Response('{}'));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) });

    await expect(getVerifiedRegionStatus()).resolves.toMatchObject({
      verified: true,
      fileCount: 2,
      failedCount: 1,
    });
    expect(match).toHaveBeenCalledTimes(3);
  });
});
