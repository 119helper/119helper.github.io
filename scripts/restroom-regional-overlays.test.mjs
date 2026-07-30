import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeCsv,
  downloadSourceCsv,
  downloadSourceRows,
  loadRestroomRegionalSourceRegistry,
  matchOfficialRegionalCoordinates,
  normalizeAddress,
  normalizeRegionalRows,
  parseCsv,
  rowsFromShapefileGeoJson,
} from './restroom-regional-overlays.mjs';

function testSource(overrides = {}) {
  return {
    id: 'test-restrooms',
    label: '테스트 공중화장실',
    cityKey: 'seoul',
    city: '서울특별시',
    district: '',
    sourceUrl: 'https://example.test/restrooms',
    license: '공공누리 제1유형',
    minimumSourceDate: '2025-01-01',
    minimumRows: 1,
    maximumRows: 20,
    latitudeRange: [37.4, 37.75],
    longitudeRange: [126.7, 127.25],
    fieldMap: {
      name: ['name'],
      roadAddress: ['road'],
      lotAddress: ['lot'],
      latitude: ['lat'],
      longitude: ['lng'],
      sourceDate: ['date'],
    },
    ...overrides,
  };
}

function normalizedDataset(rows, source = testSource(), options = {}) {
  return normalizeRegionalRows(rows, source, options);
}

test('CP949 bytes and quoted CSV fields are decoded and parsed', () => {
  assert.equal(decodeCsv(Uint8Array.from([0xb0, 0xa1]), 'euc-kr'), '가');
  assert.deepEqual(
    parseCsv('\uFEFF"name","note"\r\n"시설, 1","첫 줄\n둘째 줄"\r\n'),
    [{ name: '시설, 1', note: '첫 줄\n둘째 줄' }],
  );
  assert.equal(
    normalizeAddress('서울 영등포구 도림로 264'),
    normalizeAddress('서울특별시 영등포구 도림로 264'),
  );
});

