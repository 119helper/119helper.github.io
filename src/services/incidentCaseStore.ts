import {
  normalizeActivitySession,
  type ActivitySessionState,
} from './activitySession';
import {
  normalizeIncidentSession,
  type IncidentSession,
} from './incidentSession';
import {
  loadPrivacySettings,
  loadStoredJson,
  removeStoredJson,
  saveStoredJson,
} from './privacySettings';
import {
  normalizeTriagePatients,
  type TriagePatient,
} from './triageSession';
import type {
  StopwatchLap,
  TimerState,
} from './timerPersistence';

export const INCIDENT_CASE_ARCHIVE_KEY = '119helper-incident-case-archive';
export const INCIDENT_CASE_ARCHIVE_EVENT = '119helper-incident-case-archive-updated';
export const INCIDENT_CASE_SCHEMA_VERSION = 1 as const;

interface IncidentCaseArchiveEnvelope {
  version: 1;
  records: IncidentCaseSnapshot[];
}

export interface IncidentCaseStopwatchSnapshot {
  incidentId: string;
  running: boolean;
  startedAt: Date | null;
  elapsedMs: number;
  laps: StopwatchLap[];
}

export interface IncidentCaseStopwatchInput {
  incidentId: string | null;
  running: boolean;
  startedAt: Date | null;
  elapsedMs: number;
  laps: readonly StopwatchLap[];
}

export interface IncidentCaseTimerSnapshot extends TimerState {
  readonly wasRunningAtClose: boolean;
}

export interface IncidentCaseSnapshot {
  readonly schemaVersion: 1;
  readonly incidentId: string;
  readonly snapshotAt: number;
  readonly closedAt: number;
  readonly incident: IncidentSession;
  readonly activity: ActivitySessionState;
  readonly triagePatients: TriagePatient[];
  readonly timers: IncidentCaseTimerSnapshot[];
  readonly stopwatch: IncidentCaseStopwatchSnapshot | null;
}

export interface IncidentCaseArchiveInput {
  incident: IncidentSession;
  activity: ActivitySessionState;
  triagePatients: readonly TriagePatient[];
  timers: readonly TimerState[];
  stopwatch: IncidentCaseStopwatchInput | null;
}

export type ArchiveIncidentCaseResult =
  | { status: 'saved'; record: IncidentCaseSnapshot }
  | { status: 'existing'; record: IncidentCaseSnapshot }
  | { status: 'skipped-public'; record?: undefined };

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeIncidentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const incidentId = value.trim().slice(0, 80);
  return incidentId || null;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTimer(
  value: unknown,
  incidentId: string,
  closedAt: number,
): IncidentCaseTimerSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const timer = value as Partial<TimerState>;
  if (normalizeIncidentId(timer.incidentId) !== incidentId) return null;

  const id = finiteNumber(timer.id);
  const totalSeconds = finiteNumber(timer.totalSeconds);
  const remaining = finiteNumber(timer.remaining);
  if (
    id === null
    || id < 0
    || totalSeconds === null
    || totalSeconds <= 0
    || remaining === null
    || typeof timer.label !== 'string'
  ) {
    return null;
  }

  const storedRemaining = Math.min(
    Math.floor(totalSeconds),
    Math.max(0, Math.ceil(remaining)),
  );
  const endsAt = finiteNumber(timer.endsAt);
  const isStoredSnapshot = typeof (timer as Partial<IncidentCaseTimerSnapshot>).wasRunningAtClose === 'boolean';
  const wasRunningAtClose = isStoredSnapshot
    ? (timer as Partial<IncidentCaseTimerSnapshot>).wasRunningAtClose === true
    : timer.isRunning === true;
  const normalizedRemaining = !isStoredSnapshot && wasRunningAtClose && endsAt !== null && endsAt > 0
    ? Math.min(Math.floor(totalSeconds), Math.max(0, Math.ceil((endsAt - closedAt) / 1000)))
    : storedRemaining;

  return {
    id,
    incidentId,
    label: timer.label.slice(0, 80),
    totalSeconds: Math.floor(totalSeconds),
    remaining: normalizedRemaining,
    isRunning: false,
    startedAt: parseDate(timer.startedAt),
    endsAt: null,
    wasRunningAtClose,
  };
}

