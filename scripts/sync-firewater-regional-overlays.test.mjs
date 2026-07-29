import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backfillVerifiedBaselineCoordinates,
  normalizeRegionalRows,
  parseCsv,
} from './sync-firewater-regional-overlays.mjs';

const source = {
  id: 'fixture',
  city: '광주광역시',
  district: '광산구',
  publicDataPk: 'fixture',
  minimumSourceDate: '2025-01-01',
  minimumRows: 2,
  maximumRows: 3,
  latitudeRange: [34.9, 35.4],
  longitudeRange: [126.6, 127.1],
};

test('quoted CSV를 읽고 지역 소방용수 스키마로 정규화한다', () => {
  const csv = [
    '시설번호,시설유형코드,시도명,시군구명,시군구코드,소재지도로명주소,소재지지번주소,위도,경도,상세위치,안전센터명,보호틀유무,사용가능여부,설치연도,배관깊이,출수압력,배관지름,관할기관명,관할기관전화번호,데이터기준일자',
    '광산-1,1,광주광역시,광산구,29200,"광주, 도로 1",,35.1,126.8,앞,센터,N,Y,2020,1,5,100,광산소방서,062,2026-05-07',
    '광산-2,4,광주광역시,광산구,29200,,,,"",뒤,센터,Y,Y,2021,1,4,100,광산소방서,062,2026-05-07',
  ].join('\r\n');
  const normalized = normalizeRegionalRows(parseCsv(csv), source);

  assert.equal(normalized.items.length, 2);
  assert.equal(normalized.items[0].rdnmadr, '광주, 도로 1');
  assert.equal(normalized.hydrants, 1);
  assert.equal(normalized.waterTowers, 1);
  assert.equal(normalized.coordinateMappedCount, 1);
  assert.equal(normalized.missingCoordinateCount, 1);
  assert.equal(normalized.sourceDate, '2026-05-07');
});

test('범위 밖 최신 좌표는 정확히 같은 주소의 검증된 기준 좌표만 보충한다', () => {
  const items = [{
    fcltyNo: '광산-1',
    fcltySeCode: '1',
    fcltySeNm: '소화전',
    rdnmadr: '광주광역시 광산구 도로 1',
    lnmadr: '',
    latitude: '',
    longitude: '',
    sourceLatitude: '36.1',
    sourceLongitude: '126.8',
    coordinateSource: 'invalid-or-out-of-region',
  }];
  const baselineItems = [{
    fcltyNo: '과거-1',
    fcltySeCode: '1',
    fcltySeNm: '소화전',
    rdnmadr: '광주광역시 광산구 도로 1',
    latitude: '35.1',
    longitude: '126.8',
    referenceDate: '2024-02-07',
  }];
  const result = backfillVerifiedBaselineCoordinates(items, baselineItems, source);

  assert.equal(result.backfilledCount, 1);
  assert.equal(result.coordinateMappedCount, 1);
  assert.equal(result.items[0].coordinateSource, 'national-standard-baseline-exact-address-match');
  assert.equal(result.items[0].coordinateSourceDate, '2024-02-07');
});

test('같은 주소의 과거 행이 여러 개여도 좌표가 하나로 일치하면 보충한다', () => {
  const items = [{
    fcltyNo: '광산-9',
    fcltySeCode: '1',
    fcltySeNm: '소화전',
    rdnmadr: '광주광역시 광산구 무진대로 218',
    lnmadr: '광주광역시 광산구 우산동 1607-1',
    latitude: '',
    longitude: '',
    sourceLatitude: '36.1',
    sourceLongitude: '126.8',
    coordinateSource: 'invalid-or-out-of-region',
  }];
  const baselineItems = ['과거-1', '과거-2'].map(fcltyNo => ({
    fcltyNo,
    fcltySeCode: '1',
    fcltySeNm: '소화전',
    rdnmadr: '광주광역시 광산구 무진대로 218',
    lnmadr: '광주광역시 광산구 우산동 1607-1',
    latitude: '35.1614',
    longitude: '126.8040',
    referenceDate: '2024-02-07',
  }));
  const result = backfillVerifiedBaselineCoordinates(items, baselineItems, source);

  assert.equal(result.backfilledCount, 1);
  assert.equal(result.items[0].latitude, '35.1614');
});

test('관할 밖 행은 도시 전체에 섞지 않는다', () => {
  const rows = [
    {
      시설번호: '남구-1',
      시설유형코드: '1',
      시도명: '광주광역시',
      시군구명: '남구',
      위도: '35.1',
      경도: '126.8',
      데이터기준일자: '2026-05-07',
    },
    {
      시설번호: '광산-1',
      시설유형코드: '1',
      시도명: '광주광역시',
      시군구명: '광산구',
      위도: '35.1',
      경도: '126.8',
      데이터기준일자: '2026-05-07',
    },
  ];

  assert.throws(
    () => normalizeRegionalRows(rows, source),
    /범위 밖 시군구/,
  );
});

test('주소에서 빠진 시군구는 원본의 별도 시군구 필드로 보정하고 원문도 남긴다', () => {
  const rows = [
    {
      시설번호: '광산-1',
      시설유형코드: '1',
      시도명: '광주광역시',
      시군구명: '광산구',
      위도: '35.1',
      경도: '126.8',
      소재지지번주소: '광주광역시 흑석동 658',
      데이터기준일자: '2026-05-07',
    },
    {
      시설번호: '광산-2',
      시설유형코드: '1',
      시도명: '광주광역시',
      시군구명: '광산구',
      위도: '35.2',
      경도: '126.9',
      소재지지번주소: '광주광역시 광산구 수완동 1',
      데이터기준일자: '2026-05-07',
    },
  ];
  const normalized = normalizeRegionalRows(rows, source);

  assert.equal(normalized.normalizedAddressCount, 1);
  assert.equal(normalized.items[0].lnmadr, '광주광역시 광산구 흑석동 658');
  assert.equal(normalized.items[0].sourceLnmadr, '광주광역시 흑석동 658');
});
