import { describe, expect, it } from 'vitest';
import type { ActivitySessionState } from '../services/activitySession';
import type { IncidentSession } from '../services/incidentSession';
import type { TimerState } from '../services/timerPersistence';
import type { TriagePatient } from '../services/triageSession';
import {
  buildScopedActivityReport,
  resolveActivityReportSource,
  sourceFromArchivedIncident,
  type ArchivedIncidentCaseLike,
} from './activityReportScope';

function activity(incidentId?: string): ActivitySessionState {
  return {
    incidentId,
    presetId: 'fire',
    title: '상가 화재',
    note: '',
    stamps: [
      { stageId: 'dispatch', label: '출동', time: 1_000, lat: null, lon: null },
      { stageId: 'arrival', label: '현장도착', time: 2_000, lat: null, lon: null },
    ],
  };
}

function incident(incidentId: string, active = true): IncidentSession {
  return {
    incidentId,
    active,
    type: 'fire',
    title: `${incidentId} 출동`,
    address: '광주광역시',
    startedAt: 1_000,
    endedAt: active ? undefined : 3_000,
    note: '',
  };
}

function timer(id: number, incidentId: string | null, label: string): TimerState {
  return {
    id,
    incidentId,
    label,
    totalSeconds: 600,
    remaining: 300,
    isRunning: false,
    startedAt: null,
    endsAt: null,
  };
}

function patient(id: string, incidentId: string | null, color: TriagePatient['color']): TriagePatient {
  return {
    id,
    incidentId,
    mode: 'adult',
    color,
    label: id,
    createdAt: '2026-07-31T00:00:00.000Z',
    status: 'triaged',
  };
}

