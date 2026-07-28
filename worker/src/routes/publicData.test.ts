import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicDataText, fetchWithRetry } from './publicData';

describe('public data fetch retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a transient timeout instead of exiting the loop', async () => {
    const timeout = new Error('The operation was aborted');
    timeout.name = 'AbortError';
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicDataText('https://example.test/data', 'Example', undefined, 2))
      .resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a retryable gateway response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://example.test/data', undefined, {
      attempts: 2,
      baseDelayMs: 0,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
