import { describe, expect, it } from 'vitest';
import {
  getDistanceKm,
  getNearestSupportedCity,
  kakaoRegionToCity,
  SUPPORTED_CITY_COORDS,
} from './locationResolver';

describe('getDistanceKm', () => {
  it('returns ~0 for identical points', () => {
    expect(getDistanceKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBeCloseTo(0, 5);
  });

  it('is symmetric', () => {
    const a = getDistanceKm({ lat: 35.1, lng: 129 }, { lat: 37.5, lng: 127 });
    const b = getDistanceKm({ lat: 37.5, lng: 127 }, { lat: 35.1, lng: 129 });
    expect(a).toBeCloseTo(b, 6);
  });

  it('computes a sane Seoul→Busan distance (~320km)', () => {
    const d = getDistanceKm(SUPPORTED_CITY_COORDS.seoul, SUPPORTED_CITY_COORDS.busan);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(340);
  });
});

describe('getNearestSupportedCity', () => {
  it('matches a city to itself', () => {
    const seoul = SUPPORTED_CITY_COORDS.seoul;
    const nearest = getNearestSupportedCity(seoul.lat, seoul.lng);
    expect(nearest.key).toBe('seoul');
    expect(nearest.distanceKm).toBeCloseTo(0, 3);
  });

  it('picks Busan for a coordinate near Busan', () => {
    const nearest = getNearestSupportedCity(35.18, 129.08);
    expect(nearest.key).toBe('busan');
    expect(nearest.distanceKm).toBeLessThan(10);
  });

  it('picks Jeju for a southern-island coordinate', () => {
    const nearest = getNearestSupportedCity(33.45, 126.55);
    expect(nearest.key).toBe('jeju');
  });
});

describe('kakaoRegionToCity', () => {
  it('keeps only the former five Gwangju districts inside the merged province', () => {
    expect(kakaoRegionToCity('전남광주통합특별시', '서구')).toBe('gwangju');
    expect(kakaoRegionToCity('전남광주통합특별시', '목포시')).toBeUndefined();
    expect(kakaoRegionToCity('전남광주통합특별시')).toBeUndefined();
  });

  it('still supports the legacy Gwangju name during provider transition', () => {
    expect(kakaoRegionToCity('광주광역시', '광산구')).toBe('gwangju');
  });
});
