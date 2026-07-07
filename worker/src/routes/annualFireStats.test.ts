import { describe, expect, it } from 'vitest';
import { handleAnnualFireStats } from './annualFireStats';

describe('handleAnnualFireStats', () => {
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
});
