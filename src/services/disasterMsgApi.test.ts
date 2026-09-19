import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', () => ({
  apiFetch: apiFetchMock,
}));

import { fetchDisasterMsgs } from './disasterMsgApi';

describe('fetchDisasterMsgs', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue([]);
  });

  it('keeps the fresh-cache window shorter than the 3-minute ticker poll', async () => {
    await fetchDisasterMsgs();

    const options = apiFetchMock.mock.calls[0][2];
    expect(options.cacheTtlMs).toBeGreaterThan(0);
    expect(options.cacheTtlMs).toBeLessThan(3 * 60 * 1000);
    expect(options.maxStaleMs).toBe(60 * 60 * 1000);
  });
});
