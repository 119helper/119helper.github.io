import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBusanAddressPointDrift,
  canonicalRoadAddress,
  matchBusanAddressPoints,
  normalizeBusanAddressRows,
} from './restroom-address-points.mjs';

const source = {
  id: 'test-busan-addresses',
  name: '테스트 부산 도로명주소',
  sourceUrl: 'https://example.test/source',
  license: '테스트',
  minimumSourceDate: '2026-01-01',
  minimumRows: 1,
  maximumRows: 10,
  latitudeRange: [34.98, 35.4],
  longitudeRange: [128.79, 129.3],
};

function row(sequence, overrides = {}) {
  return {
    순번: String(sequence),
    시도명: '부산광역시',
    시군구명: '사상구',
    읍면동명: '괘법동',
    도로명: '광장로',
    지하구분: '',
    본번: '1',
    부번: '2',
    건물명: '테스트센터',
    건축물용도: '공공시설',
    관할행정동: '괘법동',
    위도: '35.1600000',
    경도: '128.9900000',
    ...overrides,
  };
}

test('canonicalRoadAddress removes only comma/parenthesis detail and preserves road tokens', () => {
  assert.equal(
    canonicalRoadAddress(' 부산광역시 사상구 광장로 1-2, 테스트센터 (괘법동) '),
    '부산광역시 사상구 광장로 1-2',
  );
});

test('normalizes the official 13-column schema and constructs 읍면/지하 road addresses', () => {
  const dataset = normalizeBusanAddressRows([
    row(1, {
      시군구명: '기장군',
      읍면동명: '정관읍',
      도로명: '정관로',
      지하구분: '지하',
      본번: '10',
      부번: '0',
    }),
  ], { source, sourceDate: '2026-04-21' });

  assert.equal(dataset.items[0].address, '부산광역시 기장군 정관읍 정관로 지하 10');
  assert.equal(dataset.items[0].sourceRowNumber, 2);
});

test('rejects source schema, sequence, jurisdiction, and coordinate drift', () => {
  assert.throws(
    () => normalizeBusanAddressRows([row(2)], { source, sourceDate: '2026-04-21' }),
    /순번/,
  );
  assert.throws(
    () => normalizeBusanAddressRows(
      [row(1, { 시도명: '서울특별시' })],
      { source, sourceDate: '2026-04-21' },
    ),
    /부산광역시 범위 밖/,
  );
  assert.throws(
    () => normalizeBusanAddressRows(
      [row(1, { 위도: '37.5' })],
      { source, sourceDate: '2026-04-21' },
    ),
    /부산 경계 밖/,
  );
});

test('accepts only a unique exact road address with building corroboration', () => {
  const dataset = normalizeBusanAddressRows([
    row(1),
    row(2, { 본번: '20', 부번: '0', 건물명: '다른센터', 위도: '35.1700000' }),
  ], { source, sourceDate: '2026-04-21' });
  const national = [
    {
      MNG_NO: 'new-1',
      RSTRM_NM: '테스트센터 화장실',
      LCTN_ROAD_NM_ADDR: '부산광역시 사상구 광장로 1-2 (괘법동)',
      LCTN_LOTNO_ADDR: '',
    },
    {
      MNG_NO: 'new-2',
      RSTRM_NM: '건물 대조 실패',
      LCTN_ROAD_NM_ADDR: '부산광역시 사상구 광장로 20',
      LCTN_LOTNO_ADDR: '',
    },
  ];

  const result = matchBusanAddressPoints(national, dataset);
  assert.equal(result.total, 1);
  assert.equal(result.coverageGainCount, 1);
  assert.equal(result.items[0].coordinateKind, 'address_point');
  assert.equal(result.items[0].coordinateApproximate, true);
  assert.equal(result.items[0].matchMethod, 'unique-exact-road-address+building-name-corroboration');
});

test('keeps drift gates fail-closed', () => {
  assert.doesNotThrow(() => assertBusanAddressPointDrift({
    total: 1,
    coverageGainCount: 1,
    repairCount: 0,
    uniquePointCount: 1,
    directBuildingMatchCount: 227,
    reviewedNewMatchCount: 5,
    reviewedAliasRepairCount: 3,
  }, {
    total: 1,
    coverageGainCount: 1,
    repairCount: 0,
    uniquePointCount: 1,
  }));
  assert.throws(() => assertBusanAddressPointDrift({
    total: 0,
    coverageGainCount: 0,
    repairCount: 0,
    uniquePointCount: 0,
    directBuildingMatchCount: 227,
    reviewedNewMatchCount: 5,
    reviewedAliasRepairCount: 3,
  }, { total: 1 }), /자동 반영을 중단/);
});