function normalizeLaps(value: unknown): StopwatchLap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): StopwatchLap[] => {
    if (!entry || typeof entry !== 'object') return [];
    const lap = entry as Partial<StopwatchLap>;
    const time = parseDate(lap.time);
    const elapsed = finiteNumber(lap.elapsed);
    if (!time || elapsed === null || elapsed < 0 || typeof lap.label !== 'string') return [];
    return [{
      label: lap.label.slice(0, 80),
      time,
      elapsed,
    }];
  });
}

function normalizeStopwatch(
  value: unknown,
  incidentId: string,
): IncidentCaseStopwatchSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const stopwatch = value as Partial<IncidentCaseStopwatchInput>;
  if (normalizeIncidentId(stopwatch.incidentId) !== incidentId) return null;

  const elapsedMs = finiteNumber(stopwatch.elapsedMs);
  if (elapsedMs === null || elapsedMs < 0) return null;

  return {
    incidentId,
    running: stopwatch.running === true,
    startedAt: parseDate(stopwatch.startedAt),
    elapsedMs,
    laps: normalizeLaps(stopwatch.laps),
  };
}

function normalizeSnapshot(value: unknown): IncidentCaseSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<IncidentCaseSnapshot>;
  if (raw.schemaVersion !== INCIDENT_CASE_SCHEMA_VERSION) return null;

  const incidentId = normalizeIncidentId(raw.incidentId);
  const snapshotAt = finiteNumber(raw.snapshotAt);
  const closedAt = finiteNumber(raw.closedAt);
  if (!incidentId || snapshotAt === null || snapshotAt <= 0 || closedAt === null || closedAt <= 0) {
    return null;
  }

  const incident = normalizeIncidentSession(raw.incident);
  if (
    incident.incidentId !== incidentId
    || incident.active
    || incident.endedAt !== closedAt
    || incident.startedAt <= 0
    || closedAt < incident.startedAt
  ) {
    return null;
  }

  const activity = normalizeActivitySession(raw.activity);
  if (activity.incidentId !== incidentId) return null;

  const triagePatients = normalizeTriagePatients(raw.triagePatients)
    .filter(patient => patient.incidentId === incidentId);
  const timers = Array.isArray(raw.timers)
    ? raw.timers.flatMap(timer => {
        const normalized = normalizeTimer(timer, incidentId, closedAt);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    schemaVersion: INCIDENT_CASE_SCHEMA_VERSION,
    incidentId,
    snapshotAt,
    closedAt,
    incident,
    activity,
    triagePatients,
    timers,
    stopwatch: normalizeStopwatch(raw.stopwatch, incidentId),
  };
}

function normalizeEnvelope(value: unknown): IncidentCaseSnapshot[] {
  if (!value || typeof value !== 'object') return [];
  const envelope = value as Partial<IncidentCaseArchiveEnvelope>;
  if (envelope.version !== INCIDENT_CASE_SCHEMA_VERSION || !Array.isArray(envelope.records)) return [];

  const seen = new Set<string>();
  return envelope.records.flatMap((entry): IncidentCaseSnapshot[] => {
    const record = normalizeSnapshot(entry);
    if (!record || seen.has(record.incidentId)) return [];
    seen.add(record.incidentId);
    return [record];
  });
}

function isRetained(record: IncidentCaseSnapshot, now: number, retentionDays: number): boolean {
  if (retentionDays <= 0) return true;
  return now - record.closedAt <= retentionDays * DAY_MS;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function persistSnapshots(records: readonly IncidentCaseSnapshot[]): void {
  const envelope: IncidentCaseArchiveEnvelope = {
    version: INCIDENT_CASE_SCHEMA_VERSION,
    records: [...records],
  };
  saveStoredJson(INCIDENT_CASE_ARCHIVE_KEY, envelope);
  dispatchArchiveUpdate();
}

function dispatchArchiveUpdate(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INCIDENT_CASE_ARCHIVE_EVENT));
}

