import { describe, expect, it } from 'vitest';
import {
  disasterLocationMatchesCity,
  districtFromAddress,
  isAddressInAppCity,
  isFormerGwangjuAddress,
  normalizeLiveGwangjuAddress,
} from './administrativeRegions';

describe('2026 administrative-region compatibility', () => {
  it('keeps the app Gwangju boundary at the former five districts', () => {
    expect(isFormerGwangjuAddress('전남광주통합특별시 서구 상무대로 1')).toBe(true);
    expect(isFormerGwangjuAddress('광주광역시 광산구 첨단로 2')).toBe(true);
    expect(isAddressInAppCity('gwangju', '전남광주통합특별시 목포시 영산로 3')).toBe(false);
  });

  it('repairs duplicated transition-period Gwangju addresses', () => {
    expect(normalizeLiveGwangjuAddress(
      '광주광역시 서구 전남광주통합특별시 서구 내방로 111',
    )).toBe('전남광주통합특별시 서구 내방로 111');
  });

  it('recognizes the reorganized Incheon districts and rejects road names as districts', () => {
    expect(districtFromAddress('인천광역시 제물포구 송림동 1', 'incheon')).toBe('제물포구');
    expect(districtFromAddress('인천광역시 검단구 당하동 2', 'incheon')).toBe('검단구');
    expect(districtFromAddress('인천광역시 굴포로 141', 'incheon')).toBe('기타');
  });

  it('does not route merged-province subregion messages to former Gwangju', () => {
    expect(disasterLocationMatchesCity('gwangju', '전남광주통합특별시 목포시')).toBe(false);
    expect(disasterLocationMatchesCity('gwangju', '전남광주통합특별시 북구')).toBe(true);
    expect(disasterLocationMatchesCity('gwangju', '전국')).toBe(true);
  });
});
