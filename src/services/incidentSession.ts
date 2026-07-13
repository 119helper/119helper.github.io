import { loadStoredJson, saveStoredJson } from './privacySettings';

export const INCIDENT_SESSION_KEY = '119helper-incident-session';
export const INCIDENT_SESSION_EVENT = '119helper-incident-session-updated';

export type IncidentType = 'fire' | 'ems' | 'rescue' | 'support';

export interface IncidentSession {
  active: boolean;
  type: IncidentType;
  title: string;
  address: string;
  startedAt: number;
  endedAt?: number;
  note: string;
  snapshot?: {
    capturedAt: number;
    cityLabel: string;
    temperature: number | null;
    humidity: number | null;
    windSpeed: number | null;
    erHospitals: number;
    erBeds: number;
    hydrants: number;
    waterSources: number;
  };
}

export const EMPTY_INCIDENT_SESSION: IncidentSession = {
  active: false,
  type: 'fire',
  title: '',
  address: '',
  startedAt: 0,
  note: '',
};

function isIncidentType(value: unknown): value is IncidentType {
  return value === 'fire' || value === 'ems' || value === 'rescue' || value === 'support';
}

export function normalizeIncidentSession(value: unknown): IncidentSession {
  if (!value || typeof value !== 'object') return EMPTY_INCIDENT_SESSION;
  const session = value as Partial<IncidentSession>;
  const startedAt = Number(session.startedAt);
  const active = session.active === true && Number.isFinite(startedAt) && startedAt > 0;

  return {
    ...EMPTY_INCIDENT_SESSION,
    active,
    type: isIncidentType(session.type) ? session.type : 'fire',
    title: typeof session.title === 'string' ? session.title.slice(0, 120) : '',
    address: typeof session.address === 'string' ? session.address.slice(0, 200) : '',
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    endedAt: Number.isFinite(Number(session.endedAt)) ? Number(session.endedAt) : undefined,
    note: typeof session.note === 'string' ? session.note.slice(0, 1000) : '',
    snapshot: session.snapshot,
  };
}

export function loadIncidentSession(): IncidentSession {
  return loadStoredJson(INCIDENT_SESSION_KEY, EMPTY_INCIDENT_SESSION, normalizeIncidentSession);
}

export function saveIncidentSession(session: IncidentSession): void {
  const normalized = normalizeIncidentSession(session);
  saveStoredJson(INCIDENT_SESSION_KEY, normalized);
  window.dispatchEvent(new CustomEvent<IncidentSession>(INCIDENT_SESSION_EVENT, { detail: normalized }));
}