test('the registered official source field maps normalize names, addresses, dates, and coordinates', () => {
  const registry = loadRestroomRegionalSourceRegistry();
  const byId = new Map(registry.sources.map(source => [source.id, {
    ...source,
    minimumRows: 1,
    maximumRows: 10,
  }]));

  const seoul = normalizeRegionalRows([{
    건물명: '서울 시설',
    도로명주소: '서울특별시 종로구 세종대로 1',
    지번주소: '서울특별시 종로구 세종로 1',
    'x 좌표': '126.978',
    'y 좌표': '37.566',
  }], byId.get('seoul-oa-22586-restrooms'), { sourceDate: '2026-07-29' });
  assert.equal(seoul.items[0].name, '서울 시설');
  assert.equal(seoul.items[0].longitude, 126.978);
  assert.equal(seoul.sourceDate, '2026-07-29');

  const metro = normalizeRegionalRows([{
    역명: '시청',
    소재지도로명주소: '서울특별시 중구 세종대로 지하101(정동)',
    소재지지번주소: '서울특별시 중구 정동 5-5 시청역(1호선)',
    위도: '37.565682',
    경도: '126.976849',
    데이터기준일자: '2026-02-12',
  }, {
    역명: '종각역',
    소재지도로명주소: '서울특별시 종로구 종로 지하55(종로1가)',
    소재지지번주소: '서울특별시 종로구 종로1가 54 종각역(1호선)',
    위도: '37.570161',
    경도: '126.982923',
    데이터기준일자: '2026-02-12',
  }], byId.get('seoul-metro-station-restrooms'));
  assert.deepEqual(metro.items.map(item => item.name), ['시청역', '종각역']);
  assert.equal(metro.sourceDate, '2026-02-12');

  const daejeon = normalizeRegionalRows([{
    buld_nm: '대전 시설',
    rn_adrs: '대전광역시 서구 둔산로 1',
    lnm_adrs: '대전광역시 서구 둔산동 1',
    la: '36.35',
    lo: '127.38',
    data_stdr_de: '2026-05-18',
  }], byId.get('daejeon-seogu-open-restrooms'));
  assert.equal(daejeon.items[0].name, '대전 시설');
  assert.equal(daejeon.items[0].longitude, 127.38);
  assert.equal(daejeon.sourceDate, '2026-05-18');

  const jeju = normalizeRegionalRows([{
    '화장실 명': '제주 시설',
    '도로명 주소': '제주특별자치도 제주시 선덕로 1',
    '지번 주소': '제주특별자치도 제주시 연동 1',
    '위도 좌표': '33.48',
    '경도 좌표': '126.50',
    '데이터 기준일': '2025-12-31',
  }], byId.get('jeju-city-public-restrooms'));
  assert.equal(jeju.items[0].name, '제주 시설');
  assert.equal(jeju.sourceDate, '2025-12-31');

  const busan = normalizeRegionalRows([{
    화장실명: '동래 시설',
    도로명주소: '동래구 우장춘로 117',
    '도로명 상세주소': '',
    지번주소: '부산광역시 동래구 온천동 330',
    '지번 상세주소': '',
    위도: '35.217962',
    경도: '129.073619',
    데이터기준일자: '2026-06-01',
  }], byId.get('busan-dongnae-open-restrooms'));
  assert.equal(busan.items[0].roadAddresses[0], '부산광역시 동래구 우장춘로 117');
  assert.equal(busan.sourceDate, '2026-06-01');

  const galmaetgilSource = byId.get('busan-galmaetgil-restrooms');
  const galmaetgilRows = rowsFromShapefileGeoJson({
    type: 'FeatureCollection',
    fileName: 'gmgRestroomInfo',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [129.118533, 35.15377436] },
      properties: {
        이름: '광안리해수욕장 생활문화센터(지하) 공중화장실',
        도로명주소: '부산광역시 수영구 광안해변로 219(광안동)',
        구분: '공중화장실',
        지번주소: '부산광역시 수영구 광안동 192-20',
        남녀공용: 'N',
        관리기관: '부산광역시 수영구청 자원순환과',
        전화번호: '051-610-4445',
        이용가능시간: '24시',
        설치일: '2000-01-01',
        비상벨: '여자',
        코스: 2,
        구분_1: 2,
        위도: 35.15377436,
        lon: 129.118533,
      },
    }],
  }, galmaetgilSource);
  const galmaetgil = normalizeRegionalRows(
    galmaetgilRows,
    galmaetgilSource,
    { sourceDate: '2025-10-30' },
  );
  assert.equal(galmaetgil.items[0].name, '광안리해수욕장 생활문화센터(지하) 공중화장실');
  assert.equal(galmaetgil.items[0].latitude, 35.15377436);
  assert.equal(galmaetgil.sourceDate, '2025-10-30');
});

test('row-level source dates reject a mostly stale dataset with one recent row', () => {
  const source = testSource({
    minimumRows: 2,
    minimumRowSourceDate: '2026-01-01',
    requireSourceDateForEveryRow: true,
  });
  const row = {
    name: '시설',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: '37.566',
    lng: '126.978',
    date: '2026-07-29',
  };

  assert.throws(
    () => normalizedDataset([row, { ...row, date: '2025-12-31' }], source),
    /가장 오래된 행 기준일 2025-12-31이 최소 2026-01-01보다 오래됐습니다/,
  );
});

test('valid-row source date checks ignore rejected artifacts but reject usable undated rows', () => {
  const source = testSource({
    minimumRows: 2,
    requireSourceDateForEveryValidRow: true,
  });
  const dated = {
    name: '시설',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: '37.566',
    lng: '126.978',
    date: '2026-07-29',
  };
  const emptyArtifact = {
    name: '',
    road: '',
    lot: '',
    lat: '',
    lng: '',
    date: '',
  };

  assert.doesNotThrow(() => normalizedDataset([dated, emptyArtifact], source));
  assert.throws(
    () => normalizedDataset([dated, { ...dated, name: '다른 시설', date: '' }], source),
    /유효한 원본 행 중 기준일을 확인할 수 없는 행이 있습니다/,
  );
});

