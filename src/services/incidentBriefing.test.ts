import { describe, expect, it } from 'vitest';
import {
  distanceBetweenCoordinatesKm,
  formatDistanceLabel,
  getRoadControlRank,
  getRoadSeverityRank,
  haversineDistanceKm,
  normalizeIncidentCoordinate,
  normalizeRoadDisasterItem,
  normalizeRoadDisasterItems,
  pickNearbyFireWaterFacilities,
  rankNearbyRoadDisasters,
  validateIncidentCoordinate,
} from './incidentBriefing';

function roadDisaster(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'event-1',
    eventType: 'underpass-flooding',
    eventTypeCode: 'D03',
    eventDetailType: '침수',
    status: '발생',
    occurredAt: '2026-07-30T09:00:00+09:00',
    endedAt: null,
    facilityName: '테스트 지하차도',
    facilityExtent: '100m',
    geometry: {
      type: 'Point',
      coordinates: [[126.98, 37.57]],
      raw: null,
    },
    road: {
      linkIds: ['1'],
      names: ['세종대로'],
      number: '1',
      direction: '남향',
    },
    control: {
      type: 'full',
      typeCode: 'C01',
      blockedLanes: '전 차로',
    },
    message: '침수로 전면 통제',
    ...overrides,
  };
}

describe('incident coordinate normalization', () => {
  it('normalizes numeric strings and common coordinate field names', () => {
    expect(normalizeIncidentCoordinate({ latitude: '37.5665', longitude: '126.9780' })).toEqual({
      lat: 37.5665,
      lng: 126.978,
    });
    expect(normalizeIncidentCoordinate({ lat: 35.16, lon: 129.06 })).toEqual({
      lat: 35.16,
      lng: 129.06,
    });
  });

  it('rejects blank, non-finite, and out-of-range coordinates with a useful issue', () => {
    expect(validateIncidentCoordinate({ lat: '', lng: 127 })).toEqual({
      valid: false,
      issue: 'invalid-latitude',
    });
    expect(validateIncidentCoordinate({ lat: 37, lng: 181 })).toEqual({
      valid: false,
      issue: 'invalid-longitude',
    });
    expect(validateIncidentCoordinate({ lat: Number.NaN })).toEqual({
      valid: false,
      issue: 'missing-coordinate',
    });
  });
});

describe('incident distances', () => {
  it('computes a known Seoul distance and remains symmetric', () => {
    const cityHall = { lat: 37.5663, lng: 126.9779 };
    const gangnam = { lat: 37.4979, lng: 127.0276 };
    const forward = haversineDistanceKm(cityHall, gangnam);
    const reverse = haversineDistanceKm(gangnam, cityHall);

    expect(forward).toBeGreaterThan(7);
    expect(forward).toBeLessThan(10);
    expect(reverse).toBeCloseTo(forward, 8);
  });

  it('returns null for untrusted invalid inputs', () => {
    expect(distanceBetweenCoordinatesKm({ lat: 37, lng: 127 }, { lat: 91, lng: 127 })).toBeNull();
  });

  it('formats field-friendly metre and kilometre labels', () => {
    expect(formatDistanceLabel(0.428)).toBe('428m');
    expect(formatDistanceLabel(1.24)).toBe('1.2km');
    expect(formatDistanceLabel(12.6)).toBe('13km');
    expect(formatDistanceLabel(Number.NaN)).toBe('거리 미상');
  });
});

describe('nearby fire-water facilities', () => {
  it('accepts both normalized and raw API coordinates, filters by radius, and sorts nearest first', () => {
    const facilities = [
      { id: 'far', lat: 37.58, lng: 127, status: '정상' },
      { fcltyNo: 'nearest', latitude: '37.5666', longitude: '126.9781' },
      { id: 'outside', lat: 37.8, lng: 127.3 },
      { id: 'invalid', lat: 999, lng: 127 },
    ];

    const result = pickNearbyFireWaterFacilities(
      facilities,
      { lat: 37.5665, lng: 126.978 },
      { radiusKm: 5, limit: 3 },
    );

    expect(result).toHaveLength(2);
    expect('fcltyNo' in result[0].facility && result[0].facility.fcltyNo).toBe('nearest');
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    expect(result[0].distanceLabel).toMatch(/m$/);
  });

  it('returns no candidates when the incident coordinate is invalid or the limit is zero', () => {
    const facilities = [{ id: 'one', lat: 37.5, lng: 127 }];
    expect(pickNearbyFireWaterFacilities(facilities, { lat: '', lng: 127 })).toEqual([]);
    expect(pickNearbyFireWaterFacilities(facilities, { lat: 37.5, lng: 127 }, { limit: 0 })).toEqual([]);
  });
});

