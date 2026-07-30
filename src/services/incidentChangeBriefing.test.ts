import { describe, expect, it } from 'vitest';
import {
  detectIncidentChanges,
  type ErCandidateChangeInput,
  type IncidentChangeSourceInput,
  type IncidentOperationalSnapshot,
  type RoadControlChangeInput,
  type WeatherChangeInput,
} from './incidentChangeBriefing';

const ROAD_SOURCE: IncidentChangeSourceInput = {
  provider: '국토교통부 국가교통정보센터',
  retrievedAt: '2026-07-30T20:00:00+09:00',
  staleAt: null,
};

const ER_SOURCE: IncidentChangeSourceInput = {
  provider: '국립중앙의료원',
  retrievedAt: '2026-07-30T20:00:00+09:00',
  staleAt: null,
};

const WEATHER_SOURCE: IncidentChangeSourceInput = {
  provider: '기상청',
  retrievedAt: '2026-07-30T20:00:00+09:00',
  staleAt: null,
};

function snapshot(
  observedAt: number,
  overrides: Partial<IncidentOperationalSnapshot> = {},
): IncidentOperationalSnapshot {
  return {
    incidentId: 'incident-119',
    observedAt,
    roads: { state: 'ready', items: [], source: ROAD_SOURCE },
    er: { state: 'ready', items: [], source: ER_SOURCE },
    weather: { state: 'ready', value: null, source: WEATHER_SOURCE },
    ...overrides,
  };
}

function road(overrides: Partial<RoadControlChangeInput> = {}): RoadControlChangeInput {
  return {
    eventId: 'road-1',
    eventType: 'underpass-flooding',
    eventTypeCode: 'D03',
    eventLabel: '지하차도 침수',
    roadNames: ['세종대로'],
    controlType: 'partial',
    controlLabel: '부분 통제',
    controlRank: 2,
    severityRank: 4,
    isActive: true,
    distanceKm: 1.2,
    nearestCoordinate: { lat: 37.5665, lng: 126.978 },
    ...overrides,
  };
}