test('SHP field order drift is rejected when property and geometry coordinates disagree', () => {
  const source = {
    ...testSource(),
    shapefileName: 'restrooms',
    shapefileFieldIndexes: {
      name: 0,
      roadAddress: 1,
      lotAddress: 2,
      latitude: 3,
      longitude: 4,
    },
  };
  assert.throws(
    () => rowsFromShapefileGeoJson({
      type: 'FeatureCollection',
      fileName: 'restrooms',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [126.98, 37.56] },
        properties: {
          name: '시설',
          road: '서울특별시 종로구 세종대로 1',
          lot: '',
          lat: 37.56,
          lng: 129.12,
        },
      }],
    }, source),
    /경도 필드와 지오메트리가 다릅니다/,
  );
});

test('strict name plus exact road-or-lot matching returns only central IDs without coordinates', () => {
  const source = testSource();
  const dataset = normalizedDataset([
    {
      name: '광화문 공중화장실',
      road: '서울특별시 종로구 세종대로 1',
      lot: '',
      lat: '37.566',
      lng: '126.978',
      date: '2026-07-29',
    },
    {
      name: '을지로 공중화장실',
      road: '',
      lot: '서울특별시 중구 을지로동 10',
      lat: '37.565',
      lng: '126.991',
      date: '2026-07-29',
    },
  ], source);
  const national = [
    {
      MNG_NO: 'N-1',
      RSTRM_NM: '광화문 공중화장실',
      LCTN_ROAD_NM_ADDR: '서울특별시 종로구 세종대로 1',
      LCTN_LOTNO_ADDR: '서울특별시 종로구 세종로 1',
    },
    {
      MNG_NO: 'N-2',
      RSTRM_NM: '을지로 공중화장실',
      LCTN_ROAD_NM_ADDR: '서울특별시 중구 을지로 10',
      LCTN_LOTNO_ADDR: '서울특별시 중구 을지로동 10',
    },
  ];
  const existing = new Map([['N-2', { lat: 37.5651, lng: 126.9911 }]]);

  const result = matchOfficialRegionalCoordinates(national, [dataset], existing);

  assert.equal(result.total, 1);
  assert.equal(result.gainCount, 1);
  assert.deepEqual(result.items.map(item => item.id), ['N-1']);
  assert.equal(result.items[0].matchMethod, 'normalized-name+exact-road-or-lot-address');
  assert.equal(result.sources[0].exactMatchedCount, 2);
  assert.equal(result.sources[0].existingCoordinateCount, 1);
  assert.equal(result.sources[0].gainCount, 1);
});

test('upgrades a strict official match from an address point without counting a coverage gain', () => {
  const dataset = normalizedDataset([{
    name: '광화문 공중화장실',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: '37.566',
    lng: '126.978',
    date: '2026-07-29',
  }]);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '광화문 공중화장실',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 세종대로 1',
    LCTN_LOTNO_ADDR: '',
  }];
  const existing = new Map([[
    'N-1',
    { lat: 37.56, lng: 126.97, coordinateKind: 'address_point' },
  ]]);

  const result = matchOfficialRegionalCoordinates(national, [dataset], existing);

  assert.equal(result.total, 1);
  assert.equal(result.gainCount, 0);
  assert.equal(result.precisionUpgradeCount, 1);
  assert.equal(result.items[0].coverageGain, false);
  assert.equal(result.items[0].precisionUpgrade, true);
  assert.equal(result.sources[0].precisionUpgradeCount, 1);
});