describe('activityReportScope', () => {
  it('uses only exact incident data for a live report', () => {
    const source = resolveActivityReportSource({
      session: activity('incident-a'),
      currentIncident: incident('incident-a'),
      triagePatients: [
        patient('a', 'incident-a', 'red'),
        patient('b', 'incident-b', 'yellow'),
        patient('legacy', null, 'green'),
      ],
      timers: [
        timer(1, 'incident-a', 'A 공기호흡기'),
        timer(2, 'incident-b', 'B 공기호흡기'),
        timer(3, null, '미지정 타이머'),
      ],
      now: 4_000,
    });

    expect(source.kind).toBe('live');
    expect(source.incident?.incidentId).toBe('incident-a');
    expect(source.triagePatients.map(item => item.id)).toEqual(['a']);
    expect(source.timers.map(item => item.id)).toEqual([1]);

    const bundle = buildScopedActivityReport(source, '소방교 홍길동', 5_000);
    expect(bundle).toMatchObject({
      schemaVersion: 1,
      incidentId: 'incident-a',
      snapshotAt: new Date(4_000).toISOString(),
      source: 'live',
      readOnly: false,
    });
    expect(bundle.triageCounts).toEqual({ red: 1, yellow: 0, green: 0, black: 0 });
    expect(bundle.report).toContain('A 공기호흡기');
    expect(bundle.report).not.toContain('B 공기호흡기');
  });

  it('excludes legacy unassigned context while another incident is active', () => {
    const source = resolveActivityReportSource({
      session: activity(),
      currentIncident: incident('incident-a'),
      triagePatients: [
        patient('a', 'incident-a', 'red'),
        patient('legacy', null, 'green'),
      ],
      timers: [
        timer(1, 'incident-a', 'A 타이머'),
        timer(2, null, '미지정 타이머'),
      ],
      now: 4_000,
    });

    expect(source.incidentId).toBeNull();
    expect(source.incident).toBeNull();
    expect(source.triagePatients).toEqual([]);
    expect(source.timers).toEqual([]);
    expect(source.scopeWarning).toContain('연결되지 않은 활동 기록');
  });

  it('includes unassigned context only when no incident is active', () => {
    const source = resolveActivityReportSource({
      session: activity(),
      currentIncident: null,
      triagePatients: [
        patient('a', 'incident-a', 'red'),
        patient('legacy', null, 'green'),
      ],
      timers: [
        timer(1, 'incident-a', 'A 타이머'),
        timer(2, null, '미지정 타이머'),
      ],
      now: 4_000,
    });

    expect(source.scopeWarning).toBeNull();
    expect(source.triagePatients.map(item => item.id)).toEqual(['legacy']);
    expect(source.timers.map(item => item.id)).toEqual([2]);
  });

  it('excludes scoped context when the activity and active incident IDs differ', () => {
    const source = resolveActivityReportSource({
      session: activity('incident-old'),
      currentIncident: incident('incident-new'),
      triagePatients: [patient('old', 'incident-old', 'red')],
      timers: [timer(1, 'incident-old', '이전 출동 타이머')],
      now: 4_000,
    });

    expect(source.incident).toBeNull();
    expect(source.triagePatients).toEqual([]);
    expect(source.timers).toEqual([]);
    expect(source.scopeWarning).toContain('사건 ID가 달라');

    const bundle = buildScopedActivityReport(source, '', 5_000);
    expect(bundle.scopeWarning).toBe(source.scopeWarning);
    expect(bundle.report).not.toContain('이전 출동 타이머');
  });

  it('loads a closed archive as immutable report input and filters corrupt foreign rows', () => {
    const archived: ArchivedIncidentCaseLike = {
      incidentId: 'incident-old',
      snapshotAt: 9_000,
      incident: incident('incident-old', false),
      activity: activity('incident-old'),
      triagePatients: [
        patient('old', 'incident-old', 'yellow'),
        patient('foreign', 'incident-new', 'red'),
      ],
      timers: [
        timer(1, 'incident-old', '과거 타이머'),
        timer(2, 'incident-new', '다른 출동 타이머'),
      ],
    };

    const source = sourceFromArchivedIncident(archived);
    expect(source).toMatchObject({
      kind: 'archive',
      readOnly: true,
      incidentId: 'incident-old',
      snapshotAt: 9_000,
    });
    expect(source?.triagePatients.map(item => item.id)).toEqual(['old']);
    expect(source?.timers.map(item => item.id)).toEqual([1]);

    const bundle = buildScopedActivityReport(source!, '', 10_000);
    expect(bundle).toMatchObject({
      schemaVersion: 1,
      incidentId: 'incident-old',
      snapshotAt: new Date(9_000).toISOString(),
      source: 'archive',
      readOnly: true,
    });
  });

  it('rejects an archive whose embedded activity belongs to another incident', () => {
    expect(sourceFromArchivedIncident({
      incidentId: 'incident-old',
      snapshotAt: 9_000,
      incident: incident('incident-old', false),
      activity: activity('incident-other'),
      triagePatients: [],
      timers: [],
    })).toBeNull();
  });

  it('prefers the immutable archive after the active context has moved on', () => {
    const archived: ArchivedIncidentCaseLike = {
      incidentId: 'incident-old',
      snapshotAt: 9_000,
      incident: incident('incident-old', false),
      activity: activity('incident-old'),
      triagePatients: [patient('archived', 'incident-old', 'red')],
      timers: [timer(1, 'incident-old', '보존 타이머')],
    };

    const source = resolveActivityReportSource({
      session: activity('incident-old'),
      currentIncident: incident('incident-new'),
      triagePatients: [patient('live-mutated', 'incident-old', 'green')],
      timers: [timer(2, 'incident-old', '변경된 타이머')],
      archivedIncident: archived,
      now: 20_000,
    });

    expect(source.kind).toBe('archive');
    expect(source.scopeWarning).toBeNull();
    expect(source.triagePatients.map(item => item.id)).toEqual(['archived']);
    expect(source.timers.map(item => item.id)).toEqual([1]);
  });
});
