import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAed } from './aed';

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items><item><org>광주소방서</org></item></items><totalCount>1</totalCount></body></response>`;

describe('AED nearby proxy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards validated coordinates without exposing the key to the client response', async () => {
    const fetchMock = vi.fn(async () => new Response(SUCCESS_XML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleAed(
      new URL('https://example.test/api/aed/nearby?lat=35.1595&lng=126.8526&numOfRows=25'),
      'test+key/value',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(upstream.hostname).toBe('apis.data.go.kr');
    expect(upstream.searchParams.get('WGS84_LAT')).toBe('35.1595');
    expect(upstream.searchParams.get('WGS84_LON')).toBe('126.8526');
    expect(upstream.searchParams.get('numOfRows')).toBe('25');
    expect(result).toEqual({ data: { xml: SUCCESS_XML }, cacheTtl: 300 });
  });

  it('rejects invalid coordinates before making an upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleAed(
      new URL('https://example.test/api/aed/nearby?lat=999&lng=126.9'),
      'test-key',
    )).rejects.toThrow('INVALID_COORDINATE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces public-data authorization errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE KEY IS NOT REGISTERED ERROR.</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>',
      { status: 200 },
    )));

    await expect(handleAed(
      new URL('https://example.test/api/aed/nearby?lat=35.1&lng=126.8'),
      'test-key',
    )).rejects.toThrow('API_RESULT_30');
  });
});
