import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleConsumerHazard } from './consumerHazard';

const SUCCESS = JSON.stringify({
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: { items: { item: [] }, totalCount: 0, pageNo: 3, numOfRows: 1000 },
  },
});

describe('consumer hazard proxy pagination', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards a bounded page and row count to the official API', async () => {
    const fetchMock = vi.fn(async () => new Response(SUCCESS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await handleConsumerHazard(
      new URL('https://example.test/api/consumer-hazard?pageNo=3&numOfRows=1000'),
      'test-key',
    );

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('pageNo=3');
    expect(requestUrl).toContain('numOfRows=1000');
  });

  it('falls back to safe defaults for out-of-range pagination', async () => {
    const fetchMock = vi.fn(async () => new Response(SUCCESS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await handleConsumerHazard(
      new URL('https://example.test/api/consumer-hazard?pageNo=-1&numOfRows=50000'),
      'test-key',
    );

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('pageNo=1');
    expect(requestUrl).toContain('numOfRows=100');
  });
});