function hospital(overrides: Partial<ErCandidateChangeInput> = {}): ErCandidateChangeInput {
  return {
    id: 'hospital-1',
    name: '현장대학병원',
    address: '서울특별시 중구',
    erBeds: 8,
    distanceKm: 4.2,
    eligible: true,
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherChangeInput> = {}): WeatherChangeInput {
  return {
    windSpeed: 4,
    windDirectionDegree: 0,
    windDirection: '북',
    ...overrides,
  };
}

describe('detectIncidentChanges baseline and safety gates', () => {
  it('does not alert on the first successful observation', () => {
    const current = snapshot(2_000, {
      roads: { state: 'ready', items: [road()], source: ROAD_SOURCE },
      er: { state: 'ready', items: [hospital()], source: ER_SOURCE },
      weather: { state: 'ready', value: weather({ windSpeed: 12 }), source: WEATHER_SOURCE },
    });

    expect(detectIncidentChanges(null, current)).toEqual([]);
  });

  it('does not compare different incidents or failed datasets', () => {
    const previous = snapshot(1_000, {
      er: { state: 'ready', items: [hospital()], source: ER_SOURCE },
    });
    const otherIncident = snapshot(2_000, {
      incidentId: 'incident-other',
      er: { state: 'ready', items: [], source: ER_SOURCE },
    });
    const failedCurrent = snapshot(2_000, {
      er: { state: 'error', items: [], source: ER_SOURCE },
    });

    expect(detectIncidentChanges(previous, otherIncident)).toEqual([]);
    expect(detectIncidentChanges(previous, failedCurrent)).toEqual([]);
  });
});

describe('road-control changes', () => {
  it('detects a newly active control with stable Korean metadata', () => {
    const previous = snapshot(1_000);
    const current = snapshot(2_000, {
      roads: {
        state: 'ready',
        items: [road()],
        source: { ...ROAD_SOURCE, retrievedAt: '2026-07-30T20:01:00+09:00' },
      },
    });

    const [change] = detectIncidentChanges(previous, current);

    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:road:road-1:activated',
      kind: 'road',
      type: 'road-control-activated',
      severity: 'critical',
      title: '새 도로 재난·통제',
      detectedAt: 2_000,
      before: {
        observedAt: 1_000,
        values: { present: false, active: false },
      },
      after: {
        observedAt: 2_000,
        values: {
          present: true,
          active: true,
          controlRank: 2,
          roadName: '세종대로',
        },
      },
      source: {
        dataset: 'road',
        previous: { provider: '국토교통부 국가교통정보센터' },
        current: {
          provider: '국토교통부 국가교통정보센터',
          retrievedAt: '2026-07-30T20:01:00+09:00',
        },
      },
    });
    expect(change.message).toContain('부분 통제');
    expect(change.message).toContain('진입 경로');
  });

  it('detects a control escalation and ignores array order changes', () => {
    const another = road({
      eventId: 'road-2',
      eventType: 'fire',
      eventLabel: '화재',
      roadNames: ['을지로'],
      severityRank: 3,
    });
    const previous = snapshot(1_000, {
      roads: { state: 'ready', items: [road(), another], source: ROAD_SOURCE },
    });
    const reorderedOnly = snapshot(2_000, {
      roads: { state: 'ready', items: [another, road()], source: ROAD_SOURCE },
    });
    expect(detectIncidentChanges(previous, reorderedOnly)).toEqual([]);

    const escalated = snapshot(3_000, {
      roads: {
        state: 'ready',
        items: [
          another,
          road({
            controlType: 'full',
            controlLabel: '전면 통제',
            controlRank: 6,
          }),
        ],
        source: ROAD_SOURCE,
      },
    });
    const [change] = detectIncidentChanges(reorderedOnly, escalated);

    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:road:road-1:control:2-6',
      type: 'road-control-escalated',
      severity: 'critical',
      before: { values: { controlRank: 2 } },
      after: { values: { controlRank: 6 } },
    });
    expect(change.message).toContain('부분 통제에서 전면 통제');
  });

  it('uses a fallback identity that is independent of road-name array order', () => {
    const withoutId = road({
      eventId: null,
      roadNames: ['을지로', '세종대로'],
      severityRank: 2,
    });
    const previous = snapshot(1_000, {
      roads: { state: 'ready', items: [withoutId], source: ROAD_SOURCE },
    });
    const current = snapshot(2_000, {
      roads: {
        state: 'ready',
        items: [{ ...withoutId, roadNames: ['세종대로', '을지로'] }],
        source: ROAD_SOURCE,
      },
    });

    expect(detectIncidentChanges(previous, current)).toEqual([]);
  });
});

describe('emergency-room candidate changes', () => {
  it('detects candidate dropout without treating order changes as dropout', () => {
    const second = hospital({ id: 'hospital-2', name: '시민병원', erBeds: 4 });
    const previous = snapshot(1_000, {
      er: { state: 'ready', items: [hospital(), second], source: ER_SOURCE },
    });
    const reordered = snapshot(2_000, {
      er: { state: 'ready', items: [second, hospital()], source: ER_SOURCE },
    });
    expect(detectIncidentChanges(previous, reordered)).toEqual([]);

    const current = snapshot(3_000, {
      er: { state: 'ready', items: [second], source: ER_SOURCE },
    });
    const [change] = detectIncidentChanges(reordered, current);

    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:er:hospital-1:candidate-dropped',
      kind: 'er',
      type: 'er-candidate-dropped',
      severity: 'warning',
      before: { values: { present: true, erBeds: 8 } },
      after: { values: { present: false, erBeds: 8 } },
    });
    expect(change.message).toContain('전화로 다시 확인');
  });

  it('detects a sharp bed decline but ignores a small fluctuation', () => {
    const previous = snapshot(1_000, {
      er: { state: 'ready', items: [hospital({ erBeds: 8 })], source: ER_SOURCE },
    });
    const smallChange = snapshot(2_000, {
      er: { state: 'ready', items: [hospital({ erBeds: 6 })], source: ER_SOURCE },
    });
    expect(detectIncidentChanges(previous, smallChange)).toEqual([]);

    const sharpChange = snapshot(3_000, {
      er: { state: 'ready', items: [hospital({ erBeds: 3 })], source: ER_SOURCE },
    });
    const [change] = detectIncidentChanges(previous, sharpChange);

    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:er:hospital-1:beds:8-3',
      type: 'er-beds-dropped',
      severity: 'warning',
      before: { values: { erBeds: 8 } },
      after: { values: { erBeds: 3 } },
    });
    expect(change.message).toContain('8병상에서 3병상');
  });

  it('treats a drop to zero as critical even from a small starting count', () => {
    const previous = snapshot(1_000, {
      er: { state: 'ready', items: [hospital({ erBeds: 2 })], source: ER_SOURCE },
    });
    const current = snapshot(2_000, {
      er: { state: 'ready', items: [hospital({ erBeds: 0 })], source: ER_SOURCE },
    });

    expect(detectIncidentChanges(previous, current)[0]).toMatchObject({
      type: 'er-beds-dropped',
      severity: 'critical',
    });
  });
});

