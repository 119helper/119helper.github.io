import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleER } from './er';

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items></items><totalCount>0</totalCount></body></response>`;

describe('ER proxy response validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a complete public-data success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SUCCESS_XML, { status: 200 })));

    await expect(handleER(
      '/api/er/beds',
      new URL('https://example.test/api/er/beds?sido=서울특별시'),
      'test-key',
    )).resolves.toEqual({ data: { xml: SUCCESS_XML }, cacheTtl: 60 });
  });

  it('rejects an HTTP 200 authorization XML instead of caching it as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE KEY IS NOT REGISTERED ERROR.</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>',
      { status: 200 },
    )));

    await expect(handleER(
      '/api/er/beds',
      new URL('https://example.test/api/er/beds?sido=서울특별시'),
      'test-key',
    )).rejects.toThrow('API_RESULT_30');
  });

  it('rejects malformed or status-less XML instead of treating it as zero hospitals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<response><body><items></items></body></response>',
      { status: 200 },
    )));

    await expect(handleER(
      '/api/er/list',
      new URL('https://example.test/api/er/list?sido=서울특별시'),
      'test-key',
    )).rejects.toThrow('MISSING_SUCCESS_CODE');
  });
});
