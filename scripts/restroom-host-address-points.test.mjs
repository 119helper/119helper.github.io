import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertHostAddressPointDrift,
  downloadStandardHostRows,
  HOST_ADDRESS_SOURCES,
  hostAddressPointReviewFingerprint,
  hostRecordFingerprint,
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

test('requires a source-specific latest date while allowing older valid rows', () => {
  const freshnessSource = source({
    minimumLatestSourceDate: '2026-06-01',
    minimumRows: 2,
  });
  assert.throws(
    () => normalizeHostRows([
      row({ DATE: '2025-12-31' }),
      row({
        NAME: '두번째공원',
        ROAD: '대구광역시 중구 테스트로 2',
        LOT: '대구광역시 중구 테스트동 2',
        DATE: '2025-11-30',
      }),
    ], freshnessSource),
    /최신 기준일이 2026-06-01보다 오래됐습니다/,
  );

  const dataset = normalizeHostRows([
    row({ DATE: '2025-12-31' }),
    row({
      NAME: '두번째공원',
      ROAD: '대구광역시 중구 테스트로 2',
      LOT: '대구광역시 중구 테스트동 2',
      DATE: '2026-06-01',
    }),
  ], freshnessSource);
  assert.equal(dataset.validCoordinateCount, 2);
  assert.equal(dataset.sourceDate, '2026-06-01');
});

test('official host sources keep their reviewed latest-date gates', () => {
  const latestDates = Object.fromEntries(
    HOST_ADDRESS_SOURCES.map(item => [item.id, item.minimumLatestSourceDate]),
  );
  assert.deepEqual(latestDates, {
    'national-city-park-host-points': '2026-06-01',
    'national-parking-lot-host-points': '2026-05-01',
    'national-traditional-market-host-points': '2025-11-01',
    'national-library-host-points': '2026-06-01',
    'national-museum-art-gallery-host-points': '2026-06-01',
    'national-public-facility-opening-host-points': '2026-06-01',
    'yongsan-community-center-host-points': '2025-08-01',
  });
  const cityMinimums = Object.fromEntries(
    HOST_ADDRESS_SOURCES.map(item => [item.id, item.minimumValidScopedRowsByCity]),
  );
  assert.deepEqual(cityMinimums, {
    'national-city-park-host-points': { daegu: 591, sejong: 179, ulsan: 445 },
    'national-parking-lot-host-points': { daegu: 977, sejong: 91, ulsan: 344 },
    'national-traditional-market-host-points': { daegu: 89, sejong: 3, ulsan: 37 },
    'national-library-host-points': { daegu: 216, sejong: 21, ulsan: 114 },
    'national-museum-art-gallery-host-points': { daegu: 34, sejong: 1, ulsan: 3 },
    'national-public-facility-opening-host-points': { daegu: 231, sejong: 52, ulsan: 48 },
    'yongsan-community-center-host-points': { seoul: 16 },
  });
});

