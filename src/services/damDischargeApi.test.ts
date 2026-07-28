// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseDamDischargeResponse } from './damDischargeApi';

describe('dam discharge response parser', () => {
  it('preserves the approval-pending adapter state', () => {
    expect(parseDamDischargeResponse({
      status: 'pending-approval',
      message: '심의 중',
    })).toMatchObject({
      status: 'pending-approval',
      items: [],
      message: '심의 중',
    });
  });

  it('parses official XML fields', () => {
    const result = parseDamDischargeResponse({
      status: 'active',
      format: 'xml',
      payload: `<response><body><items><item>
        <damcd>1001</damcd><damNm>테스트댐</damNm><damcoord>36.1,127.2</damcoord>
        <startdate>202607281000</startdate><enddate>202607281300</enddate>
        <updateddate>202607281315</updateddate><affectarea>하류 하천 일대</affectarea>
      </item></items></body></response>`,
    });

    expect(result.items[0]).toMatchObject({
      damCode: '1001',
      damName: '테스트댐',
      startedAt: '202607281000',
      endedAt: '202607281300',
      affectedArea: '하류 하천 일대',
    });
  });
});