describe('road-disaster normalization and priority', () => {
  it('normalizes the Worker contract and derives event/control labels and ranks', () => {
    const item = normalizeRoadDisasterItem(roadDisaster());

    expect(item).toMatchObject({
      eventId: 'event-1',
      eventType: 'underpass-flooding',
      eventLabel: '지하차도 침수',
      controlType: 'full',
      controlLabel: '전면 통제',
      severity: 'critical',
      severityRank: 4,
      controlRank: 6,
      isActive: true,
      roadNames: ['세종대로'],
    });
    expect(item?.coordinates).toEqual([{ lat: 37.57, lng: 126.98 }]);
    expect(getRoadSeverityRank('D07')).toBe(3);
    expect(getRoadControlRank('부분 통제')).toBe(2);
  });

  it('normalizes either an item array or a response containing items', () => {
    expect(normalizeRoadDisasterItems([roadDisaster()])).toHaveLength(1);
    expect(normalizeRoadDisasterItems({ items: [roadDisaster(), null] })).toHaveLength(1);
    expect(normalizeRoadDisasterItems({ items: 'invalid' })).toEqual([]);
  });

  it('keeps an event active until its future ITS endDate actually passes', () => {
    const referenceTime = Date.parse('2026-07-30T10:00:00+09:00');
    const futureEnd = normalizeRoadDisasterItem(
      roadDisaster({
        status: null,
        endedAt: '2026-07-30T12:00:00+09:00',
      }),
      { referenceTime },
    );
    const pastEnd = normalizeRoadDisasterItem(
      roadDisaster({
        status: null,
        endedAt: '2026-07-30T09:00:00+09:00',
      }),
      { referenceTime },
    );

    expect(futureEnd?.isActive).toBe(true);
    expect(pastEnd?.isActive).toBe(false);
  });

  it('applies the official ITS completion status codes per event type', () => {
    // D03 공식 status: 발표/대치/해제/대치해제/연장/변경/변경해제.
    // "해제" 또는 "*해제"만 종료이고 나머지는 진행 중이다.
    for (const completedStatus of ['해제', '대치해제', '변경해제']) {
      expect(normalizeRoadDisasterItem(roadDisaster({
        eventType: 'underpass-flooding',
        eventTypeCode: 'D03',
        status: completedStatus,
        endedAt: null,
      }))?.isActive).toBe(false);
    }
    for (const activeStatus of ['발표', '대치', '연장', '변경']) {
      expect(normalizeRoadDisasterItem(roadDisaster({
        eventType: 'underpass-flooding',
        eventTypeCode: 'D03',
        status: activeStatus,
        endedAt: null,
      }))?.isActive).toBe(true);
    }

    // D04의 숫자 status 의미는 공식 명세로 확정되지 않아 상태만으로 종료하지 않는다.
    expect(normalizeRoadDisasterItem(roadDisaster({
      eventType: 'river-flood',
      eventTypeCode: 'D04',
      status: '3',
      endedAt: null,
    }))?.isActive).toBe(true);

    // D06 공식 status: 1 복구중, 2 임시복구, 3 복구완료.
    for (const activeStatus of ['1', '2']) {
      expect(normalizeRoadDisasterItem(roadDisaster({
        eventType: 'sinkhole',
        eventTypeCode: 'D06',
        status: activeStatus,
        endedAt: null,
      }))?.isActive).toBe(true);
    }
    expect(normalizeRoadDisasterItem(roadDisaster({
      eventType: 'sinkhole',
      eventTypeCode: 'D06',
      status: '3',
      endedAt: null,
    }))?.isActive).toBe(false);

    // D07 공식 status: 1 진화중, 2 진화완료, 3 종료.
    for (const completedStatus of ['2', '3']) {
      expect(normalizeRoadDisasterItem(roadDisaster({
        eventType: 'fire',
        eventTypeCode: 'D07',
        status: completedStatus,
        endedAt: null,
      }))?.isActive).toBe(false);
    }

    // 숫자 3을 모든 이벤트의 완료로 오인하지 않는다.
    expect(normalizeRoadDisasterItem(roadDisaster({
      eventType: 'underpass-flooding',
      eventTypeCode: 'D03',
      status: '3',
      endedAt: null,
    }))?.isActive).toBe(true);
  });

  it('can rank an item that was normalized ahead of time', () => {
    const normalized = normalizeRoadDisasterItem(roadDisaster());
    expect(normalized).not.toBeNull();

    const [ranked] = rankNearbyRoadDisasters(
      [normalized],
      { lat: 37.5665, lng: 126.978 },
      { radiusKm: 5 },
    );

    expect(ranked).toMatchObject({
      eventId: 'event-1',
      roadNames: ['세종대로'],
      nearestCoordinate: { lat: 37.57, lng: 126.98 },
    });
  });

  it('uses the nearest geometry point and sorts active severity, control, then distance', () => {
    const origin = { lat: 37.5665, lng: 126.978 };
    const endedCritical = roadDisaster({
      eventId: 'ended-critical',
      endedAt: '2026-07-30T10:00:00+09:00',
      geometry: { type: 'Point', coordinates: [[126.9781, 37.5666]] },
    });
    const activeFire = roadDisaster({
      eventId: 'active-fire',
      eventType: 'fire',
      eventTypeCode: 'D07',
      control: { type: 'full', typeCode: null, blockedLanes: null },
      geometry: { type: 'Point', coordinates: [[126.979, 37.567]] },
    });
    const activeFlood = roadDisaster({
      eventId: 'active-flood',
      control: { type: 'partial', typeCode: null, blockedLanes: '1개 차로' },
      geometry: {
        type: 'LineString',
        coordinates: [[127.3, 37.8], [126.9802, 37.568]],
      },
    });
    const outside = roadDisaster({
      eventId: 'outside',
      geometry: { type: 'Point', coordinates: [[128, 38]] },
    });

    const result = rankNearbyRoadDisasters(
      [endedCritical, activeFire, activeFlood, outside],
      origin,
      { radiusKm: 5, limit: 10 },
    );

    expect(result.map(item => item.eventId)).toEqual([
      'active-flood',
      'active-fire',
      'ended-critical',
    ]);
    expect(result[0].nearestCoordinate).toEqual({ lat: 37.568, lng: 126.9802 });
    expect(result[0].distanceKm).toBeLessThan(1);
    expect(result[0].priorityRank).toBeGreaterThan(result[2].priorityRank);
  });

  it('includes a LineString when its segment crosses the radius although both vertices are outside', () => {
    const origin = { lat: 37.5665, lng: 126.978 };
    const crossingLine = roadDisaster({
      eventId: 'crossing-line',
      geometry: {
        type: 'LineString',
        coordinates: [
          [126.878, 37.5665],
          [127.078, 37.5665],
        ],
      },
    });

    const [result] = rankNearbyRoadDisasters(
      [crossingLine],
      origin,
      { radiusKm: 1 },
    );

    expect(result.eventId).toBe('crossing-line');
    expect(result.distanceKm).toBeCloseTo(0, 6);
    expect(result.nearestCoordinate).toMatchObject(origin);
  });

  it('treats an incident inside a Polygon as 0km even when every vertex is outside the radius', () => {
    const origin = { lat: 37.5665, lng: 126.978 };
    const surroundingPolygon = roadDisaster({
      eventId: 'surrounding-polygon',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [126.878, 37.4665],
          [127.078, 37.4665],
          [127.078, 37.6665],
          [126.878, 37.6665],
          [126.878, 37.4665],
        ],
      },
    });

    const [result] = rankNearbyRoadDisasters(
      [surroundingPolygon],
      origin,
      { radiusKm: 1 },
    );

    expect(result.eventId).toBe('surrounding-polygon');
    expect(result.distanceKm).toBe(0);
    expect(result.nearestCoordinate).toEqual(origin);
  });

  it('uses control rank before distance when active incidents have equal severity', () => {
    const origin = { lat: 37.5665, lng: 126.978 };
    const nearbyPartial = roadDisaster({
      eventId: 'nearby-partial',
      control: { type: 'partial' },
      geometry: { type: 'Point', coordinates: [[126.9781, 37.5666]] },
    });
    const fartherFull = roadDisaster({
      eventId: 'farther-full',
      control: { type: 'full' },
      geometry: { type: 'Point', coordinates: [[126.99, 37.575]] },
    });

    expect(
      rankNearbyRoadDisasters([nearbyPartial, fartherFull], origin, { radiusKm: 5 })
        .map(item => item.eventId),
    ).toEqual(['farther-full', 'nearby-partial']);
  });
});
