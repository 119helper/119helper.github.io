import { describe, expect, it } from 'vitest';
import type { ERRealTimeData } from '../services/erApi';
import { haversineKm, matchHospitals } from './hospitalMatch';

// 최소 필드만 채운 ER 실시간 데이터 픽스처
function er(partial: Partial<ERRealTimeData>): ERRealTimeData {
  return {
    rnum: '', dutyName: '병원', dutyAddr: '주소', dutyTel3: '02-000-0000',
    hpbdn: '', hpccuyn: '', hpcuyn: '', hvec: '', hvgc: '', hvoc: '',
    hvs01: '', hvs02: '', hvs37: '', hvs38: '',
    wgs84Lat: '', wgs84Lon: '', dutyHayn: '', dutyInf: '', phpid: '', hvidate: '',
    ...partial,
  };
}

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineKm(37.5, 127, 37.5, 127)).toBeCloseTo(0, 5);
  });

  it('computes a known short distance (서울시청 → 강남역 ≈ 8~9km)', () => {
    const d = haversineKm(37.5663, 126.9779, 37.4979, 127.0276);
    expect(d).toBeGreaterThan(7);
    expect(d).toBeLessThan(10);
  });

  it('is symmetric', () => {
    const a = haversineKm(35.1, 129.0, 37.5, 127.0);
    const b = haversineKm(37.5, 127.0, 35.1, 129.0);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('matchHospitals', () => {
  it('without origin, sorts by available ER beds descending', () => {
    const result = matchHospitals([
      er({ dutyName: 'A', hvec: '2' }),
      er({ dutyName: 'B', hvec: '9' }),
      er({ dutyName: 'C', hvec: '5' }),
    ]);
    expect(result.map(h => h.name)).toEqual(['B', 'C', 'A']);
  });

  it('pushes hospitals with 0 / unknown ER beds to the back', () => {
    const result = matchHospitals([
      er({ dutyName: 'Zero', hvec: '0' }),
      er({ dutyName: 'Unknown', hvec: '-' }),
      er({ dutyName: 'Has', hvec: '3' }),
    ]);
    expect(result[0].name).toBe('Has');
    // 0/미상은 뒤로 — 마지막 두 자리에 위치
    expect(result.slice(1).map(h => h.name).sort()).toEqual(['Unknown', 'Zero']);
  });

  it('with origin, prioritizes nearest hospital among those with beds', () => {
    const origin = { lat: 37.5, lon: 127.0 };
    const result = matchHospitals([
      er({ dutyName: 'Far', hvec: '5', wgs84Lat: '37.7', wgs84Lon: '127.3' }),
      er({ dutyName: 'Near', hvec: '1', wgs84Lat: '37.51', wgs84Lon: '127.01' }),
    ], { origin });
    expect(result[0].name).toBe('Near');
    expect(result[0].distanceKm).not.toBeNull();
    expect(result[0].distanceKm!).toBeLessThan(result[1].distanceKm!);
  });

  it('treats hospitals with missing coordinates as lowest priority when origin given', () => {
    const origin = { lat: 37.5, lon: 127.0 };
    const result = matchHospitals([
      er({ dutyName: 'NoCoord', hvec: '8', wgs84Lat: '', wgs84Lon: '' }),
      er({ dutyName: 'WithCoord', hvec: '1', wgs84Lat: '37.51', wgs84Lon: '127.01' }),
    ], { origin });
    expect(result[0].name).toBe('WithCoord');
    expect(result[1].name).toBe('NoCoord');
    expect(result[1].distanceKm).toBeNull();
  });

  it('respects the limit option', () => {
    const beds = Array.from({ length: 12 }, (_, i) => er({ dutyName: `H${i}`, hvec: String(i + 1) }));
    expect(matchHospitals(beds, { limit: 3 })).toHaveLength(3);
    expect(matchHospitals(beds)).toHaveLength(5); // 기본 limit 5
  });

  it('parses dash and empty bed strings to null rather than 0-as-number', () => {
    const [h] = matchHospitals([er({ dutyName: 'X', hvec: '-', hvgc: '' })]);
    expect(h.erBeds).toBeNull();
    expect(h.wardBeds).toBeNull();
  });

  it('preserves stable hospital identifiers for change monitoring', () => {
    const [hospital] = matchHospitals([
      er({ dutyName: '식별 병원', hpid: 'HPID-1', phpid: 'PHPID-1' }),
    ]);

    expect(hospital).toMatchObject({
      id: 'HPID-1',
      hpid: 'HPID-1',
      phpid: 'PHPID-1',
    });
  });

  it('handles an empty input list', () => {
    expect(matchHospitals([])).toEqual([]);
  });
});