test('name-only and address-only similarities are rejected', () => {
  const dataset = normalizedDataset([
    {
      name: '같은 이름',
      road: '서울특별시 종로구 다른로 99',
      lot: '',
      lat: '37.56',
      lng: '126.98',
      date: '2026-07-29',
    },
    {
      name: '다른 이름',
      road: '서울특별시 종로구 정확로 1',
      lot: '',
      lat: '37.56',
      lng: '126.98',
      date: '2026-07-29',
    },
  ]);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '같은 이름',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 정확로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(result.total, 0);
  assert.equal(result.sources[0].unmatchedCount, 2);
});

test('many central IDs for one exact key are rejected as ambiguous', () => {
  const dataset = normalizedDataset([{
    name: '중복 시설',
    road: '서울특별시 종로구 같은로 1',
    lot: '',
    lat: '37.56',
    lng: '126.98',
    date: '2026-07-29',
  }]);
  const national = ['N-1', 'N-2'].map(id => ({
    MNG_NO: id,
    RSTRM_NM: '중복 시설',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 같은로 1',
    LCTN_LOTNO_ADDR: '',
  }));

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(result.total, 0);
  assert.equal(result.sources[0].ambiguousNationalMatchCount, 1);
});

test('many regional rows for one central ID are all rejected', () => {
  const row = {
    name: '지역 중복 시설',
    road: '서울특별시 종로구 같은로 2',
    lot: '',
    lat: '37.56',
    lng: '126.98',
    date: '2026-07-29',
  };
  const dataset = normalizedDataset([row, { ...row }]);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '지역 중복 시설',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 같은로 2',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(result.total, 0);
  assert.equal(result.sources[0].duplicateRegionalMatchCount, 2);
  assert.equal(result.sources[0].duplicateRegionalTargetCount, 1);
});

test('reviewed source summary gates reject silent matching regressions', () => {
  const source = testSource({
    summaryGates: {
      minimum: { exactMatchedCount: 2 },
    },
  });
  const dataset = normalizedDataset([{
    name: '검증 시설',
    road: '서울특별시 종로구 검증로 1',
    lot: '',
    lat: '37.56',
    lng: '126.98',
    date: '2026-07-29',
  }], source);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '검증 시설',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 검증로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  assert.throws(
    () => matchOfficialRegionalCoordinates(national, [dataset]),
    /exactMatchedCount 1건이 검토 기준 최소 2건보다 적습니다/,
  );
});

test('unique exact address plus contained names is opt-in and accepts coordinate-consistent duplicates', () => {
  const source = testSource({
    allowUniqueAddressNameContainment: true,
    uniqueAddressNameMinimumLength: 4,
  });
  const row = {
    name: '광화문 공중화장실 화장실',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: '37.566',
    lng: '126.978',
    date: '2026-07-29',
  };
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '광화문 공중화장실',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 세종대로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const disabled = matchOfficialRegionalCoordinates(
    national,
    [normalizedDataset([row])],
  );
  assert.equal(disabled.total, 0);
  assert.equal(disabled.sources[0].unmatchedCount, 1);

  const enabled = matchOfficialRegionalCoordinates(
    national,
    [normalizedDataset([row, { ...row }], source)],
  );
  assert.equal(enabled.total, 1);
  assert.equal(enabled.items[0].matchMethod, 'unique-exact-address+normalized-name-containment');
  assert.equal(enabled.sources[0].addressNameContainedMatchedCount, 1);
  assert.equal(enabled.sources[0].consistentDuplicateRegionalRowCount, 1);
  assert.equal(enabled.sources[0].consistentDuplicateRegionalTargetCount, 1);
});

test('source name suffix enables short station names without lowering the containment gate', () => {
  const source = testSource({
    nameSuffix: '역',
    allowUniqueAddressNameContainment: true,
    uniqueAddressNameMinimumLength: 3,
  });
  const dataset = normalizedDataset([{
    name: '시청',
    road: '서울특별시 중구 세종대로 지하101(정동)',
    lot: '',
    lat: '37.565682',
    lng: '126.976849',
    date: '2026-02-12',
  }], source);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '시청역(1)',
    LCTN_ROAD_NM_ADDR: '서울특별시 중구 세종대로 지하101(정동)',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(dataset.items[0].name, '시청역');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].sourceName, '시청역');
  assert.equal(result.items[0].matchMethod, 'unique-exact-address+normalized-name-containment');
});

