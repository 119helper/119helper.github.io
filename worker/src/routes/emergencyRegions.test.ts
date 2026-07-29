import { describe, expect, it } from 'vitest';
import { normalizeEmergencyHeadquarters } from './emergencyRegions';

describe('emergency headquarters normalization', () => {
  it('maps app region labels to the required upstream headquarters name', () => {
    expect(normalizeEmergencyHeadquarters('서울')).toBe('서울소방재난본부');
    expect(normalizeEmergencyHeadquarters('부산')).toBe('부산소방본부');
    expect(normalizeEmergencyHeadquarters('대구')).toBe('대구소방본부');
    expect(normalizeEmergencyHeadquarters('인천광역시')).toBe('인천소방본부');
    expect(normalizeEmergencyHeadquarters('광주')).toBe('광주소방본부');
    expect(normalizeEmergencyHeadquarters('전남광주통합특별시')).toBe('광주소방본부');
    expect(normalizeEmergencyHeadquarters('경기')).toBe('경기소방본부');
    expect(normalizeEmergencyHeadquarters('강원특별자치도')).toBe('강원소방본부');
    expect(normalizeEmergencyHeadquarters('전북특별자치도')).toBe('전북소방본부');
    expect(normalizeEmergencyHeadquarters('제주')).toBe('제주소방본부');
  });

  it('keeps an already normalized headquarters name intact', () => {
    expect(normalizeEmergencyHeadquarters('서울소방재난본부')).toBe('서울소방재난본부');
  });
});
