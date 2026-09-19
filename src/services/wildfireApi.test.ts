import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', () => ({
  apiFetch: apiFetchMock,
}));

import { fetchWildfires } from './wildfireApi';

const response = {
  body: [{ FRSTFR_INFO_ID: 'f1', FRSTFR_DCLR_ADDR: '강원특별자치도 강릉시', FRSTFR_GNT_DT: '2026/09/18 10:00:00' }],
  totalCount: 1,
};

describe('fetchWildfires', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(response);
  });

  it('keeps the fresh-cache window shorter than the 5-minute poll', async () => {
    await fetchWildfires('200', '1', true);

    const options = apiFetchMock.mock.calls[0][2];
    expect(options.cacheTtlMs).toBeGreaterThan(0);
    expect(options.cacheTtlMs).toBeLessThan(5 * 60 * 1000);
    expect(options.maxStaleMs).toBe(60 * 60 * 1000);
  });

  it('passes the refresh button through to the API cache', async () => {
    await fetchWildfires('200', '1', true);

    expect(apiFetchMock.mock.calls[0][2].forceRefresh).toBe(true);
  });
});