test('requires every reviewed city to retain enough unique valid rows', () => {
  assert.throws(
    () => normalizeHostRows([row()], source({
      allowedCityKeys: ['daegu', 'ulsan'],
      minimumValidScopedRowsByCity: { daegu: 1, ulsan: 1 },
    })),
    /ulsan 관할 유효 고유행 0건/,
  );
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

test('pins every corroborating record while allowing a source-date-only refresh', () => {
  const first = normalizeHostRows([row()], source());
  const second = normalizeHostRows([row({
    LAT: '35.8702',
    LNG: '128.6012',
    DATE: '2026-07-01',
  })], source({ id: 'second-host-source', name: '두 번째 원천' }));
  const result = matchHostAddressPoints([{
    MNG_NO: 'N-1',
    RSTRM_NM: '테스트공원 화장실',
    LCTN_ROAD_NM_ADDR: '대구광역시 중구 테스트로 1',
    LCTN_LOTNO_ADDR: '',
  }], [first, second]);
  const reviewOptions = {
    expectedIds: new Set(['N-1']),
    expectedCities: { daegu: 1 },
    expectedFingerprint: hostAddressPointReviewFingerprint(result.items),
    validateProvenance: true,
  };
  assert.doesNotThrow(() => assertHostAddressPointDrift(result, reviewOptions));

  const coordinateDrift = structuredClone(result);
  const driftRecord = coordinateDrift.items[0].corroboratingRecords
    .find(record => record.sourceId === 'second-host-source');
  driftRecord.lat += 0.0001;
  driftRecord.recordFingerprint = hostRecordFingerprint(driftRecord);
  assert.throws(
    () => assertHostAddressPointDrift(coordinateDrift, reviewOptions),
    /검토 지문/,
  );

  const distanceDrift = structuredClone(result);
  distanceDrift.items[0].corroboratingRecords[0].distanceFromPrimaryMeters = 5;
  assert.throws(
    () => assertHostAddressPointDrift(distanceDrift, {
      ...reviewOptions,
      expectedFingerprint: null,
    }),
    /원천 레코드 근거가 불완전합니다/,
  );

  const partialDateRefresh = structuredClone(result);
  const partialRecord = partialDateRefresh.items[0].corroboratingRecords
    .find(record => record.sourceId === 'second-host-source');
  const partialSource = partialDateRefresh.items[0].corroboratingSources
    .find(record => record.sourceId === 'second-host-source');
  partialRecord.sourceDate = '2099-01-01';
  partialRecord.recordFingerprint = hostRecordFingerprint(partialRecord);
  partialSource.recordFingerprint = partialRecord.recordFingerprint;
  assert.throws(
    () => assertHostAddressPointDrift(partialDateRefresh, reviewOptions),
    /원천 레코드 근거가 불완전합니다/,
  );

  const dateRefresh = structuredClone(result);
  const refreshedRecord = dateRefresh.items[0].corroboratingRecords
    .find(record => record.sourceId === 'second-host-source');
  const refreshedSource = dateRefresh.items[0].corroboratingSources
    .find(record => record.sourceId === 'second-host-source');
  refreshedRecord.sourceDate = '2026-07-02';
  refreshedRecord.recordFingerprint = hostRecordFingerprint(refreshedRecord);
  refreshedSource.sourceDate = refreshedRecord.sourceDate;
  refreshedSource.recordFingerprint = refreshedRecord.recordFingerprint;
  dateRefresh.sources
    .find(sourceItem => sourceItem.id === 'second-host-source')
    .sourceDate = refreshedRecord.sourceDate;
  assert.equal(
    hostAddressPointReviewFingerprint(dateRefresh.items),
    reviewOptions.expectedFingerprint,
  );
  assert.doesNotThrow(() => assertHostAddressPointDrift(dateRefresh, reviewOptions));
});

test('checked-in source completeness gates cannot be removed or weakened', () => {
  const ledger = JSON.parse(readFileSync(
    new URL('../public/data/restroom-official-host-address-points.json', import.meta.url),
    'utf8',
  ));
  assert.doesNotThrow(() => assertHostAddressPointDrift(ledger));

  const missingGate = structuredClone(ledger);
  delete missingGate.sources[0].minimumValidScopedRowsByCity;
  assert.throws(
    () => assertHostAddressPointDrift(missingGate),
    /저장 완전성 게이트가 코드 검토 기준과 다릅니다/,
  );

  const weakenedGate = structuredClone(ledger);
  weakenedGate.sources[0].minimumLatestSourceDate = '1900-01-01';
  assert.throws(
    () => assertHostAddressPointDrift(weakenedGate),
    /저장 완전성 게이트가 코드 검토 기준과 다릅니다/,
  );

  const tooOldRecord = structuredClone(ledger);
  const tooOldItem = tooOldRecord.items
    .find(item => item.corroboratingRecords.length > 1);
  const oldRecord = tooOldItem.corroboratingRecords
    .find(record => record.sourceId !== tooOldItem.sourceId);
  const oldEvidence = tooOldItem.corroboratingSources
    .find(evidence => evidence.sourceId === oldRecord.sourceId);
  oldRecord.sourceDate = '1900-01-01';
  oldRecord.recordFingerprint = hostRecordFingerprint(oldRecord);
  oldEvidence.sourceDate = oldRecord.sourceDate;
  oldEvidence.recordFingerprint = oldRecord.recordFingerprint;
  assert.throws(
    () => assertHostAddressPointDrift(tooOldRecord),
    /원천 레코드 근거가 불완전합니다/,
  );

  const futureRecord = structuredClone(ledger);
  const futureItem = futureRecord.items
    .find(item => item.corroboratingRecords.length > 1);
  const futureEvidenceRecord = futureItem.corroboratingRecords
    .find(record => record.sourceId !== futureItem.sourceId);
  const futureSourceEvidence = futureItem.corroboratingSources
    .find(evidence => evidence.sourceId === futureEvidenceRecord.sourceId);
  futureEvidenceRecord.sourceDate = '2099-12-31';
  futureEvidenceRecord.recordFingerprint = hostRecordFingerprint(futureEvidenceRecord);
  futureSourceEvidence.sourceDate = futureEvidenceRecord.sourceDate;
  futureSourceEvidence.recordFingerprint = futureEvidenceRecord.recordFingerprint;
  assert.throws(
    () => assertHostAddressPointDrift(futureRecord),
    /원천 레코드 근거가 불완전합니다/,
  );

  assert.throws(
    () => hostRecordFingerprint({
      sourceRecordKey: 'invalid-date',
      lat: 35.1,
      lng: 128.1,
      sourceDate: '2026-99-99',
    }),
    /지문 필드가 불완전합니다/,
  );
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
    const page = Number(url.searchParams.get('page'));
    return new Response(JSON.stringify(page === 1
      ? [row(), row({ ROAD: '대구광역시 중구 테스트로 2' })]
      : [row({ ROAD: '대구광역시 중구 테스트로 3' })]), { status: 200 });
  };

  const result = await downloadStandardHostRows(source({
    minimumRows: 3,
    maximumRows: 3,
  }), { fetchImpl, pageSize: 2 });

  assert.equal(result.rows.length, 3);
  assert.equal(calls.length, 3);
});

test('rejects standard-data schema, short-page, and repeated-page drift', async () => {
  const columns = [
    'NAME',
    'ROAD',
    'LOT',
    'LAT',
    'LNG',
    'DATE',
    'PROVIDER_CODE',
    'PROVIDER_NAME',
  ];
  const metadata = (overrides = {}) => ({
    totalCount: 3,
    tableVO: {
      svcTableNm: 'test_table',
      colNmList: ['NAME', 'ROAD', 'LOT', 'LAT', 'LNG', 'DATE'],
    },
    columList: columns.map(columCode => ({ columCode })),
    ...overrides,
  });
  const responseFor = value => new Response(JSON.stringify(value), { status: 200 });

  await assert.rejects(
    downloadStandardHostRows(source({
      minimumRows: 3,
      maximumRows: 3,
    }), {
      pageSize: 2,
      fetchImpl: async input => {
        const url = new URL(input);
        if (url.pathname.endsWith('/columList.json')) return responseFor(metadata());
        return responseFor([row()]);
      },
    }),
    /페이지 1행이 예상 2행과 다릅니다/,
  );

  await assert.rejects(
    downloadStandardHostRows(source({
      minimumRows: 3,
      maximumRows: 3,
    }), {
      fetchImpl: async () => responseFor(metadata({
        tableVO: {
          svcTableNm: 'changed_table',
          colNmList: ['NAME'],
        },
      })),
    }),
    /서비스 테이블이 변경됐습니다/,
  );

  await assert.rejects(
    downloadStandardHostRows(source({
      minimumRows: 3,
      maximumRows: 3,
    }), {
      fetchImpl: async () => responseFor(metadata({
        columList: columns
          .filter(column => column !== 'LAT')
          .map(columCode => ({ columCode })),
      })),
    }),
    /필수 컬럼 LAT이 없습니다/,
  );

  const repeatedRows = [row(), row({ ROAD: '대구광역시 중구 테스트로 2' })];
  await assert.rejects(
    downloadStandardHostRows(source({
      minimumRows: 4,
      maximumRows: 4,
    }), {
      pageSize: 2,
      fetchImpl: async input => {
        const url = new URL(input);
        if (url.pathname.endsWith('/columList.json')) {
          return responseFor(metadata({ totalCount: 4 }));
        }
        return responseFor(repeatedRows);
      },
    }),
    /서로 다른 페이지가 동일한 원본 행 묶음을 반환했습니다/,
  );
});

test('reviewed host-point IDs and city totals remain fail-closed', () => {
  const items = [{ id: 'N-1', coverageGain: true, lat: 35.1, lng: 128.1 }];
  const result = {
    total: 1,
    coverageGainCount: 1,
    uniquePointCount: 1,
    coordinateConflictCount: 0,
    cities: { daegu: 1 },
    items,
    reviewFingerprint: hostAddressPointReviewFingerprint(items),
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
