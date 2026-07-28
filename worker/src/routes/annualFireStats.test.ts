import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAnnualFireStats } from './annualFireStats';

describe('handleAnnualFireStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns supported annual fire statistic years without upstream credentials', async () => {
    const result = await handleAnnualFireStats(
      '/api/fire-annual/years',
      new URL('https://api.example.test/api/fire-annual/years'),
      ''
    );

    expect(result.cacheTtl).toBe(86400);
    expect(result.data).toMatchObject({
      latestYear: '2024',
      sourceName: '소방청_연간화재통계_20241231',
    });
    expect((result.data as { years: string[] }).years).toContain('2015');
    expect((result.data as { years: string[] }).years).toContain('2024');
  });

  it('probes the real upstream key without downloading the full annual dataset', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      currentCount: 1,
      data: [{}],
      matchCount: 1,
      page: 1,
      perPage: 1,
      totalCount: 123,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleAnnualFireStats(
      '/api/fire-annual/probe',
      new URL('https://api.example.test/api/fire-annual/probe'),
      'annual-key',
    );

    expect(result.cacheTtl).toBe(3600);
    expect(result.data).toMatchObject({ status: 'ok', year: '2024', totalCount: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('perPage=1');
  });
});
