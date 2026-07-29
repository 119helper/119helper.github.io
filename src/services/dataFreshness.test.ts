import { describe, expect, it } from 'vitest';
import { isFreshnessExpired, type DatasetFreshness } from './dataFreshness';

describe('isFreshnessExpired', () => {
  const base: DatasetFreshness = {
    label: '소화전',
    sourceDate: '2024-02-07',
    generatedAt: '2026-07-28T00:00:00.000Z',
    maxAgeDays: 120,
  };

  it('uses the upstream source date before the local regeneration time', () => {
    expect(isFreshnessExpired(base, new Date('2026-07-29T00:00:00Z').getTime())).toBe(true);
  });

  it('falls back to generatedAt only when no source date exists', () => {
    expect(isFreshnessExpired(
      { ...base, sourceDate: null },
      new Date('2026-07-29T00:00:00Z').getTime(),
    )).toBe(false);
  });
});
