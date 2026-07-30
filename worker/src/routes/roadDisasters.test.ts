import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRoadDisasters } from './roadDisasters';

const SUCCESS_XML = `<?xml version='1.0' encoding='UTF-8'?>
<response>
  <header><resultCode>0</resultCode><resultMsg>SUCCESS</resultMsg></header>
  <body>
    <totalCount>2</totalCount>
    <items>
      <item>
        <eventId>1234567890</eventId>
        <category>D</category>
        <eventType>D03</eventType>
        <eventDetailType>1</eventDetailType>
        <status/>
        <startDate>20260730080000</startDate>
        <endDate>20260730120000</endDate>
        <locationInfoType>3</locationInfoType>
        <locationInfo>POLYGON((126.850000 35.150000, 126.860000 35.150000, 126.850000 35.150000))</locationInfo>
        <socName>지하차도 침수</socName>
        <socExtent/>
        <linkId>1750000100,1750000101</linkId>
        <roadName>무진대로, 무진대로</roadName>
        <roadNo>22</roadNo>
        <roadDrcType>동측</roadDrcType>
        <lanesBlockType>4</lanesBlockType>
        <lanesBlocked>전 차로</lanesBlocked>
        <message><![CDATA[침수 & 우회 필요]]></message>
      </item>
      <item>
        <eventId>1234567893</eventId>
        <eventType>D07</eventType>
        <eventDetailType>2</eventDetailType>
        <status>1</status>
        <startDate>not-a-date</startDate>
        <endDate/>
        <locationInfoType>2</locationInfoType>
        <locationInfo>126.81 35.11,126.82 35.12</locationInfo>
        <socName>산불 영향 도로</socName>
        <socExtent>NULL</socExtent>
        <linkId/>
        <roadName>국도 1호선</roadName>
        <roadNo/>
        <roadDrcType/>
        <lanesBlockType>5</lanesBlockType>
        <lanesBlocked>1차로</lanesBlocked>
        <message>연기 확산 &amp; 우회</message>
      </item>
    </items>
  </body>
</response>`;

describe('ITS road-disaster adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('builds a bounded ITS query and normalizes XML for the incident briefing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T01:00:00Z'));

    let requestedUrl = '';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(SUCCESS_XML, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleRoadDisasters(
      new URL(
        'https://worker.test/api/road-disasters'
        + '?lat=35.1595&lng=126.8526&radiusKm=5&eventType=all&days=2',
      ),
      'its+key/value',
    );

    const upstream = new URL(requestedUrl);
    expect(upstream.origin).toBe('https://openapi.its.go.kr:9443');
    expect(upstream.pathname).toBe('/disasterInfo');
    expect(upstream.searchParams.get('apiKey')).toBe('its+key/value');
    expect(upstream.searchParams.get('category')).toBe('D');
    expect(upstream.searchParams.get('eventType')).toBe('all');
    expect(upstream.searchParams.get('startDate')).toBe('20260729');
    expect(upstream.searchParams.get('endDate')).toBe('20260730');
    expect(upstream.searchParams.get('getType')).toBe('xml');
    expect(Number(upstream.searchParams.get('minX'))).toBeLessThan(126.8526);
    expect(Number(upstream.searchParams.get('maxX'))).toBeGreaterThan(126.8526);
    expect(Number(upstream.searchParams.get('minY'))).toBeLessThan(35.1595);
    expect(Number(upstream.searchParams.get('maxY'))).toBeGreaterThan(35.1595);

    expect(result.cacheTtl).toBe(60);
    expect(result.data).toMatchObject({
      source: '국토교통부 국가교통정보센터',
      query: {
        lat: 35.1595,
        lng: 126.8526,
        radiusKm: 5,
        eventType: 'all',
        startDate: '20260729',
        endDate: '20260730',
      },
      totalCount: 2,
      truncated: false,
      items: [
        {
          eventId: '1234567890',
          eventType: 'underpass-flooding',
          eventTypeCode: 'D03',
          eventDetailType: '1',
          status: null,
          occurredAt: '2026-07-30T08:00:00+09:00',
          endedAt: '2026-07-30T12:00:00+09:00',
          facilityName: '지하차도 침수',
          facilityExtent: null,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [126.85, 35.15],
              [126.86, 35.15],
              [126.85, 35.15],
            ],
          },
          road: {
            linkIds: ['1750000100', '1750000101'],
            names: ['무진대로'],
            number: '22',
            direction: '동측',
          },
          control: {
            type: 'full',
            typeCode: '4',
            blockedLanes: '전 차로',
          },
          message: '침수 & 우회 필요',
        },
        {
          eventId: '1234567893',
          eventType: 'fire',
          status: '1',
          occurredAt: null,
          endedAt: null,
          facilityExtent: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [126.81, 35.11],
              [126.82, 35.12],
            ],
          },
          control: {
            type: 'detour',
            typeCode: '5',
            blockedLanes: '1차로',
          },
          message: '연기 확산 & 우회',
        },
      ],
    });
    expect(JSON.stringify(result.data)).not.toContain('its+key/value');
  });

  it.each([
    'lng=126.8',
    'lat=35.1',
    'lat=35north&lng=126.8',
    'lat=31.9&lng=126.8',
    'lat=35.1&lng=133',
    'lat=35.1&lng=126.8&radiusKm=31',
    'lat=35.1&lng=126.8&eventType=D99',
    'lat=35.1&lng=126.8&days=8',
  ])('rejects invalid or unbounded query parameters before fetch: %s', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleRoadDisasters(
      new URL(`https://worker.test/api/road-disasters?${query}`),
      'its-key',
    )).rejects.toThrow('INVALID_PARAMETER');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the Worker secret before contacting ITS', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleRoadDisasters(
      new URL('https://worker.test/api/road-disasters?lat=35.1&lng=126.8'),
      undefined,
    )).rejects.toThrow('ITS_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects the official public demo key instead of presenting sample rows as live data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleRoadDisasters(
      new URL('https://worker.test/api/road-disasters?lat=35.1&lng=126.8'),
      'test',
    )).rejects.toThrow('DEMO_KEY_NOT_ALLOWED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces ITS API-level failures instead of caching an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      `<?xml version="1.0"?><response><header>
        <resultCode>1</resultCode><resultMsg>4005</resultMsg>
      </header></response>`,
      { status: 200 },
    )));

    await expect(handleRoadDisasters(
      new URL('https://worker.test/api/road-disasters?lat=35.1&lng=126.8'),
      'its-key',
    )).rejects.toThrow('API_RESULT_1 4005');
  });

  it('rejects XML declarations that could define external entities', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      `<?xml version="1.0"?>
      <!DOCTYPE response [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
      <response><header><resultCode>0</resultCode></header><body><totalCount>0</totalCount></body></response>`,
      { status: 200 },
    )));

    await expect(handleRoadDisasters(
      new URL('https://worker.test/api/road-disasters?lat=35.1&lng=126.8'),
      'its-key',
    )).rejects.toThrow('document type declarations are not allowed');
  });

  it('rejects an upstream body above the fixed response limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('too large', {
      status: 200,
      headers: { 'Content-Length': '1500001' },
    })));

    await expect(handleRoadDisasters(
      new URL('https://worker.test/api/road-disasters?lat=35.1&lng=126.8'),
      'its-key',
    )).rejects.toThrow('RESPONSE_TOO_LARGE');
  });
});
