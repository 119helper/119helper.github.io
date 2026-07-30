import { describe, expect, it } from 'vitest';
import {
  firewaterFreshnessFromManifest,
  getDatasetCompletenessNotices,
  isFreshnessExpired,
  type DatasetFreshness,
} from './dataFreshness';

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

describe('getDatasetCompletenessNotices', () => {
  it('explains a supported-city scope without calling it nationwide coverage', () => {
    expect(getDatasetCompletenessNotices({
      label: '민방위 대피시설',
      sourceDate: '2026-07-27',
      generatedAt: '2026-07-28T00:00:00.000Z',
      maxAgeDays: 14,
      total: 8_127,
      activeUpstreamTotal: 17_229,
      supportedCityCount: 9,
    })).toEqual([{
      tone: 'info',
      text: '앱 지원 9개 도시 8,127곳 / 전국 사용중 17,229곳',
    }]);
  });

  it('reports coordinate coverage and upstream count mismatches', () => {
    expect(getDatasetCompletenessNotices({
      label: '공중화장실',
      sourceDate: '2026-07-27',
      generatedAt: '2026-07-28T00:00:00.000Z',
      maxAgeDays: 30,
      total: 11_845,
      supportedCityTotal: 17_341,
      missingCoordinateCount: 5_496,
      supportedCityCount: 9,
      facilityCoordinateCount: 10_783,
      addressPointCount: 1_062,
      legacyGeocodedAddressPointCount: 698,
      legacySharedAddressPointCount: 42,
      officialAddressPointCount: 235,
      officialAddressPointRepairCount: 13,
      hostAddressPointCount: 87,
      nationalStandardHostAddressPointCount: 82,
      municipalHostAddressPointCount: 5,
    })).toEqual([{
      tone: 'warning',
      text: '지원 9개 도시 전체 원본 17,341곳 중 지도 표시 11,845곳 (68.3%) · 시설 좌표 10,783곳 · 주소 대표점 1,062곳 · 좌표 미확인 5,496곳',
    }, {
      tone: 'warning',
      text: '주소 대표점 1,062곳 · 기존 주소 지오코딩 698 · 동일 주소 이전 공식 좌표 42 · 부산 공식 도로명주소 235 · 전국 표준 호스트 시설 82 · 용산 지자체 호스트 시설 5 (기존 오류 좌표 13곳 교정 포함) · 실제 화장실 위치나 출입구와 다를 수 있음',
    }]);

    expect(getDatasetCompletenessNotices({
      label: '지진해일 대피소',
      sourceDate: '2026-07-29',
      generatedAt: '2026-07-28T00:00:00.000Z',
      maxAgeDays: 90,
      total: 647,
      announcedTotal: 680,
      countDelta: -33,
      reconciliationStatus: 'upstream-mismatch',
      regionCounts: {
        강원특별자치도: 185,
        경상북도: 361,
        부산광역시: 57,
        울산광역시: 44,
      },
    })[0].text).toBe('공개 API 647곳 / 관리대장 발표 680곳 · 33곳 차이');
  });

  it('shows regional firewater overlay provenance and unresolved source defects', () => {
    const notices = getDatasetCompletenessNotices({
      label: '소화전',
      sourceDate: '2024-02-07',
      generatedAt: '2026-07-29',
      maxAgeDays: 120,
      supportedCityCount: 9,
      coverageScope: 'supported-cities-with-verified-regional-overlays',
      regionalOverlays: [{
        id: 'gwangju-gwangsan-firewater',
        city: '광주광역시',
        district: '광산구',
        overlayKind: 'district-replacement',
        sourceDate: '2026-05-07',
        total: 1_560,
        coordinateMappedCount: 1_559,
        baselineCoordinateBackfillCount: 46,
        missingCoordinateCount: 1,
        duplicateFacilityNumberCount: 18,
        duplicateFacilityNumberRows: 40,
        normalizedAddressCount: 84,
      }],
    });

    expect(notices.map(notice => notice.text)).toContain(
      '광산구 최신 원본 1,560곳(2026-05-07) 적용 · 지도 1,559곳(이 중 46곳은 정확 주소가 같은 이전 좌표 유지) · 좌표 미확인 1곳',
    );
    expect(notices.map(notice => notice.text)).toContain(
      '공급기관 시설번호 중복 18개(40행)는 임의 삭제하지 않음',
    );
    expect(notices.map(notice => notice.text)).toContain(
      '공급기관 주소의 시군구 누락 84행은 별도 시군구 필드로 보정',
    );
  });

  it('labels a partial firewater source as corroboration without implying replacement', () => {
    const notices = getDatasetCompletenessNotices({
      label: '소화전',
      sourceDate: '2024-02-07',
      generatedAt: '2026-07-30',
      maxAgeDays: 120,
      regionalOverlays: [{
        id: 'gwangju-bukgu-firewater-corroboration',
        city: '광주광역시',
        district: '북구',
        overlayKind: 'partial-corroboration',
        replacementScope: 'none',
        sourceDate: '2025-08-22',
        sourceTotal: 1_031,
        targetTotal: 1_088,
        matchedCount: 698,
        unmatchedCount: 246,
        ambiguousMatchCount: 87,
        coordinatesPreserved: true,
      }],
    });

    expect(notices).toContainEqual({
      tone: 'warning',
      text: '북구 최신 원본 1,031행(2025-08-22) 중 기존 지도점 698곳 일대일 교차검증 · 미일치 246행 · 중복/다의 87행은 미적용 · 기존 1,088곳 주소·좌표 유지',
    });
    expect(notices.some(notice => notice.text.includes('적용 · 지도'))).toBe(false);
  });

  it('summarizes official restroom coordinate supplements separately from dataset replacements', () => {
    const notices = getDatasetCompletenessNotices({
      label: '공중화장실',
      sourceDate: '2026-07-27',
      generatedAt: '2026-07-30',
      maxAgeDays: 30,
      regionalCoordinateCount: 1_097,
      regionalCoordinateCoverageGainCount: 1_094,
      regionalCoordinateUpgradeCount: 3,
      coordinateOverlays: [
        {
          id: 'seoul-oa-22586-restrooms',
          label: '서울특별시',
          sourceDate: '2026-07-30',
          sourceTotal: 4_411,
          matchedCount: 1_601,
          exactMatchedCount: 1_329,
          addressNameContainedMatchedCount: 272,
          coverageGainCount: 664,
          precisionUpgradeCount: 3,
        },
        {
          id: 'seoul-metro-station-restrooms',
          label: '서울 지하철 1~8호선',
          sourceDate: '2026-02-12',
          sourceTotal: 304,
          matchedCount: 15,
          exactMatchedCount: 0,
          addressNameContainedMatchedCount: 15,
          coverageGainCount: 15,
        },
        {
          id: 'daejeon-seogu-open-restrooms',
          label: '대전 서구',
          sourceDate: '2026-05-18',
          sourceTotal: 129,
          matchedCount: 26,
          exactMatchedCount: 26,
          addressNameContainedMatchedCount: 0,
          coverageGainCount: 26,
        },
        {
          id: 'jeju-city-public-restrooms',
          label: '제주시',
          sourceDate: '2025-12-31',
          sourceTotal: 503,
          matchedCount: 326,
          coverageGainCount: 326,
        },
        {
          id: 'busan-dongnae-open-restrooms',
          label: '동래구',
          sourceDate: '2026-06-01',
          sourceTotal: 138,
          matchedCount: 39,
          coverageGainCount: 39,
        },
        {
          id: 'busan-galmaetgil-restrooms',
          label: '부산 갈맷길',
          sourceDate: '2025-10-30',
          sourceTotal: 197,
          matchedCount: 56,
          coverageGainCount: 24,
        },
      ],
    });

    expect(notices).toContainEqual({
      tone: 'info',
      text: '공식 지역 시설 좌표 보충 1,094곳 · 주소 대표점에서 시설 좌표로 개선 3곳 · 서울특별시 664 · 서울 지하철 1~8호선 15 · 대전 서구 26 · 제주시 326 · 동래구 39 · 부산 갈맷길 24',
    });
  });
});

describe('firewaterFreshnessFromManifest', () => {
  it('uses category-specific totals', () => {
    const manifest = {
      maxAgeDays: 120,
      supportedCityCount: 9,
      coverageScope: 'supported-cities-with-verified-regional-overlays',
      completenessStatus: 'partial' as const,
      cities: {
        광주광역시: {
          city: '광주광역시',
          sourceDate: '2024-02-07',
          generatedAt: '2026-07-29',
          total: 4_932,
          hydrants: 4_831,
          waterTowers: 101,
        },
      },
    };

    expect(firewaterFreshnessFromManifest('hydrants', 'gwangju', manifest)?.total).toBe(4_831);
    expect(firewaterFreshnessFromManifest('waterTowers', 'gwangju', manifest)?.total).toBe(101);
  });
});
