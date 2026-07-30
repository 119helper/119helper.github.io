import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHostAddressPointDrift,
  downloadStandardHostRows,
  matchHostAddressPoints,
  normalizeHostAddress,
  normalizeHostName,
  normalizeHostRows,
} from './restroom-host-address-points.mjs';

function source(overrides = {}) {
  return {
    id: 'test-host-points',
    downloadKind: 'data-go-standard',
    sourceGroup: 'test-host-group',
    publicDataPk: 'test',
    name: '테스트 호스트 시설',
    sourceUrl: 'https://example.test/standard',
    license: '테스트',
    serviceTableName: 'test_table',
    minimumRows: 1,
    maximumRows: 10,
    minimumSourceDate: '2025-01-01',
    minimumValidScopedRows: 1,
    allowedCityKeys: ['daegu'],
    fieldMap: {
      name: ['NAME'],
      roadAddress: ['ROAD'],
      lotAddress: ['LOT'],
      latitude: ['LAT'],
      longitude: ['LNG'],
      sourceDate: ['DATE'],
      providerCode: ['PROVIDER_CODE'],
      providerName: ['PROVIDER_NAME'],
    },
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    NAME: '테스트공원',
    ROAD: '대구광역시 중구 테스트로 1',
    LOT: '대구광역시 중구 테스트동 1',
    LAT: '35.8701',
    LNG: '128.6011',
    DATE: '2026-06-24',
    PROVIDER_CODE: 'D0001',
    PROVIDER_NAME: '대구광역시',
    ...overrides,
  };
}

test('normalizes host addresses and removes only restroom wording from names', () => {
  assert.equal(
    normalizeHostAddress('대구광역시 중구 테스트로 1 (테스트동)'),
    normalizeHostAddress('대구광역시 중구 테스트로 1'),
  );
  assert.notEqual(
    normalizeHostAddress('대구광역시 중구 테스트로 1-23'),
    normalizeHostAddress('대구광역시 중구 테스트로 12-3'),
  );
  assert.equal(
    normalizeHostAddress('대구광역시 중구 산 12-3'),
    '대구광역시중구산12-3',
  );
  assert.equal(normalizeHostName('테스트공원 공중화장실'), '테스트공원');
});

test('normalizes only recent, in-scope rows with valid coordinates', () => {
  const dataset = normalizeHostRows([
    row(),
    row({ ROAD: '부산광역시 중구 중앙대로 1', LOT: '', LAT: '35.1', LNG: '129.0' }),
    row({ NAME: '오래된공원', ROAD: '대구광역시 중구 오래된로 1', DATE: '2024-12-31' }),
    row({ NAME: '좌표오류공원', ROAD: '대구광역시 중구 오류로 1', LAT: '37.5' }),
  ], source({ minimumRows: 4 }));

  assert.equal(dataset.rawCount, 4);
  assert.equal(dataset.scopedRowCount, 3);
  assert.equal(dataset.validCoordinateCount, 1);
  assert.equal(dataset.staleOrMissingDateCount, 1);
  assert.equal(dataset.invalidCoordinateCount, 1);
  assert.equal(dataset.sourceDate, '2026-06-24');
});

test('requires an affirmative public-toilet flag for traditional-market host rows', () => {
  const marketSource = source({
    eligibilityRules: [{
      field: 'PBLIC_TOILET_YN',
      allowedValues: ['Y'],
      label: '공중화장실 보유 여부',
    }],
    minimumRows: 2,
  });
  const dataset = normalizeHostRows([
    row({ PBLIC_TOILET_YN: 'Y' }),
    row({
      NAME: '화장실없는시장',
      ROAD: '대구광역시 중구 시장로 2',
      LOT: '대구광역시 중구 시장동 2',
      PBLIC_TOILET_YN: 'N',
    }),
  ], marketSource);

  assert.equal(dataset.validCoordinateCount, 1);
  assert.equal(dataset.ineligibleHostCount, 1);
  assert.equal(dataset.items[0].eligibilityEvidence.PBLIC_TOILET_YN, 'Y');
});

test('matches one missing central ID by unique exact address and contained host name', () => {
  const dataset = normalizeHostRows([row()], source());
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '테스트공원 공중화장실',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 테스트로 1 (테스트동)',
    LCTN_LOTNO_ADDR: '',
  }, {
    MNG_NO: 'N-2',
    RSTRM_NM: '기존 시설',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 기존로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchHostAddressPoints(national, [dataset], new Set(['N-2']));

  assert.equal(result.total, 1);
  assert.equal(result.cities.daegu, 1);
  assert.equal(result.items[0].coordinateKind, 'address_point');
  assert.equal(result.items[0].coordinateApproximate, true);
  assert.equal(result.items[0].precision, 'host-facility-representative-point');
  assert.equal(
    result.items[0].matchMethod,
    'unique-exact-road-or-lot-address+host-name-containment+coordinate-consistent-proposals',
  );
});

