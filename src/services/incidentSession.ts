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

export interface IncidentRoadSelection {
  readonly id: string;
  readonly selectedAt: number;
  readonly isActiveAtSelection: true;
  readonly eventLabel: string;
  readonly controlLabel?: string;
  readonly roadName?: string;
  readonly distanceKm?: number;
  readonly distanceLabel?: string;
  readonly status?: string;
  readonly sourceObservedAt: number;
}

export type IncidentFireWaterStatus = '정상' | '점검필요' | '고장' | '미확인';

export interface IncidentFireWaterSelection {
  readonly id: string;
  readonly selectedAt: number;
  readonly type: string;
  readonly address: string;
  readonly distanceKm?: number;
  readonly distanceLabel?: string;
  readonly status: IncidentFireWaterStatus;
  readonly sourceDate: string | null;
}

export interface IncidentHospitalSelection {
  readonly id: string;
  readonly selectedAt: number;
  readonly name: string;
  readonly address: string;
  readonly tel?: string;
  readonly distanceKm?: number;
  readonly distanceLabel?: string;
  readonly erBeds?: number;
  readonly wardBeds?: number;
  readonly sourceObservedAt: number;
}

export interface IncidentSelections {
  readonly road?: IncidentRoadSelection;
  readonly fireWater?: IncidentFireWaterSelection;
  readonly hospital?: IncidentHospitalSelection;
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
  selections?: IncidentSelections;
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

function requiredBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
}

function optionalBoundedText(value: unknown, maxLength: number): string | undefined {
  return requiredBoundedText(value, maxLength) ?? undefined;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  const normalized = optionalFiniteNumber(value);
  return normalized !== null && normalized >= 0 ? normalized : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const normalized = optionalNonNegativeNumber(value);
  return normalized !== undefined && Number.isSafeInteger(normalized)
    ? normalized
    : undefined;
}

function positiveTimestamp(value: unknown): number | null {
  const normalized = optionalFiniteNumber(value);
  return normalized !== null && normalized > 0 && Number.isSafeInteger(normalized)
    ? normalized
    : null;
}

function normalizedSourceDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  const normalized = optionalBoundedText(value, 40);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized)) return undefined;
  return Number.isFinite(Date.parse(normalized)) ? normalized : undefined;
}

function selectionTimestamp(
  value: unknown,
  startedAt: number,
  endedAt: number | undefined,
): number | null {
  const selectedAt = positiveTimestamp(value);
  const upperBound = endedAt ?? Date.now() + 5 * 60 * 1000;
  return selectedAt !== null && selectedAt >= startedAt && selectedAt <= upperBound
    ? selectedAt
    : null;
}

function observedTimestamp(value: unknown, selectedAt: number): number | null {
  const observedAt = positiveTimestamp(value);
  return observedAt !== null && observedAt <= selectedAt ? observedAt : null;
}

function normalizeRoadSelection(
  value: unknown,
  startedAt: number,
  endedAt: number | undefined,
): IncidentRoadSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const selection = value as Partial<IncidentRoadSelection>;
  const id = requiredBoundedText(selection.id, 160);
  const selectedAt = selectionTimestamp(selection.selectedAt, startedAt, endedAt);
  const eventLabel = requiredBoundedText(selection.eventLabel, 100);
  const sourceObservedAt = selectedAt === null
    ? null
    : observedTimestamp(selection.sourceObservedAt, selectedAt);
  if (
    !id
    || selectedAt === null
    || selection.isActiveAtSelection !== true
    || !eventLabel
    || sourceObservedAt === null
  ) return undefined;

  return {
    id,
    selectedAt,
    isActiveAtSelection: true,
    eventLabel,
    controlLabel: optionalBoundedText(selection.controlLabel, 100),
    roadName: optionalBoundedText(selection.roadName, 160),
    distanceKm: optionalNonNegativeNumber(selection.distanceKm),
    distanceLabel: optionalBoundedText(selection.distanceLabel, 40),
    status: optionalBoundedText(selection.status, 80),
    sourceObservedAt,
  };
}

