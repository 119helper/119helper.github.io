import { loadStoredJson, saveStoredJson } from './privacySettings';

export const INCIDENT_SESSION_KEY = '119helper-incident-session';
export const INCIDENT_SESSION_EVENT = '119helper-incident-session-updated';

export type IncidentType = 'fire' | 'ems' | 'rescue' | 'support';

export type IncidentLocationSource = 'address' | 'gps';

export interface IncidentLocation {
  lat: number;
  lng: number;
  source: IncidentLocationSource;
  queryAddress?: string;
  resolvedAddress: string;
  regionName?: string;
  districtName?: string;
  legalDongCode?: string;
  resolvedAt: number;
  accuracyMeters?: number;
}

export interface IncidentSession {
  incidentId: string;
  active: boolean;
  type: IncidentType;
  title: string;
  address: string;
  location?: IncidentLocation;
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
  incidentId: '',
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

function optionalFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIncidentLocation(value: unknown): IncidentLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const location = value as Partial<IncidentLocation>;
  const lat = optionalFiniteNumber(location.lat);
  const lng = optionalFiniteNumber(location.lng);
  const resolvedAt = optionalFiniteNumber(location.resolvedAt);
  const accuracyMeters = optionalFiniteNumber(location.accuracyMeters);

  if (
    lat === null
    || lng === null
    || lat < -90
    || lat > 90
    || lng < -180
    || lng > 180
    || (location.source !== 'address' && location.source !== 'gps')
  ) {
    return undefined;
  }

  return {
    lat,
    lng,
    source: location.source,
    queryAddress: typeof location.queryAddress === 'string'
      ? location.queryAddress.trim().slice(0, 200)
      : undefined,
    resolvedAddress: typeof location.resolvedAddress === 'string'
      ? location.resolvedAddress.trim().slice(0, 200)
      : '',
    regionName: typeof location.regionName === 'string'
      ? location.regionName.trim().slice(0, 40)
      : undefined,
    districtName: typeof location.districtName === 'string'
      ? location.districtName.trim().slice(0, 60)
      : undefined,
    legalDongCode: typeof location.legalDongCode === 'string'
      ? location.legalDongCode.replace(/\D/g, '').slice(0, 10)
      : undefined,
    resolvedAt: resolvedAt !== null && resolvedAt > 0 ? resolvedAt : 0,
    accuracyMeters: accuracyMeters !== null && accuracyMeters >= 0
      ? accuracyMeters
      : undefined,
  };
}

export function normalizeIncidentSession(value: unknown): IncidentSession {
  if (!value || typeof value !== 'object') return EMPTY_INCIDENT_SESSION;
  const session = value as Partial<IncidentSession>;
  const startedAt = Number(session.startedAt);
  const active = session.active === true && Number.isFinite(startedAt) && startedAt > 0;

  return {
    ...EMPTY_INCIDENT_SESSION,
    incidentId: typeof session.incidentId === 'string' ? session.incidentId.trim().slice(0, 80) : '',
    active,
    type: isIncidentType(session.type) ? session.type : 'fire',
    title: typeof session.title === 'string' ? session.title.trim().slice(0, 120) : '',
    address: typeof session.address === 'string' ? session.address.trim().slice(0, 200) : '',
    location: normalizeIncidentLocation(session.location),
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
