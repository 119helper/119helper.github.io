// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadRegionData, getVerifiedRegionStatus } from './offlineRegion';

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
    const open = vi.fn(async () => ({ match }));
    vi.stubGlobal('caches', { open });

    await expect(getVerifiedRegionStatus()).resolves.toMatchObject({
      verified: true,
      fileCount: 2,
      failedCount: 1,
    });
    expect(open).toHaveBeenCalledWith('119-data-v2');
    expect(match).toHaveBeenCalledTimes(3);
  });
});

describe('downloadRegionData', () => {
  it('includes address-point district overlays in the v2 offline bundle', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/firewater/서울특별시/index.json') {
        return new Response(JSON.stringify({ districts: { 종로구: 1 } }), { status: 200 });
      }
      if (url === '/data/restrooms/seoul/index.json') {
        return new Response(JSON.stringify({ districts: { 종로구: 1 } }), { status: 200 });
      }
      if (url === '/data/restroom-address-points/seoul/index.json') {
        return new Response(JSON.stringify({ districts: { 종로구: 1 } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const put = vi.fn(async () => undefined);
    const open = vi.fn(async () => ({ put }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', { open });

    const result = await downloadRegionData('seoul');

    expect(open).toHaveBeenCalledWith('119-data-v2');
    expect(result.expectedUrls).toContain('/data/restroom-address-points/seoul/index.json');
    expect(result.expectedUrls).toContain('/data/restroom-address-points/seoul/종로구.json');
    expect(result.failedCount).toBe(0);
    expect(put).toHaveBeenCalledTimes(result.expectedUrls?.length ?? 0);
  });
});