function normalizeFireWaterSelection(
  value: unknown,
  startedAt: number,
  endedAt: number | undefined,
): IncidentFireWaterSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const selection = value as Partial<IncidentFireWaterSelection>;
  const id = requiredBoundedText(selection.id, 160);
  const selectedAt = selectionTimestamp(selection.selectedAt, startedAt, endedAt);
  const type = requiredBoundedText(selection.type, 80);
  const address = requiredBoundedText(selection.address, 240);
  const statuses = new Set<IncidentFireWaterStatus>(['정상', '점검필요', '고장', '미확인']);
  const rawStatus = optionalBoundedText(selection.status, 20);
  const status = statuses.has(rawStatus as IncidentFireWaterStatus)
    ? rawStatus as IncidentFireWaterStatus
    : null;
  const sourceDate = normalizedSourceDate(selection.sourceDate);
  if (
    !id
    || selectedAt === null
    || !type
    || !address
    || !status
    || sourceDate === undefined
  ) return undefined;

  return {
    id,
    selectedAt,
    type,
    address,
    distanceKm: optionalNonNegativeNumber(selection.distanceKm),
    distanceLabel: optionalBoundedText(selection.distanceLabel, 40),
    status,
    sourceDate,
  };
}

function normalizeHospitalSelection(
  value: unknown,
  startedAt: number,
  endedAt: number | undefined,
): IncidentHospitalSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const selection = value as Partial<IncidentHospitalSelection>;
  const id = requiredBoundedText(selection.id, 160);
  const selectedAt = selectionTimestamp(selection.selectedAt, startedAt, endedAt);
  const name = requiredBoundedText(selection.name, 160);
  const address = requiredBoundedText(selection.address, 240);
  const sourceObservedAt = selectedAt === null
    ? null
    : observedTimestamp(selection.sourceObservedAt, selectedAt);
  if (!id || selectedAt === null || !name || !address || sourceObservedAt === null) return undefined;

  return {
    id,
    selectedAt,
    name,
    address,
    tel: optionalBoundedText(selection.tel, 40),
    distanceKm: optionalNonNegativeNumber(selection.distanceKm),
    distanceLabel: optionalBoundedText(selection.distanceLabel, 40),
    erBeds: optionalNonNegativeInteger(selection.erBeds),
    wardBeds: optionalNonNegativeInteger(selection.wardBeds),
    sourceObservedAt,
  };
}

function normalizeIncidentSelections(
  value: unknown,
  incidentId: string,
  startedAt: number,
  endedAt: number | undefined,
): IncidentSelections | undefined {
  if (!incidentId || startedAt <= 0 || !value || typeof value !== 'object') return undefined;
  const selections = value as Partial<IncidentSelections>;
  const road = normalizeRoadSelection(selections.road, startedAt, endedAt);
  const fireWater = normalizeFireWaterSelection(selections.fireWater, startedAt, endedAt);
  const hospital = normalizeHospitalSelection(selections.hospital, startedAt, endedAt);
  if (!road && !fireWater && !hospital) return undefined;
  return { road, fireWater, hospital };
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
  const normalizedStartedAt = Number.isFinite(startedAt) ? startedAt : 0;
  const endedAt = Number.isFinite(Number(session.endedAt)) ? Number(session.endedAt) : undefined;
  const incidentId = typeof session.incidentId === 'string'
    ? session.incidentId.trim().slice(0, 80)
    : '';
  const active = session.active === true && Number.isFinite(startedAt) && startedAt > 0;

  return {
    ...EMPTY_INCIDENT_SESSION,
    incidentId,
    active,
    type: isIncidentType(session.type) ? session.type : 'fire',
    title: typeof session.title === 'string' ? session.title.trim().slice(0, 120) : '',
    address: typeof session.address === 'string' ? session.address.trim().slice(0, 200) : '',
    location: normalizeIncidentLocation(session.location),
    startedAt: normalizedStartedAt,
    endedAt,
    note: typeof session.note === 'string' ? session.note.slice(0, 1000) : '',
    selections: normalizeIncidentSelections(
      session.selections,
      incidentId,
      normalizedStartedAt,
      endedAt,
    ),
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
