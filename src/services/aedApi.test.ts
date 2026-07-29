// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseNearbyAeds } from './aedApi';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<response><body><items>
  <item>
    <serialSeq>1</serialSeq><org>전남광주통합특별시의회</org><buildPlace>시의회 1층</buildPlace>
    <buildAddress>광주광역시 서구 전남광주통합특별시 서구 내방로 111</buildAddress>
    <wgs84Lat>35.1596</wgs84Lat><wgs84Lon>126.8527</wgs84Lon><distance>0.12</distance>
    <clerkTel>062-000-0000</clerkTel><monSttTme>0900</monSttTme><monEndTme>1800</monEndTme>
  </item>
  <item><serialSeq>bad</serialSeq><org>좌표 없음</org></item>
</items></body></response>`;

describe('AED XML parser', () => {
  it('normalizes transition-period addresses and operating hours', () => {
    const result = parseNearbyAeds(XML, new Date('2026-07-27T01:00:00Z'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1',
      name: '광주광역시의회',
      locationDetail: '시의회 1층',
      address: '광주광역시 서구 내방로 111',
      distanceKm: 0.12,
      todayHours: '09:00–18:00',
      district: '서구',
    });
  });

  it('rejects malformed XML instead of showing an empty success state', () => {
    expect(() => parseNearbyAeds('<response><item>')).toThrow('XML 형식');
  });
});