test('unique-address fallback rejects name mismatches and addresses spanning central IDs', () => {
  const source = testSource({ allowUniqueAddressNameContainment: true });
  const national = [
    {
      MNG_NO: 'N-1',
      RSTRM_NM: '광화문 공중화장실',
      LCTN_ROAD_NM_ADDR: '서울특별시 종로구 세종대로 1',
      LCTN_LOTNO_ADDR: '',
    },
    {
      MNG_NO: 'N-2',
      RSTRM_NM: '을지로 공중화장실',
      LCTN_ROAD_NM_ADDR: '',
      LCTN_LOTNO_ADDR: '서울특별시 중구 을지로동 10',
    },
  ];
  const dataset = normalizedDataset([
    {
      name: '전혀 다른 시설',
      road: '서울특별시 종로구 세종대로 1',
      lot: '',
      lat: '37.566',
      lng: '126.978',
      date: '2026-07-29',
    },
    {
      name: '공중화장실 안내시설',
      road: '서울특별시 종로구 세종대로 1',
      lot: '서울특별시 중구 을지로동 10',
      lat: '37.566',
      lng: '126.978',
      date: '2026-07-29',
    },
    {
      name: '광장 화장실',
      road: '서울특별시 종로구 광장로 1',
      lot: '',
      lat: '37.566',
      lng: '126.978',
      date: '2026-07-29',
    },
  ], source);
  national.push({
    MNG_NO: 'N-3',
    RSTRM_NM: '광장',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 광장로 1',
    LCTN_LOTNO_ADDR: '',
  });

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(result.total, 0);
  assert.equal(result.sources[0].addressNameMismatchCount, 2);
  assert.equal(result.sources[0].ambiguousAddressMatchCount, 1);
});

test('unique-address fallback rejects duplicate regional coordinates that disagree', () => {
  const source = testSource({ allowUniqueAddressNameContainment: true });
  const row = {
    name: '광화문 공중화장실 화장실',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: '37.566',
    lng: '126.978',
    date: '2026-07-29',
  };
  const dataset = normalizedDataset([
    row,
    { ...row, lat: '37.5662' },
  ], source);
  const national = [{
    MNG_NO: 'N-1',
    RSTRM_NM: '광화문 공중화장실',
    LCTN_ROAD_NM_ADDR: '서울특별시 종로구 세종대로 1',
    LCTN_LOTNO_ADDR: '',
  }];

  const result = matchOfficialRegionalCoordinates(national, [dataset]);

  assert.equal(result.total, 0);
  assert.equal(result.sources[0].duplicateRegionalMatchCount, 2);
  assert.equal(result.sources[0].duplicateRegionalTargetCount, 1);
});

test('coordinates outside the declared jurisdiction and addresses outside scope are rejected', () => {
  const source = testSource({
    cityKey: 'busan',
    city: '부산광역시',
    district: '동래구',
    latitudeRange: [35.15, 35.3],
    longitudeRange: [129.0, 129.16],
  });
  const dataset = normalizedDataset([
    {
      name: '좌표 오류',
      road: '부산광역시 동래구 우장춘로 1',
      lot: '',
      lat: '35.362703',
      lng: '128.920499',
      date: '2026-06-01',
    },
    {
      name: '관할 오류',
      road: '부산광역시 해운대구 해운대로 1',
      lot: '',
      lat: '35.20',
      lng: '129.10',
      date: '2026-06-01',
    },
  ], source);

  assert.equal(dataset.items.length, 0);
  assert.deepEqual(
    dataset.rejected.map(item => item.reason).sort(),
    ['invalid-coordinate', 'out-of-scope'],
  );
});

