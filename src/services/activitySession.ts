import { loadStoredJson, saveStoredJson } from './privacySettings';

export const ACTIVITY_SESSION_KEY = '119helper-activity-session';

export interface LoggedActivityStamp {
  stageId: string;
  label: string;
  time: number;
  lat: number | null;
  lon: number | null;
}

export interface ActivitySessionState {
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

function normalizeSession(value: unknown): ActivitySessionState {
  if (!value || typeof value !== 'object') return EMPTY_ACTIVITY_SESSION;
  const item = value as Partial<ActivitySessionState>;
  return {
    presetId: typeof item.presetId === 'string' ? item.presetId : 'fire',
    title: typeof item.title === 'string' ? item.title : '',
    note: typeof item.note === 'string' ? item.note : '',
    stamps: Array.isArray(item.stamps) ? item.stamps.filter(stamp => stamp && typeof stamp.time === 'number') : [],
  };
}

export function loadActivitySession(): ActivitySessionState {
  return loadStoredJson(ACTIVITY_SESSION_KEY, EMPTY_ACTIVITY_SESSION, normalizeSession);
}

function saveActivitySession(session: ActivitySessionState): void {
  saveStoredJson(ACTIVITY_SESSION_KEY, session);
  window.dispatchEvent(new CustomEvent('119helper-activity-updated', { detail: session }));
}

export function startActivityFromIncident(input: {
  type: 'fire' | 'ems' | 'rescue' | 'support';
  title: string;
  note?: string;
  startedAt: number;
}): ActivitySessionState {
  const presetId = input.type === 'ems' || input.type === 'rescue' ? input.type : 'fire';
  const session: ActivitySessionState = {
    presetId,
    title: input.title,
    note: input.note || '',
    stamps: [{ stageId: 'dispatch', label: '출동', time: input.startedAt, lat: null, lon: null }],
  };
  saveActivitySession(session);
  return session;
}

export function appendActivityEvent(label: string, time = Date.now()): ActivitySessionState {
  const current = loadActivitySession();
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
