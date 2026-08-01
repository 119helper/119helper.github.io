import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTsunamiCrosscheckReport,
  tsunamiPublicComparisonKey,
} from './tsunami-public-crosscheck.mjs';

const PRIMARY = [{
  ARCD: '2635000000',
  SHNT_PLACE_NM: '동백공원 정상',
  SHNT_PLACE_DTL_POSITION: '부산광역시 해운대구 우동 710-1',
  LA: 35.154811,
  LO: 129.152049,
  USE_AT: 'Y',
}];
const STATIC = [{
  manageGov: '26350',
  shelNm: '동백공원 정상',
  address: '부산광역시 해운대구 우동 710-1',
  lat: 35.154811,
  lon: 129.152049,
}];
const MAP = [{
  manageGov: '26350',
  sidoName: '부산광역시',
  shelNm: '동백공원 정상',
  address: '부산광역시 해운대구 우동 710-1',
  lat: 35.154811,
  lon: 129.152049,
  delYn: 'N',
  modifyDate: Date.parse('2026-07-01T00:00:00Z'),
}];

test('세 출처의 명칭과 좌표가 같으면 같은 비교 키를 만든다', () => {
  assert.equal(
    tsunamiPublicComparisonKey(PRIMARY[0], 'primary'),
    tsunamiPublicComparisonKey(STATIC[0], 'static'),
  );
  assert.equal(
    tsunamiPublicComparisonKey(STATIC[0], 'static'),
    tsunamiPublicComparisonKey(MAP[0], 'map'),
  );
});

test('공개 목록의 일치와 발표 대비 차이를 출처별로 분리한다', () => {
  const report = buildTsunamiCrosscheckReport(
    [...PRIMARY, { ...PRIMARY[0], SHNT_PLACE_NM: 'API 전용', LA: 35.2 }],
    STATIC,
    MAP,
    3,
  );
  assert.deepEqual(report.publicListsAgreement, {
    matched: 1,
    staticOnly: 0,
    mapOnly: 0,
  });
  assert.deepEqual(report.primaryComparison, {
    matchedWithSafetyMap: 1,
    primaryOnly: 1,
    safetyMapOnly: 0,
    matchedByAuthorityAndName: 1,
    primaryOnlyByAuthorityAndName: 1,
    safetyMapOnlyByAuthorityAndName: 0,
  });
  assert.deepEqual(report.countGaps, {
    officialApiToAnnouncement: -1,
    safetyPortalToAnnouncement: -2,
  });
  assert.equal(report.safetyMap.activeTotal, 1);
});

test('빈 출처를 정상적인 0건으로 기록하지 않는다', () => {
  assert.throws(
    () => buildTsunamiCrosscheckReport(PRIMARY, [], MAP),
    /비어 있습니다/,
  );
});
