import { afterEach, describe, expect, it, vi } from 'vitest';
import nfdsSnapshotDocument from '../data/nfdsAnnualFireSnapshots.json';
import { ANNUAL_FIRE_CACHE_VERSION, handleAnnualFireStats } from './annualFireStats';

const currentYear = Object.keys(nfdsSnapshotDocument.snapshots)
  .sort((a, b) => Number(b) - Number(a))
  .find(year => nfdsSnapshotDocument.snapshots[year as keyof typeof nfdsSnapshotDocument.snapshots].coverageType === 'partial');
if (!currentYear) throw new Error('NFDS partial snapshot is missing');
const currentSnapshot = nfdsSnapshotDocument.snapshots[
  currentYear as keyof typeof nfdsSnapshotDocument.snapshots
];

describe('handleAnnualFireStats', () => {
  it('versions the edge cache with the generated snapshot', () => {
    expect(ANNUAL_FIRE_CACHE_VERSION).toBe(nfdsSnapshotDocument.generatedAt);
  });

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
      latestYear: currentYear,
      latestCompleteYear: nfdsSnapshotDocument.latestCompleteYear,
      latestDataThrough: currentSnapshot.dataThrough,
    });
    expect((result.data as { years: string[] }).years).toContain('2015');
    expect((result.data as { years: string[] }).years).toContain('2024');
    expect((result.data as { years: string[] }).years).toContain('2025');
    expect((result.data as { years: string[] }).years).toContain('2026');
    expect((result.data as { regionalMonthlyYears: string[] }).regionalMonthlyYears).toEqual([
      '2026',
      '2025',
      '2024',
    ]);
  });

  it('serves the stored, internally verified 2025 NFDS snapshot without an API key', async () => {
    const result = await handleAnnualFireStats(
      '/api/fire-annual/2025',
      new URL('https://api.example.test/api/fire-annual/2025'),
      '',
    );

    expect(result.data).toMatchObject({
      year: '2025',
      coverageType: 'complete',
      dataThrough: '2025-12-31',
      propertyDamageUnit: 'thousandWon',
      summary: {
        totalFires: 38_344,
        totalDeaths: 346,
        totalInjuries: 2_390,
        totalPropertyDamage: nfdsSnapshotDocument.snapshots['2025'].summary.totalPropertyDamage,
      },
      regionalMonthlyGranularity: 'sido-month',
    });
    const january = (result.data as {
      byMonth: Array<{ month: string; count: number; bySido: Array<{ name: string; count: number }> }>;
    }).byMonth[0];
    expect(january).toMatchObject({
      month: '1월',
      count: 3_742,
      bySido: expect.arrayContaining([
        expect.objectContaining({ name: '서울특별시', count: 514 }),
        expect.objectContaining({ name: '광주광역시', count: 65 }),
      ]),
    });
  });

  it('labels the latest NFDS snapshot as year-to-date and preserves unclassified regions', async () => {
    const result = await handleAnnualFireStats(
      `/api/fire-annual/${currentYear}`,
      new URL(`https://api.example.test/api/fire-annual/${currentYear}`),
      '',
    );

    expect(result.data).toMatchObject({
      year: currentYear,
      coverageType: 'partial',
      dataThrough: currentSnapshot.dataThrough,
      regionalClassification: {
        classifiedCount: currentSnapshot.regionalClassification.classifiedCount,
        unclassifiedCount: currentSnapshot.regionalClassification.unclassifiedCount,
      },
      summary: {
        totalFires: currentSnapshot.summary.totalFires,
      },
    });
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

  it('keeps the response contract when an older ODCloud year has zero rows', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [],
      totalCount: 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleAnnualFireStats(
      '/api/fire-annual/2023',
      new URL('https://api.example.test/api/fire-annual/2023'),
      'annual-key',
    );

    expect(result.data).toMatchObject({
      year: '2023',
      totalRecords: 0,
      coverageType: 'complete',
      dataThrough: '2023-12-31',
      propertyDamageUnit: 'thousandWon',
      summary: { totalFires: 0 },
      bySido: [],
      byMonth: expect.any(Array),
    });
  });
});
