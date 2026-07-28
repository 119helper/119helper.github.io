import { describe, expect, it } from 'vitest';
import { normalizeEmergencyHeadquarters } from './emergencyRegions';

describe('emergency headquarters normalization', () => {
  it('maps app region labels to the required upstream headquarters name', () => {
    expect(normalizeEmergencyHeadquarters('서울')).toBe('서울소방재난본부');
    expect(normalizeEmergencyHeadquarters('인천광역시')).toBe('인천소방본부');
    expect(normalizeEmergencyHeadquarters('제주')).toBe('제주소방안전본부');
  });

  it('keeps an already normalized headquarters name intact', () => {
    expect(normalizeEmergencyHeadquarters('서울소방재난본부')).toBe('서울소방재난본부');
  });
});
