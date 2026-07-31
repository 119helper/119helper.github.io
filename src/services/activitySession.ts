import { loadStoredJson, saveStoredJson } from './privacySettings';

export const ACTIVITY_SESSION_KEY = '119helper-activity-session';
export const ACTIVITY_SESSION_EVENT = '119helper-activity-updated';

export interface LoggedActivityStamp {
  stageId: string;
  label: string;
  time: number;
  lat: number | null;
  lon: number | null;
}

export interface ActivitySessionState {
  incidentId?: string;
  presetId: string;
  title: string;
  note: string;
  stamps: LoggedActivityStamp[];
}

export const EMPTY_ACTIVITY_SESSION: ActivitySessionState = {
  presetId: 'fire',
  title: '',
  note: '',
  stamps: [],
};

export function normalizeActivitySession(value: unknown): ActivitySessionState {
  if (!value || typeof value !== 'object') return EMPTY_ACTIVITY_SESSION;
  const item = value as Partial<ActivitySessionState>;
  return {
    incidentId: typeof item.incidentId === 'string' ? item.incidentId.trim().slice(0, 80) : undefined,
    presetId: typeof item.presetId === 'string' ? item.presetId : 'fire',
    title: typeof item.title === 'string' ? item.title : '',
    note: typeof item.note === 'string' ? item.note : '',
    stamps: Array.isArray(item.stamps) ? item.stamps.filter(stamp => stamp && typeof stamp.time === 'number') : [],
  };
}

export function loadActivitySession(): ActivitySessionState {
  return loadStoredJson(ACTIVITY_SESSION_KEY, EMPTY_ACTIVITY_SESSION, normalizeActivitySession);
}

export function saveActivitySession(session: ActivitySessionState): ActivitySessionState {
  const normalized = normalizeActivitySession(session);
  saveStoredJson(ACTIVITY_SESSION_KEY, normalized);
  window.dispatchEvent(new CustomEvent<ActivitySessionState>(ACTIVITY_SESSION_EVENT, { detail: normalized }));
  return normalized;
}

export function startActivityFromIncident(input: {
  incidentId?: string;
  type: 'fire' | 'ems' | 'rescue' | 'support';
  title: string;
  note?: string;
  startedAt: number;
  location?: { lat: number; lng: number };
}): ActivitySessionState {
  const session: ActivitySessionState = {
    incidentId: input.incidentId,
    presetId: input.type,
    title: input.title,
    note: input.note || '',
    stamps: [{
      stageId: 'dispatch',
      label: '출동',
      time: input.startedAt,
      lat: input.location?.lat ?? null,
      lon: input.location?.lng ?? null,
    }],
  };
  saveActivitySession(session);
  return session;
}

export interface ActivityStageRecordResult {
  session: ActivitySessionState;
  recorded: boolean;
}

export interface ActivityStageMutationResult {
  session: ActivitySessionState;
  changed: boolean;
}

export interface CloseActivitySessionInput {
  current: ActivitySessionState;
  incidentId: string;
  presetId: string;
  title: string;
  note: string;
  startedAt: number;
  endedAt: number;
  location?: { lat: number; lng: number };
}

export function buildClosedActivitySession(
  input: CloseActivitySessionInput,
): ActivitySessionState {
  const incidentId = input.incidentId.trim().slice(0, 80);
  if (
    !incidentId
    || !Number.isFinite(input.startedAt)
    || input.startedAt <= 0
    || !Number.isFinite(input.endedAt)
    || input.endedAt < input.startedAt
  ) {
    throw new Error('종료 활동 기록의 출동 식별자와 시각을 확인해 주세요.');
  }

  const normalizedCurrent = normalizeActivitySession(input.current);
  const belongsToIncident = normalizedCurrent.incidentId === incidentId;
  const base: ActivitySessionState = belongsToIncident
    ? normalizedCurrent
    : {
        incidentId,
        presetId: input.presetId,
        title: input.title,
        note: input.note,
        stamps: [],
      };
  const withoutPreviousClose = base.stamps.filter(stamp => (
    stamp.stageId !== 'incident-close'
    && !(
      stamp.label === '상황판 종료'
      && typeof stamp.stageId === 'string'
      && stamp.stageId.startsWith('auto-')
    )
  ));
  const withDispatch = withoutPreviousClose.some(stamp => stamp.stageId === 'dispatch')
    ? withoutPreviousClose
    : [{
        stageId: 'dispatch',
        label: '출동',
        time: input.startedAt,
        lat: input.location?.lat ?? null,
        lon: input.location?.lng ?? null,
      }, ...withoutPreviousClose];

  return normalizeActivitySession({
    ...base,
    incidentId,
    stamps: [
      ...withDispatch,
      {
        stageId: 'incident-close',
        label: '상황판 종료',
        time: input.endedAt,
        lat: null,
        lon: null,
      },
    ],
  });
}

export function recordActivityStage(
  stageId: string,
  label: string,
  time = Date.now(),
): ActivityStageRecordResult {
  const current = loadActivitySession();
  if (current.stamps.some(stamp => stamp.stageId === stageId)) {
    return { session: current, recorded: false };
  }

  const session = saveActivitySession({
    ...current,
    stamps: [
      ...current.stamps,
      { stageId, label, time, lat: null, lon: null },
    ],
  });
  return { session, recorded: true };
}

export function updateActivityStageTime(
  stageId: string,
  time: number,
  now = Date.now(),
): ActivityStageMutationResult {
  const current = loadActivitySession();
  if (!Number.isFinite(time) || time <= 0 || time > now) {
    return { session: current, changed: false };
  }
  if (!current.stamps.some(stamp => stamp.stageId === stageId)) {
    return { session: current, changed: false };
  }

  const session = saveActivitySession({
    ...current,
    stamps: current.stamps.map(stamp => stamp.stageId === stageId ? { ...stamp, time } : stamp),
  });
  return { session, changed: true };
}

export function removeActivityStage(stageId: string): ActivityStageMutationResult {
  const current = loadActivitySession();
  if (stageId === 'dispatch' || !current.stamps.some(stamp => stamp.stageId === stageId)) {
    return { session: current, changed: false };
  }

  const session = saveActivitySession({
    ...current,
    stamps: current.stamps.filter(stamp => stamp.stageId !== stageId),
  });
  return { session, changed: true };
}

export function appendActivityEvent(
  label: string,
  time = Date.now(),
  expectedIncidentId?: string,
): ActivitySessionState {
  const current = loadActivitySession();
  if (expectedIncidentId && current.incidentId !== expectedIncidentId) {
    return current;
  }
  const session = {
    ...current,
    stamps: [
      ...current.stamps,
      {
        stageId: `auto-${time}-${current.stamps.length}`,
        label,
        time,
        lat: null,
        lon: null,
      },
    ],
  };
  saveActivitySession(session);
  return session;
}
