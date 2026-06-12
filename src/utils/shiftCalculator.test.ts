import { describe, expect, it } from 'vitest';
import { getShiftForDate, type ShiftSetting } from './shiftCalculator';

const activeSetting: ShiftSetting = {
  isActive: true,
  baseDate: '2026-06-12',
  baseShift: '당직',
};

describe('getShiftForDate', () => {
  it('returns null when shift calculation is disabled', () => {
    expect(getShiftForDate('2026-06-12', { ...activeSetting, isActive: false })).toBeNull();
  });

  it('returns the base shift on the base date', () => {
    expect(getShiftForDate('2026-06-12', activeSetting)).toBe('당직');
  });

  it('cycles forward through 당직-첫비-둘비', () => {
    expect(getShiftForDate('2026-06-13', activeSetting)).toBe('첫비');
    expect(getShiftForDate('2026-06-14', activeSetting)).toBe('둘비');
    expect(getShiftForDate('2026-06-15', activeSetting)).toBe('당직');
  });

  it('cycles backward safely for dates before the base date', () => {
    expect(getShiftForDate('2026-06-11', activeSetting)).toBe('둘비');
    expect(getShiftForDate('2026-06-10', activeSetting)).toBe('첫비');
  });

  it('returns null for invalid date strings', () => {
    expect(getShiftForDate('not-a-date', activeSetting)).toBeNull();
    expect(getShiftForDate('2026-02-31', activeSetting)).toBeNull();
    expect(getShiftForDate('2026-06-12', { ...activeSetting, baseDate: '2026-13-01' })).toBeNull();
  });
});