test('does not cross-match road-address keys with lot-address keys', () => {
  const dataset = normalizeHostRows([row()], source());
  const result = matchHostAddressPoints([{
    MNG_NO: 'N-1',
    RSTRM_NM: '테스트공원 공중화장실',
    LCTN_ROAD_NM_ADDR: '',
    LCTN_LOTNO_ADDR: '대구광역시 중구 테스트로 1',
  }], [dataset]);

  assert.equal(result.total, 0);
});

test('allows only an explicitly reviewed road-versus-lot field variant', () => {
  const reviewedSource = source({
    id: 'national-museum-art-gallery-host-points',
  });
  const dataset = normalizeHostRows([row({
    NAME: '대구약령시한의약박물관',
    ROAD: '대구광역시 중구 남성로 51-1',
    LOT: '대구광역시 중구 동성로3가 44-2',
    LAT: '35.86828731',
    LNG: '128.5899134',
  })], reviewedSource);
  const result = matchHostAddressPoints([{
    MNG_NO: '202534100000100145',
    RSTRM_NM: '약령시한의약박물관',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 달구벌대로415길 49',
    LCTN_LOTNO_ADDR: '대구광역시 중구 남성로 51-1',
  }], [dataset]);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].addressMatchMode, 'reviewed-address-field-variant');
  assert.equal(result.items[0].matchMode, 'reviewed-host-name-alias');
});

test('rejects ambiguous central addresses, short names, and conflicting source coordinates', () => {
  const first = normalizeHostRows([row()], source());
  const second = normalizeHostRows([row({
    LAT: '35.8710',
    DATE: '2026-07-01',
  })], source({ id: 'second-host-source', name: '두 번째 원천' }));
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '테스트공원 화장실',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 테스트로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const conflict = matchHostAddressPoints(national, [first, second]);
  assert.equal(conflict.total, 0);
  assert.equal(conflict.coordinateConflictCount, 1);

  const ambiguous = matchHostAddressPoints([
    ...national,
    { ...national[0], MNG_NO: 'N-2' },
  ], [first]);
  assert.equal(ambiguous.total, 0);
  assert.equal(ambiguous.sources[0].ambiguousAddressCount, 1);

  const shortName = matchHostAddressPoints([{
    ...national[0],
    RSTRM_NM: '공원 화장실',
  }], [first]);
  assert.equal(shortName.total, 0);
  assert.equal(shortName.sources[0].nameMismatchCount, 1);
});

test('accepts coordinate-consistent corroborating sources without letting a newer source outrank configured quality', () => {
  const first = normalizeHostRows([row()], source());
  const second = normalizeHostRows([row({
    LAT: '35.8702',
    LNG: '128.6012',
    DATE: '2026-07-01',
  })], source({ id: 'second-host-source', name: '두 번째 원천' }));
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '테스트공원 화장실',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 테스트로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchHostAddressPoints(national, [first, second]);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].sourceId, 'test-host-points');
  assert.equal(result.items[0].corroboratingSources.length, 2);
  assert.equal(result.sources[0].corroboratingAcceptedTargetCount, 1);
  assert.equal(result.sources[0].acceptedTargetCount, 1);
  assert.equal(result.sources[1].acceptedTargetCount, 0);
});

test('downloads every standard-data page with repeated colNmList parameters', async () => {
  const calls = [];
  const metadata = {
    totalCount: 3,
    tableVO: {
      svcTableNm: 'test_table',
      colNmList: ['NAME', 'ROAD', 'LOT', 'LAT', 'LNG', 'DATE'],
    },
    columList: [
      'NAME',
      'ROAD',
      'LOT',
      'LAT',
      'LNG',
      'DATE',
      'PROVIDER_CODE',
      'PROVIDER_NAME',
    ].map(columCode => ({ columCode })),
  };
  const fetchImpl = async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith('/columList.json')) {
      return new Response(JSON.stringify(metadata), { status: 200 });
    }
    assert.deepEqual(url.searchParams.getAll('colNmList'), metadata.tableVO.colNmList);
    return new Response(JSON.stringify([row(), row(), row()]), { status: 200 });
  };

  const result = await downloadStandardHostRows(source({
    minimumRows: 3,
    maximumRows: 3,
  }), { fetchImpl });

  assert.equal(result.rows.length, 3);
  assert.equal(calls.length, 2);
});

test('reviewed host-point IDs and city totals remain fail-closed', () => {
  const result = {
    coordinateConflictCount: 0,
    cities: { daegu: 1 },
    items: [{ id: 'N-1' }],
  };
  assert.doesNotThrow(() => assertHostAddressPointDrift(result, {
    expectedIds: new Set(['N-1']),
    expectedCities: { daegu: 1 },
  }));
  assert.throws(() => assertHostAddressPointDrift(result, {
    expectedIds: new Set(['N-2']),
    expectedCities: { daegu: 1 },
  }), /검토 ID가 달라졌습니다/);
});