test('Seoul CSV uses the official POST form and data.go follows the current contentUrl', async () => {
  const seoulCalls = [];
  const seoulSource = {
    id: 'seoul-download',
    downloadKind: 'seoul-sheet-csv',
    datasetId: 'OA-22586',
    sourceUrl: 'https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do',
    downloadUrl: 'https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do',
    encoding: 'euc-kr',
  };
  const seoulFetch = async (url, init = {}) => {
    seoulCalls.push({ url: String(url), init });
    if (String(url) === seoulSource.sourceUrl) {
      return new Response('<td>데이터 갱신일</td><td>2026.07.29.</td>', {
        headers: { 'set-cookie': 'SESSION=test; Path=/' },
      });
    }
    return new Response('name,road\nfacility,address\n');
  };

  const seoul = await downloadSourceCsv(seoulSource, { fetchImpl: seoulFetch });

  assert.equal(seoul.sourceDate, '2026-07-29');
  assert.equal(seoulCalls[1].init.method, 'POST');
  assert.match(String(seoulCalls[1].init.body), /infId=OA-22586/);

  const dataGoCalls = [];
  const dataGoSource = {
    id: 'data-go-download',
    downloadKind: 'data-go-file',
    publicDataPk: '15110521',
    sourceUrl: 'https://www.data.go.kr/data/15110521/fileData.do',
    encoding: 'euc-kr',
  };
  const currentFile = 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=CURRENT&fileDetailSn=1';
  const dataGoFetch = async (url, init = {}) => {
    dataGoCalls.push({ url: String(url), init });
    if (String(url) === dataGoSource.sourceUrl) {
      return new Response(`<script type="application/ld+json">{"contentUrl":${JSON.stringify(currentFile)}}</script>`);
    }
    return new Response('name,road\nfacility,address\n');
  };

  const dataGo = await downloadSourceCsv(dataGoSource, { fetchImpl: dataGoFetch });

  assert.match(dataGo.text, /^name,road/);
  assert.equal(dataGoCalls[1].url, currentFile);
});

test('public JSON API download is keyless, complete, and fail-closed on row counts', async () => {
  const calls = [];
  const source = {
    ...testSource(),
    id: 'public-json-download',
    downloadKind: 'public-json-api',
    downloadUrl: 'https://example.test/open-api',
    apiPageSize: 1000,
    successResultCodes: ['C00'],
  };
  const row = {
    name: '시설',
    road: '서울특별시 종로구 세종대로 1',
    lot: '',
    lat: 37.566,
    lng: 126.978,
    date: '2026-07-29',
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({
      response: {
        header: { resultCode: 'C00', resultMsg: 'NORMAL SERVICE' },
        body: { totalCnt: 1, items: [row] },
      },
    });
  };

  const result = await downloadSourceRows(source, { fetchImpl });

  assert.deepEqual(result.rows, [row]);
  assert.match(calls[0].url, /pageNo=1/);
  assert.match(calls[0].url, /numOfRows=1000/);

  await assert.rejects(
    () => downloadSourceRows(source, {
      fetchImpl: async () => Response.json({
        response: {
          header: { resultCode: 'C00', resultMsg: 'NORMAL SERVICE' },
          body: { totalCnt: 2, items: [row] },
        },
      }),
    }),
    /전체 2행을 충족하지 못했습니다/,
  );
  await assert.rejects(
    () => downloadSourceRows(source, {
      fetchImpl: async () => Response.json({
        response: {
          header: { resultCode: 'E01', resultMsg: 'INVALID REQUEST' },
          body: { totalCnt: 0, items: [] },
        },
      }),
    }),
    /공개 JSON API 오류 E01 INVALID REQUEST/,
  );
  await assert.rejects(
    () => downloadSourceRows(source, {
      fetchImpl: async () => new Response('not-json'),
    }),
    /공개 JSON API 응답을 해석하지 못했습니다/,
  );
});
