import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPartialCorroboration,
  assertCurrentPortalSource,
  backfillVerifiedBaselineCoordinates,
  fingerprintCorroborationItems,
  normalizeCorroborationRows,
  normalizeRegionalRows,
  parseCsv,
  readHiddenInputValue,
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

test('공개 페이지의 현재 파일 detail UUID를 hidden input에서 읽는다', () => {
  const html = [
    '<input value="15054973" name="publicDataPk" type="hidden">',
    '<input type="hidden" id="publicDataDetailPk"',
    ' name="publicDataDetailPk" value="uddi:current-detail"/>',
  ].join('');

  assert.equal(readHiddenInputValue(html, 'publicDataPk'), '15054973');
  assert.equal(readHiddenInputValue(html, 'publicDataDetailPk'), 'uddi:current-detail');
  assert.equal(readHiddenInputValue(html, 'missing'), null);
  assert.deepEqual(assertCurrentPortalSource(html, {
    id: 'fixture',
    publicDataPk: '15054973',
    publicDataDetailPk: 'uddi:current-detail',
  }), {
    publicDataPk: '15054973',
    publicDataDetailPk: 'uddi:current-detail',
  });
  assert.throws(
    () => assertCurrentPortalSource(html, {
      id: 'fixture',
      publicDataPk: '15054973',
      publicDataDetailPk: 'uddi:old-detail',
    }),
    /현재 공개 페이지 식별자 .*registry/,
  );
});

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

test('부분 최신본은 양쪽에서 유일한 시설유형+도로명주소만 provenance로 연결한다', () => {
  const corroborationSource = {
    id: 'bukgu-fixture',
    strategy: 'partial-corroboration',
    city: '광주광역시',
    district: '북구',
    sourceName: '북부소방서 소방용수시설 현황',
    sourceUrl: 'https://example.test/firewater.csv',
    publicDataPk: 'fixture',
    license: '이용허락범위 제한 없음',
    expectedSourceDate: '2025-08-22',
    expectedSourceRows: 4,
    expectedTargetRows: 4,
    expectedMatchedCount: 1,
    expectedUnmatchedCount: 2,
    expectedAmbiguousRows: 1,
    expectedMatchFingerprint: '9d401e8977ff53add299581824ea1176bbd2c690190f8f9f332cd5b0cd9e6033',
    expectedTargetBodyFingerprint: 'e5fd0dfe81b29aae4b8b5232299803d07f8ec1fc96207dac794558b371d13e31',
  };
  const rows = [
    {
      연번: '1',
      소방용수시설구분: '지상식',
      동별: '문흥동',
      소재지도로명주소: '광주광역시 북구 대천로 157번길 80',
      데이터기준일자: '2025-08-22',
    },
    {
      연번: '2',
      소방용수시설구분: '지하식',
      동별: '문흥동',
      소재지도로명주소: '광주광역시 북구 없는로 2',
      데이터기준일자: '2025-08-22',
    },
    {
      연번: '3',
      소방용수시설구분: '지상식',
      동별: '오치동',
      소재지도로명주소: '광주광역시 북구 중복로 3',
      데이터기준일자: '2025-08-22',
    },
    {
      연번: '4',
      소방용수시설구분: '급수탑',
      동별: '용봉동',
      소재지도로명주소: '광주광역시 북구 없는로 4',
      데이터기준일자: '2025-08-22',
    },
  ];
  const targets = [
    {
      fcltyNo: '북부-1',
      fcltySeCode: '1 ',
      fcltySeNm: '소화전',
      rdnmadr: '광주광역시 북구 대천로157번길 80',
      lnmadr: '광주광역시 북구 문흥동 1',
      latitude: '35.1',
      longitude: '126.9',
      descLc: '앞',
    },
    {
      fcltyNo: '북부-2',
      fcltySeCode: '1',
      fcltySeNm: '소화전',
      rdnmadr: '광주광역시 북구 중복로 3',
      latitude: '35.2',
      longitude: '126.8',
    },
    {
      fcltyNo: '북부-3',
      fcltySeCode: '1',
      fcltySeNm: '소화전',
      rdnmadr: '광주광역시 북구 중복로3',
      latitude: '35.21',
      longitude: '126.81',
    },
    {
      fcltyNo: '북부-4',
      fcltySeCode: '4',
      fcltySeNm: '저수조',
      rdnmadr: '광주광역시 북구 유지로 4',
      latitude: '35.3',
      longitude: '126.85',
    },
  ];
  const normalized = normalizeCorroborationRows(rows, corroborationSource);
  const result = applyPartialCorroboration(targets, normalized, corroborationSource);
  const bodyWithoutCorroboration = result.items.map(item => {
    const { regionalCorroborations: _removed, ...body } = item;
    return body;
  });

  assert.deepEqual(bodyWithoutCorroboration, targets);
  assert.equal(result.items.length, 4);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.unmatchedCount, 2);
  assert.equal(result.ambiguousRowCount, 1);
  assert.deepEqual(
    result.items.map(item => [item.latitude, item.longitude]),
    targets.map(item => [item.latitude, item.longitude]),
  );
  assert.equal(result.items[0].regionalCorroborations.length, 1);
  assert.equal(result.items[0].regionalCorroborations[0].sourceRecordNumber, '1');
  assert.equal(result.items[1].regionalCorroborations, undefined);
  assert.deepEqual(fingerprintCorroborationItems(result.items, corroborationSource.id), {
    matchedCount: 1,
    matchFingerprint: corroborationSource.expectedMatchFingerprint,
    matchFingerprintAlgorithm: 'sha256-sorted-source-target-tuples-v1',
  });
  const provenanceDrift = structuredClone(result.items);
  provenanceDrift[0].regionalCorroborations[0].recordFingerprint = '0'.repeat(64);
  assert.throws(
    () => fingerprintCorroborationItems(provenanceDrift, corroborationSource.id),
    /저장된 교차검증 레코드 provenance가 본문과 다릅니다/,
  );

  const driftedRows = rows.map(row => ({ ...row }));
  driftedRows[0].소재지도로명주소 = '광주광역시 북구 다른로 1';
  assert.throws(
    () => applyPartialCorroboration(
      targets,
      normalizeCorroborationRows(driftedRows, corroborationSource),
      corroborationSource,
    ),
    /matchedCount .*검토 기준/,
  );
  const driftedTargets = targets.map(item => ({ ...item }));
  driftedTargets[0].latitude = '35.1001';
  assert.throws(
    () => applyPartialCorroboration(driftedTargets, normalized, corroborationSource),
    /기존 지도점 본문 지문 .*검토 기준/,
  );
});
