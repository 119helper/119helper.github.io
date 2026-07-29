import { describe, expect, it } from 'vitest';
import document from './nfdsAnnualFireSnapshots.json';

interface Snapshot {
  coverageType: 'complete' | 'partial';
  dataThrough: string;
  propertyDamageUnit: string;
  summary: {
    totalFires: number;
    totalDeaths: number;
    totalInjuries: number;
    totalCasualties: number;
  };
  bySido: Array<{ count: number }>;
  regionalMonthlyGranularity: 'sido-month';
  byMonth: Array<{
    count: number;
    deaths: number;
    injuries: number;
    propertyDamage: number;
    bySido: Array<{
      count: number;
      deaths: number;
      injuries: number;
      propertyDamage: number;
    }>;
  }>;
  regionalClassification: {
    classifiedCount: number;
    unclassifiedCount: number;
  };
}

const snapshots = document.snapshots as Record<string, Snapshot>;

describe('NFDS annual fire snapshots', () => {
  it.each(Object.entries(snapshots))('%s totals are internally consistent', (_year, snapshot) => {
    expect(snapshot.bySido.reduce((sum, row) => sum + row.count, 0)).toBe(snapshot.summary.totalFires);
    expect(snapshot.byMonth.reduce((sum, row) => sum + row.count, 0)).toBe(snapshot.summary.totalFires);
    expect(snapshot.summary.totalCasualties).toBe(
      snapshot.summary.totalDeaths + snapshot.summary.totalInjuries,
    );
    expect(snapshot.propertyDamageUnit).toBe('thousandWon');
    expect(snapshot.regionalMonthlyGranularity).toBe('sido-month');
    snapshot.byMonth.forEach(month => {
      expect(month.bySido.reduce((sum, row) => sum + row.count, 0)).toBe(month.count);
      expect(month.bySido.reduce((sum, row) => sum + row.deaths, 0)).toBe(month.deaths);
      expect(month.bySido.reduce((sum, row) => sum + row.injuries, 0)).toBe(month.injuries);
      expect(month.bySido.reduce((sum, row) => sum + row.propertyDamage, 0)).toBe(
        month.propertyDamage,
      );
    });
  });

  it('keeps 2024 and 2025 complete while distinguishing the 2026 year-to-date snapshot', () => {
    expect(snapshots['2024']).toMatchObject({
      coverageType: 'complete',
      dataThrough: '2024-12-31',
      summary: { totalFires: 37_614 },
    });
    expect(snapshots['2025']).toMatchObject({
      coverageType: 'complete',
      dataThrough: '2025-12-31',
      summary: { totalFires: 38_344 },
    });
    expect(snapshots['2026']).toMatchObject({
      coverageType: 'partial',
      dataThrough: '2026-07-28',
      summary: { totalFires: 24_260 },
      regionalClassification: {
        classifiedCount: 24_229,
        unclassifiedCount: 31,
      },
    });
  });
});
