import type { ActivitySessionState } from '../services/activitySession';
import type { IncidentSession } from '../services/incidentSession';
import type { TimerState } from '../services/timerPersistence';
import type { TriagePatient } from '../services/triageSession';
import {
  buildReportPackageText,
  type ReportTimerSummary,
} from './activityReport';

export type ActivityReportSourceKind = 'live' | 'archive';

export interface ArchivedIncidentCaseLike {
  incidentId: string;
  snapshotAt: number;
  incident: IncidentSession;
  activity: ActivitySessionState;
  triagePatients: TriagePatient[];
  timers: TimerState[];
}

export interface ActivityReportSource {
  kind: ActivityReportSourceKind;
  readOnly: boolean;
  scopeWarning: string | null;
  incidentId: string | null;
  snapshotAt: number;
  session: ActivitySessionState;
  incident: IncidentSession | null;
  triagePatients: TriagePatient[];
  timers: TimerState[];
}

export interface ActivityReportBundle {
  schemaVersion: 1;
  incidentId: string | null;
  snapshotAt: string;
  generatedAt: string;
  source: ActivityReportSourceKind;
  readOnly: boolean;
  scopeWarning: string | null;
  title: string;
  session: ActivitySessionState;
  report: string;
  timers: ReportTimerSummary[];
  triageCounts: Record<'red' | 'yellow' | 'green' | 'black', number>;
  incident: IncidentSession | null;
}

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  fire: '화재',
  ems: '구급',
  rescue: '구조',
  support: '지원',
};

const PRESET_LABELS: Record<string, string> = {
  fire: '화재',
  ems: '구급',
  rescue: '구조',
  support: '지원',
};

function normalizeIncidentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const incidentId = value.trim().slice(0, 80);
  return incidentId || null;
}

function sameIncidentId(value: unknown, incidentId: string | null): boolean {
  return normalizeIncidentId(value) === incidentId;
}

export function sourceFromArchivedIncident(
  archived: ArchivedIncidentCaseLike,
): ActivityReportSource | null {
  const incidentId = normalizeIncidentId(archived.incidentId);
  if (
    !incidentId
    || !sameIncidentId(archived.incident.incidentId, incidentId)
    || !sameIncidentId(archived.activity.incidentId, incidentId)
  ) {
    return null;
  }

  return {
    kind: 'archive',
    readOnly: true,
    scopeWarning: null,
    incidentId,
    snapshotAt: archived.snapshotAt,
    session: archived.activity,
    incident: archived.incident,
    triagePatients: archived.triagePatients.filter(patient => (
      sameIncidentId(patient.incidentId, incidentId)
    )),
    timers: archived.timers.filter(timer => (
      sameIncidentId(timer.incidentId, incidentId)
    )),
  };
}

export function resolveActivityReportSource(input: {
  session: ActivitySessionState;
  currentIncident: IncidentSession | null;
  triagePatients: readonly TriagePatient[];
  timers: readonly TimerState[];
  archivedIncident?: ArchivedIncidentCaseLike | null;
  now?: number;
}): ActivityReportSource {
  const incidentId = normalizeIncidentId(input.session.incidentId);
  const currentIncidentMatches = Boolean(
    incidentId
    && input.currentIncident
    && sameIncidentId(input.currentIncident.incidentId, incidentId),
  );
  const activeCurrentIncidentMatches = currentIncidentMatches && input.currentIncident?.active === true;
  const hasDifferentActiveIncident = Boolean(
    input.currentIncident?.active
    && !activeCurrentIncidentMatches,
  );

  if (!activeCurrentIncidentMatches && input.archivedIncident) {
    const archived = sourceFromArchivedIncident(input.archivedIncident);
    if (archived && archived.incidentId === incidentId) return archived;
  }

  const scopeWarning = hasDifferentActiveIncident
    ? incidentId
      ? '현재 출동과 활동 기록의 사건 ID가 달라 환자·타이머·상황판 정보를 제외했습니다.'
      : '현재 출동에 연결되지 않은 활동 기록이라 환자·타이머·상황판 정보를 제외했습니다.'
    : null;

  return {
    kind: 'live',
    readOnly: false,
    scopeWarning,
    incidentId,
    snapshotAt: input.now ?? Date.now(),
    session: input.session,
    incident: !scopeWarning && currentIncidentMatches ? input.currentIncident : null,
    triagePatients: scopeWarning ? [] : input.triagePatients.filter(patient => (
        sameIncidentId(patient.incidentId, incidentId)
      )),
    timers: scopeWarning ? [] : input.timers.filter(timer => (
        sameIncidentId(timer.incidentId, incidentId)
      )),
  };
}

function triageCountsFor(
  patients: readonly TriagePatient[],
): Record<'red' | 'yellow' | 'green' | 'black', number> {
  const counts = { red: 0, yellow: 0, green: 0, black: 0 };
  patients.forEach(patient => {
    counts[patient.color] += 1;
  });
  return counts;
}

function timerSummariesFor(timers: readonly TimerState[]): ReportTimerSummary[] {
  return timers.map(timer => ({
    label: timer.label,
    remainingSeconds: timer.remaining,
    totalSeconds: timer.totalSeconds,
    running: timer.isRunning,
  }));
}

function validTimestamp(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildScopedActivityReport(
  source: ActivityReportSource,
  author: string,
  generatedAt = Date.now(),
): ActivityReportBundle {
  const sortedStamps = [...source.session.stamps].sort((a, b) => a.time - b.time);
  const presetLabel = PRESET_LABELS[source.session.presetId] || source.session.presetId;
  const title = source.session.title.trim()
    || source.incident?.title
    || `${presetLabel} 출동`;
  const timers = timerSummariesFor(source.timers);
  const triageCounts = triageCountsFor(source.triagePatients);
  const incident = source.incident;
  const report = buildReportPackageText({
    title,
    stamps: sortedStamps,
    note: source.session.note,
    author,
    incident: incident ? {
      title: incident.title || title,
      type: INCIDENT_TYPE_LABELS[incident.type] || incident.type,
      address: incident.address,
      startedAt: incident.startedAt,
      endedAt: incident.endedAt,
    } : null,
    timers,
    triageCounts,
  });
  const generatedAtMs = validTimestamp(generatedAt, Date.now());
  const snapshotAtMs = validTimestamp(source.snapshotAt, generatedAtMs);

  return {
    schemaVersion: 1,
    incidentId: source.incidentId,
    snapshotAt: new Date(snapshotAtMs).toISOString(),
    generatedAt: new Date(generatedAtMs).toISOString(),
    source: source.kind,
    readOnly: source.readOnly,
    scopeWarning: source.scopeWarning,
    title,
    session: source.session,
    report,
    timers,
    triageCounts,
    incident,
  };
}