describe('wind changes', () => {
  it('detects a wind-risk level escalation', () => {
    const previous = snapshot(1_000, {
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 6, windDirectionDegree: 0 }),
        source: WEATHER_SOURCE,
      },
    });
    const current = snapshot(2_000, {
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 10.5, windDirectionDegree: 0 }),
        source: WEATHER_SOURCE,
      },
    });

    const [change] = detectIncidentChanges(previous, current);
    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:weather:wind-speed:level:0-2',
      kind: 'weather',
      type: 'wind-speed-escalated',
      severity: 'critical',
      before: { values: { windSpeedMps: 6, windRiskLevel: '관찰' } },
      after: { values: { windSpeedMps: 10.5, windRiskLevel: '위험' } },
    });
    expect(change.message).toContain('6.0m/s에서 10.5m/s');
  });

  it('detects a meaningful direction shift only when current wind is strong enough', () => {
    const previous = snapshot(1_000, {
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 5, windDirectionDegree: 0 }),
        source: WEATHER_SOURCE,
      },
    });
    const current = snapshot(2_000, {
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 5, windDirectionDegree: 90 }),
        source: WEATHER_SOURCE,
      },
    });
    const [change] = detectIncidentChanges(previous, current);

    expect(change).toMatchObject({
      dedupeKey: 'incident:incident-119:weather:wind-direction:0-4',
      type: 'wind-direction-shifted',
      severity: 'warning',
      before: { values: { windDirectionLabel: '북' } },
      after: { values: { windDirectionLabel: '동' } },
    });
    expect(change.message).toContain('약 90°');

    const calmCurrent = snapshot(2_000, {
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 2, windDirectionDegree: 90 }),
        source: WEATHER_SOURCE,
      },
    });
    expect(detectIncidentChanges(previous, calmCurrent)).toEqual([]);
  });

  it('uses circular direction distance and accepts Korean direction text', () => {
    const previous = snapshot(1_000, {
      weather: {
        state: 'ready',
        value: { windSpeed: 5, windDirectionDegree: 350 },
        source: WEATHER_SOURCE,
      },
    });
    const current = snapshot(2_000, {
      weather: {
        state: 'ready',
        value: { windSpeed: 5, windDirection: '북북동풍' },
        source: WEATHER_SOURCE,
      },
    });

    expect(detectIncidentChanges(previous, current)).toEqual([]);
  });
});

describe('deterministic output', () => {
  it('returns identical keys and ordering for identical semantic input', () => {
    const previous = snapshot(1_000, {
      roads: { state: 'ready', items: [], source: ROAD_SOURCE },
      er: { state: 'ready', items: [hospital({ erBeds: 8 })], source: ER_SOURCE },
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 6, windDirectionDegree: 0 }),
        source: WEATHER_SOURCE,
      },
    });
    const current = snapshot(2_000, {
      roads: { state: 'ready', items: [road()], source: ROAD_SOURCE },
      er: { state: 'ready', items: [hospital({ erBeds: 0 })], source: ER_SOURCE },
      weather: {
        state: 'ready',
        value: weather({ windSpeed: 10, windDirectionDegree: 90 }),
        source: WEATHER_SOURCE,
      },
    });

    const first = detectIncidentChanges(previous, current);
    const second = detectIncidentChanges(previous, {
      ...current,
      roads: {
        ...current.roads!,
        items: [...current.roads!.items].reverse(),
      },
      er: {
        ...current.er!,
        items: [...current.er!.items].reverse(),
      },
    });

    expect(second).toEqual(first);
    expect(first.map(item => item.severity)).toEqual([
      'critical',
      'critical',
      'critical',
      'critical',
    ]);
    expect(new Set(first.map(item => item.dedupeKey)).size).toBe(first.length);
  });
});