function clearArchive(): void {
  const hadArchive = typeof localStorage !== 'undefined'
    && localStorage.getItem(INCIDENT_CASE_ARCHIVE_KEY) !== null;
  removeStoredJson(INCIDENT_CASE_ARCHIVE_KEY);
  if (hadArchive) dispatchArchiveUpdate();
}

export function loadIncidentCaseSnapshots(now = Date.now()): IncidentCaseSnapshot[] {
  const settings = loadPrivacySettings();
  if (settings.publicDeviceMode) {
    clearArchive();
    return [];
  }

  const raw = loadStoredJson<unknown>(INCIDENT_CASE_ARCHIVE_KEY, null);
  const normalized = normalizeEnvelope(raw);
  const retained = normalized
    .filter(record => isRetained(record, now, settings.retentionDays))
    .sort((a, b) => b.closedAt - a.closedAt);

  const retainedEnvelope: IncidentCaseArchiveEnvelope = {
    version: INCIDENT_CASE_SCHEMA_VERSION,
    records: retained,
  };
  if (raw !== null && canonical(raw) !== canonical(retainedEnvelope)) {
    if (retained.length === 0) clearArchive();
    else persistSnapshots(retained);
  }

  return retained;
}

export function listIncidentCaseSnapshots(now = Date.now()): IncidentCaseSnapshot[] {
  return loadIncidentCaseSnapshots(now);
}

export function getIncidentCaseSnapshot(
  incidentId: string,
  now = Date.now(),
): IncidentCaseSnapshot | null {
  const normalized = normalizeIncidentId(incidentId);
  if (!normalized) return null;
  return loadIncidentCaseSnapshots(now).find(record => record.incidentId === normalized) ?? null;
}

export function archiveIncidentCase(
  input: IncidentCaseArchiveInput,
  now = Date.now(),
): ArchiveIncidentCaseResult {
  const settings = loadPrivacySettings();
  if (settings.publicDeviceMode) {
    clearArchive();
    return { status: 'skipped-public' };
  }

  const incident = normalizeIncidentSession(input.incident);
  const incidentId = normalizeIncidentId(incident.incidentId);
  const closedAt = finiteNumber(incident.endedAt);
  if (
    !incidentId
    || incident.active
    || incident.startedAt <= 0
    || closedAt === null
    || closedAt < incident.startedAt
  ) {
    throw new Error('종료된 출동만 사건 기록으로 보관할 수 있습니다.');
  }

  const activity = normalizeActivitySession(input.activity);
  if (activity.incidentId !== incidentId) {
    throw new Error('출동과 활동 기록의 incidentId가 일치하지 않습니다.');
  }

  const existing = getIncidentCaseSnapshot(incidentId, now);
  if (existing) return { status: 'existing', record: existing };

  const record = normalizeSnapshot({
    schemaVersion: INCIDENT_CASE_SCHEMA_VERSION,
    incidentId,
    snapshotAt: now,
    closedAt,
    incident,
    activity,
    triagePatients: input.triagePatients,
    timers: input.timers,
    stopwatch: input.stopwatch,
  });
  if (!record) {
    throw new Error('사건 기록 스냅샷을 정규화할 수 없습니다.');
  }

  const retained = loadIncidentCaseSnapshots(now);
  persistSnapshots([record, ...retained]);

  const verified = getIncidentCaseSnapshot(incidentId, now);
  if (!verified || canonical(verified) !== canonical(record)) {
    throw new Error('사건 기록 저장 후 읽기 검증에 실패했습니다.');
  }

  return { status: 'saved', record: verified };
}

export function removeIncidentCaseSnapshot(
  incidentId: string,
  now = Date.now(),
): boolean {
  const normalized = normalizeIncidentId(incidentId);
  if (!normalized) return false;

  const current = loadIncidentCaseSnapshots(now);
  const next = current.filter(record => record.incidentId !== normalized);
  if (next.length === current.length) return false;

  if (next.length === 0) clearArchive();
  else persistSnapshots(next);
  return true;
}
