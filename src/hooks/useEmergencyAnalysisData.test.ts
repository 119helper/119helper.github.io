import { describe, expect, it } from 'vitest';
import {
  aggregateEmergencyMetricRows,
  getRecentMonths,
  summarizeEmergencyActivity,
} from './useEmergencyAnalysisData';

describe('emergency analysis contract parsing', () => {
  const rows = [
    { gutCo: 1500, trnfCo: 948, trnfPcnt: 955, gutTyCdNm: '정상' },
    { gutCo: 656, trnfCo: 371, trnfPcnt: 371, gutTyCdNm: '정상' },
    { gutCo: 4, trnfCo: 0, trnfPcnt: 0, gutTyCdNm: '오인' },
  ];

  it('reads the actual NFA count field names', () => {
    expect(summarizeEmergencyActivity(rows)).toEqual({
      dispatchCnt: 2160,
      transferCnt: 1319,
      transferPrsnCnt: 1326,
    });
  });

  it('groups station rows into regional chart categories', () => {
    expect(aggregateEmergencyMetricRows(rows, ['gutTyCdNm'], '기타')).toEqual([
      {
        label: '정상',
        dispatchCnt: 2156,
        transferCnt: 1319,
        transferPrsnCnt: 1326,
      },
      {
        label: '오인',
        dispatchCnt: 4,
        transferCnt: 0,
        transferPrsnCnt: 0,
      },
    ]);
  });

  it('builds the month selector from the discovered latest month', () => {
    expect(getRecentMonths(3, '202601')).toEqual(['202601', '202512', '202511']);
  });
});
