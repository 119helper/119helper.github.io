import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleDamDischarge } from './damDischarge';

const XML = `<?xml version="1.0"?><response><header><resultCode>00</resultCode></header>
<body><items><item><damNm>테스트댐</damNm></item></items></body></response>`;

describe('dam discharge adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays safely disabled while approval is pending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDamDischarge(
      new URL('https://example.test/api/dam-discharge'),
      '',
      false,
    );

    expect(result.data).toMatchObject({ status: 'pending-approval', items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the official operation with a bounded date range after activation', async () => {
    const fetchMock = vi.fn(async () => new Response(XML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDamDischarge(
      new URL('https://example.test/api/dam-discharge?stDt=20260727&edDt=20260728&damCd=1001'),
      'test-key',
      true,
    );

    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(upstream.pathname).toContain('/DamDisChargeInfo/flugdschginfo');
    expect(upstream.searchParams.get('stDt')).toBe('20260727');
    expect(upstream.searchParams.get('edDt')).toBe('20260728');
    expect(upstream.searchParams.get('damCd')).toBe('1001');
    expect(result.data).toMatchObject({ status: 'active', payload: XML, format: 'xml' });
  });
});
