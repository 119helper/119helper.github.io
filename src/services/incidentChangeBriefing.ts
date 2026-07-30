export type IncidentChangeDatasetState = 'ready' | 'loading' | 'error' | 'unavailable';
export type IncidentChangeSeverity = 'warning' | 'critical';
export type IncidentChangeKind = 'road' | 'er' | 'weather';
export type IncidentChangeType =
  | 'road-control-activated'
  | 'road-control-escalated'
  | 'er-candidate-dropped'
  | 'er-beds-dropped'
  | 'wind-speed-escalated'
  | 'wind-direction-shifted';

export interface IncidentChangeSourceInput {
  provider: string;
  retrievedAt?: string | number | null;
  staleAt?: number | null;
}

export interface IncidentChangeCollection<T> {
  state: IncidentChangeDatasetState;
  items: readonly T[];
  source: IncidentChangeSourceInput;
}

export interface IncidentChangeValue<T> {
  state: IncidentChangeDatasetState;
  value: T | null;
  source: IncidentChangeSourceInput;
}

export interface RoadControlChangeInput {
  eventId?: string | null;
  eventType?: string | null;
  eventTypeCode?: string | null;
  eventLabel?: string | null;
  roadNames?: readonly string[] | null;
  facilityName?: string | null;
  controlType?: string | null;
  controlLabel?: string | null;
  controlRank?: number | null;
  severityRank?: number | null;
  isActive?: boolean | null;
  distanceKm?: number | null;
  nearestCoordinate?: {
    lat?: number | string | null;
    lng?: number | string | null;
  } | null;
}

export interface ErCandidateChangeInput {
  id?: string | null;
  hpid?: string | null;
  phpid?: string | null;
  name?: string | null;
  dutyName?: string | null;
  address?: string | null;
  dutyAddr?: string | null;
  erBeds?: number | string | null;
  hvec?: number | string | null;
  distanceKm?: number | null;
  eligible?: boolean | null;
}

export interface WeatherChangeInput {
  windSpeed?: number | string | null;
  windDirectionDegree?: number | string | null;
  windDirection?: string | null;
}

export interface IncidentOperationalSnapshot {
  incidentId: string;
  observedAt: number;
  roads?: IncidentChangeCollection<RoadControlChangeInput>;
  er?: IncidentChangeCollection<ErCandidateChangeInput>;
  weather?: IncidentChangeValue<WeatherChangeInput>;
}

export interface IncidentChangeOptions {
  minimumRoadControlRank?: number;
  erBedDropAbsolute?: number;
  erBedRemainingRatio?: number;
  criticalBedRemainingRatio?: number;
  windWarningMps?: number;
  windCriticalMps?: number;
  suddenWindIncreaseMps?: number;
  directionShiftDegrees?: number;
  directionShiftMinWindMps?: number;
}

export type IncidentChangeFactValue = string | number | boolean | null;
export type IncidentChangeFacts = Record<string, IncidentChangeFactValue>;

export interface IncidentChangePoint {
  observedAt: number;
  values: IncidentChangeFacts;
}

export interface IncidentChangeSourceMetadata {
  dataset: IncidentChangeKind;
  previous: {
    provider: string;
    retrievedAt: string | number | null;
    staleAt: number | null;
  };
  current: {
    provider: string;
    retrievedAt: string | number | null;
    staleAt: number | null;
  };
}

export interface IncidentDetectedChange {
  dedupeKey: string;
  kind: IncidentChangeKind;
  type: IncidentChangeType;
  severity: IncidentChangeSeverity;
  title: string;
  message: string;
  detectedAt: number;
  before: IncidentChangePoint;
  after: IncidentChangePoint;
  source: IncidentChangeSourceMetadata;
}

interface NormalizedOptions {
  minimumRoadControlRank: number;
  erBedDropAbsolute: number;
  erBedRemainingRatio: number;
  criticalBedRemainingRatio: number;
  windWarningMps: number;
  windCriticalMps: number;
  suddenWindIncreaseMps: number;
  directionShiftDegrees: number;
  directionShiftMinWindMps: number;
}

interface NormalizedRoad {
  identity: string;
  eventId: string | null;
  eventLabel: string;
  roadName: string | null;
  controlType: string;
  controlLabel: string;
  controlRank: number;
  severityRank: number;
  active: boolean;
  distanceKm: number | null;
}

interface NormalizedErCandidate {
  identity: string;
  hospitalId: string | null;
  name: string;
  address: string | null;
  erBeds: number | null;
  distanceKm: number | null;
}

interface NormalizedWeather {
  windSpeedMps: number | null;
  windDirectionDegree: number | null;
  windDirectionLabel: string | null;
}

const DEFAULT_OPTIONS: NormalizedOptions = {
  minimumRoadControlRank: 2,
  erBedDropAbsolute: 3,
  erBedRemainingRatio: 0.5,
  criticalBedRemainingRatio: 0.25,
  windWarningMps: 7,
  windCriticalMps: 10,
  suddenWindIncreaseMps: 3,
  directionShiftDegrees: 45,
  directionShiftMinWindMps: 4,
};

const CONTROL_RANKS: Readonly<Record<string, number>> = {
  none: 0,
  unknown: 1,
  partial: 2,
  'lane-partial': 3,
  contraflow: 4,
  detour: 5,
  full: 6,
};

const CONTROL_LABELS: Readonly<Record<string, string>> = {
  none: '통제 없음',
  unknown: '통제 미상',
  partial: '부분 통제',
  'lane-partial': '차로 부분 통제',
  contraflow: '대항차로 운영',
  detour: '우회',
  full: '전면 통제',
};

const EVENT_LABELS: Readonly<Record<string, string>> = {
  'underpass-flooding': '지하차도 침수',
  'river-flood': '하천 범람',
  sinkhole: '땅꺼짐',
  fire: '화재',
  unknown: '도로 재난',
};

const COMPASS_LABELS = [
  '북',
  '북북동',
  '북동',
  '동북동',
  '동',
  '동남동',
  '남동',
  '남남동',
  '남',
  '남남서',
  '남서',
  '서남서',
  '서',
  '서북서',
  '북서',
  '북북서',
] as const;

const COMPASS_DEGREES: Readonly<Record<string, number>> = {
  북: 0,
  북북동: 22.5,
  북동: 45,
  동북동: 67.5,
  동: 90,
  동남동: 112.5,
  남동: 135,
  남남동: 157.5,
  남: 180,
  남남서: 202.5,
  남서: 225,
  서남서: 247.5,
  서: 270,
  서북서: 292.5,
  북서: 315,
  북북서: 337.5,
  n: 0,
  nne: 22.5,
  ne: 45,
  ene: 67.5,
  e: 90,
  ese: 112.5,
  se: 135,
  sse: 157.5,
  s: 180,
  ssw: 202.5,
  sw: 225,
  wsw: 247.5,
  w: 270,
  wnw: 292.5,
  nw: 315,
  nnw: 337.5,
};

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return normalized === '' ? null : normalized;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.max(0, parsed);
}

function normalizeObservedAt(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : 0;
}

function normalizeOptions(options: IncidentChangeOptions): NormalizedOptions {
  const positive = (value: unknown, fallback: number): number => {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : fallback;
  };
  const ratio = (value: unknown, fallback: number): number => {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : fallback;
  };

  const windWarningMps = positive(options.windWarningMps, DEFAULT_OPTIONS.windWarningMps);
  const windCriticalMps = Math.max(
    windWarningMps,
    positive(options.windCriticalMps, DEFAULT_OPTIONS.windCriticalMps),
  );

  return {
    minimumRoadControlRank: positive(
      options.minimumRoadControlRank,
      DEFAULT_OPTIONS.minimumRoadControlRank,
    ),
    erBedDropAbsolute: positive(options.erBedDropAbsolute, DEFAULT_OPTIONS.erBedDropAbsolute),
    erBedRemainingRatio: ratio(
      options.erBedRemainingRatio,
      DEFAULT_OPTIONS.erBedRemainingRatio,
    ),
    criticalBedRemainingRatio: ratio(
      options.criticalBedRemainingRatio,
      DEFAULT_OPTIONS.criticalBedRemainingRatio,
    ),
    windWarningMps,
    windCriticalMps,
    suddenWindIncreaseMps: positive(
      options.suddenWindIncreaseMps,
      DEFAULT_OPTIONS.suddenWindIncreaseMps,
    ),
    directionShiftDegrees: positive(
      options.directionShiftDegrees,
      DEFAULT_OPTIONS.directionShiftDegrees,
    ),
    directionShiftMinWindMps: positive(
      options.directionShiftMinWindMps,
      DEFAULT_OPTIONS.directionShiftMinWindMps,
    ),
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableToken(value: string): string {
  const normalized = normalizedText(value)?.toLowerCase() ?? '';
  if (/^[a-z0-9._-]{1,80}$/.test(normalized)) return normalized;
  return `h${fnv1a(normalized)}`;
}

function canonicalStringList(value: readonly string[] | null | undefined): string[] {
  return [...new Set(
    (value ?? [])
      .map(normalizedText)
      .filter((item): item is string => item !== null),
  )].sort((left, right) => left.localeCompare(right, 'ko-KR'));
}

function roundedCoordinate(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const coordinate = value as { lat?: unknown; lng?: unknown };
  const lat = finiteNumber(coordinate.lat);
  const lng = finiteNumber(coordinate.lng);
  if (lat === null || lng === null) return '';
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function normalizedControlType(value: unknown): string {
  const normalized = normalizedText(value)?.toLowerCase();
  return normalized && normalized in CONTROL_RANKS ? normalized : 'unknown';
}

function roadIdentity(item: RoadControlChangeInput): {
  identity: string;
  eventId: string | null;
} {
  const eventId = normalizedText(item.eventId);
  if (eventId) return { identity: stableToken(eventId), eventId };

  const canonical = [
    normalizedText(item.eventTypeCode)?.toUpperCase() ?? '',
    normalizedText(item.eventType)?.toLowerCase() ?? '',
    canonicalStringList(item.roadNames).join('|'),
    normalizedText(item.facilityName) ?? '',
    roundedCoordinate(item.nearestCoordinate),
  ].join('::');
  return { identity: `fallback-${fnv1a(canonical)}`, eventId: null };
}

function normalizeRoad(item: RoadControlChangeInput): NormalizedRoad {
  const { identity, eventId } = roadIdentity(item);
  const eventType = normalizedText(item.eventType)?.toLowerCase() ?? 'unknown';
  const eventLabel =
    normalizedText(item.eventLabel)
    ?? EVENT_LABELS[eventType]
    ?? '도로 재난';
  const controlType = normalizedControlType(item.controlType);
  const suppliedControlRank = nonNegativeNumber(item.controlRank);
  const controlRank = suppliedControlRank ?? CONTROL_RANKS[controlType] ?? 1;
  const controlLabel =
    normalizedText(item.controlLabel)
    ?? CONTROL_LABELS[controlType]
    ?? '통제 미상';

  return {
    identity,
    eventId,
    eventLabel,
    roadName:
      canonicalStringList(item.roadNames)[0]
      ?? normalizedText(item.facilityName),
    controlType,
    controlLabel,
    controlRank,
    severityRank: nonNegativeNumber(item.severityRank) ?? 0,
    active: item.isActive === true,
    distanceKm: nonNegativeNumber(item.distanceKm),
  };
}

function roadPriority(item: NormalizedRoad): string {
  const distance = item.distanceKm === null ? Number.MAX_SAFE_INTEGER : item.distanceKm;
  return [
    item.active ? '1' : '0',
    item.controlRank.toString().padStart(4, '0'),
    item.severityRank.toString().padStart(4, '0'),
    (Number.MAX_SAFE_INTEGER - Math.round(distance * 1000)).toString().padStart(16, '0'),
    item.eventLabel,
  ].join('|');
}

function roadMap(items: readonly RoadControlChangeInput[]): Map<string, NormalizedRoad> {
  const result = new Map<string, NormalizedRoad>();
  for (const raw of items) {
    const item = normalizeRoad(raw);
    const existing = result.get(item.identity);
    if (!existing || roadPriority(item) > roadPriority(existing)) {
      result.set(item.identity, item);
    }
  }
  return result;
}

function hospitalIdentity(item: ErCandidateChangeInput): {
  identity: string;
  hospitalId: string | null;
} {
  const hospitalId =
    normalizedText(item.id)
    ?? normalizedText(item.hpid)
    ?? normalizedText(item.phpid);
  if (hospitalId) return { identity: stableToken(hospitalId), hospitalId };

  const canonical = [
    normalizedText(item.name) ?? normalizedText(item.dutyName) ?? '',
    normalizedText(item.address) ?? normalizedText(item.dutyAddr) ?? '',
  ].join('::');
  return { identity: `fallback-${fnv1a(canonical)}`, hospitalId: null };
}

function normalizeErCandidate(item: ErCandidateChangeInput): NormalizedErCandidate {
  const { identity, hospitalId } = hospitalIdentity(item);
  return {
    identity,
    hospitalId,
    name: normalizedText(item.name) ?? normalizedText(item.dutyName) ?? '이름 미상 병원',
    address: normalizedText(item.address) ?? normalizedText(item.dutyAddr),
    erBeds: nonNegativeNumber(item.erBeds ?? item.hvec),
    distanceKm: nonNegativeNumber(item.distanceKm),
  };
}

function erCandidatePriority(item: NormalizedErCandidate): string {
  const beds = item.erBeds ?? -1;
  const distance = item.distanceKm ?? Number.MAX_SAFE_INTEGER;
  return [
    beds.toString().padStart(8, '0'),
    (Number.MAX_SAFE_INTEGER - Math.round(distance * 1000)).toString().padStart(16, '0'),
    item.name,
  ].join('|');
}

function erCandidateMap(items: readonly ErCandidateChangeInput[]): Map<string, NormalizedErCandidate> {
  const result = new Map<string, NormalizedErCandidate>();
  for (const raw of items) {
    if (raw.eligible === false) continue;
    const item = normalizeErCandidate(raw);
    const existing = result.get(item.identity);
    if (!existing || erCandidatePriority(item) > erCandidatePriority(existing)) {
      result.set(item.identity, item);
    }
  }
  return result;
}

function normalizeDirection(value: unknown): number | null {
  const numeric = finiteNumber(value);
  if (numeric !== null) return ((numeric % 360) + 360) % 360;
  const text = normalizedText(value)?.toLowerCase().replace(/풍$/, '');
  return text && text in COMPASS_DEGREES ? COMPASS_DEGREES[text] : null;
}

function directionLabel(degrees: number | null): string | null {
  if (degrees === null) return null;
  return COMPASS_LABELS[Math.round(degrees / 22.5) % COMPASS_LABELS.length];
}

function normalizeWeather(value: WeatherChangeInput | null): NormalizedWeather | null {
  if (!value) return null;
  const windDirectionDegree =
    normalizeDirection(value.windDirectionDegree)
    ?? normalizeDirection(value.windDirection);
  return {
    windSpeedMps: nonNegativeNumber(value.windSpeed),
    windDirectionDegree,
    windDirectionLabel: directionLabel(windDirectionDegree),
  };
}

function normalizeSource(source: IncidentChangeSourceInput): {
  provider: string;
  retrievedAt: string | number | null;
  staleAt: number | null;
} {
  return {
    provider: normalizedText(source.provider) ?? '출처 미상',
    retrievedAt:
      typeof source.retrievedAt === 'string' || typeof source.retrievedAt === 'number'
        ? source.retrievedAt
        : null,
    staleAt: nonNegativeNumber(source.staleAt),
  };
}

function sourceMetadata(
  dataset: IncidentChangeKind,
  previous: IncidentChangeSourceInput,
  current: IncidentChangeSourceInput,
): IncidentChangeSourceMetadata {
  return {
    dataset,
    previous: normalizeSource(previous),
    current: normalizeSource(current),
  };
}

function changePoint(observedAt: number, values: IncidentChangeFacts): IncidentChangePoint {
  return { observedAt: normalizeObservedAt(observedAt), values };
}

function roadFacts(item: NormalizedRoad | undefined): IncidentChangeFacts {
  return {
    present: Boolean(item),
    eventId: item?.eventId ?? null,
    eventLabel: item?.eventLabel ?? null,
    roadName: item?.roadName ?? null,
    active: item?.active ?? false,
    controlType: item?.controlType ?? null,
    controlLabel: item?.controlLabel ?? null,
    controlRank: item?.controlRank ?? null,
    severityRank: item?.severityRank ?? null,
    distanceKm: item?.distanceKm ?? null,
  };
}

function erFacts(item: NormalizedErCandidate | undefined, present: boolean): IncidentChangeFacts {
  return {
    present,
    hospitalId: item?.hospitalId ?? null,
    name: item?.name ?? null,
    address: item?.address ?? null,
    erBeds: item?.erBeds ?? null,
    distanceKm: item?.distanceKm ?? null,
  };
}

function weatherRiskLevel(speed: number, options: NormalizedOptions): 0 | 1 | 2 {
  if (speed >= options.windCriticalMps) return 2;
  if (speed >= options.windWarningMps) return 1;
  return 0;
}

function weatherRiskLabel(level: 0 | 1 | 2): string {
  if (level === 2) return '위험';
  if (level === 1) return '주의';
  return '관찰';
}

function weatherFacts(
  weather: NormalizedWeather,
  options: NormalizedOptions,
): IncidentChangeFacts {
  const speed = weather.windSpeedMps;
  return {
    windSpeedMps: speed,
    windDirectionDegree: weather.windDirectionDegree,
    windDirectionLabel: weather.windDirectionLabel,
    windRiskLevel: speed === null ? null : weatherRiskLabel(weatherRiskLevel(speed, options)),
  };
}

function directionDelta(from: number, to: number): number {
  const difference = Math.abs(from - to) % 360;
  return Math.min(difference, 360 - difference);
}

function formatWindSpeed(value: number): string {
  return `${value.toFixed(1)}m/s`;
}

function severityOrder(value: IncidentChangeSeverity): number {
  return value === 'critical' ? 2 : 1;
}

function kindOrder(value: IncidentChangeKind): number {
  if (value === 'road') return 0;
  if (value === 'er') return 1;
  return 2;
}

function detectRoadChanges(
  incidentPrefix: string,
  previousSnapshot: IncidentOperationalSnapshot,
  currentSnapshot: IncidentOperationalSnapshot,
  options: NormalizedOptions,
): IncidentDetectedChange[] {
  const previous = previousSnapshot.roads;
  const current = currentSnapshot.roads;
  if (!previous || !current || previous.state !== 'ready' || current.state !== 'ready') return [];

  const previousItems = roadMap(previous.items);
  const currentItems = [...roadMap(current.items).values()]
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const changes: IncidentDetectedChange[] = [];

  for (const afterItem of currentItems) {
    const beforeItem = previousItems.get(afterItem.identity);
    const beforeActionable = Boolean(
      beforeItem?.active
      && beforeItem.controlRank >= options.minimumRoadControlRank,
    );
    const afterActionable =
      afterItem.active
      && afterItem.controlRank >= options.minimumRoadControlRank;
    if (!afterActionable) continue;

    const severity: IncidentChangeSeverity =
      afterItem.controlRank >= 5 || afterItem.severityRank >= 4
        ? 'critical'
        : 'warning';
    const location = afterItem.roadName ? ` ${afterItem.roadName}` : '';

    if (!beforeActionable) {
      changes.push({
        dedupeKey: `${incidentPrefix}:road:${afterItem.identity}:activated`,
        kind: 'road',
        type: 'road-control-activated',
        severity,
        title: '새 도로 재난·통제',
        message:
          `${afterItem.eventLabel}${location}에 ${afterItem.controlLabel}가 새로 확인되었습니다.`
          + ' 진입 경로와 현장 지령을 다시 확인하세요.',
        detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
        before: changePoint(previousSnapshot.observedAt, roadFacts(beforeItem)),
        after: changePoint(currentSnapshot.observedAt, roadFacts(afterItem)),
        source: sourceMetadata('road', previous.source, current.source),
      });
      continue;
    }

    if (beforeItem && afterItem.controlRank > beforeItem.controlRank) {
      changes.push({
        dedupeKey:
          `${incidentPrefix}:road:${afterItem.identity}:control`
          + `:${beforeItem.controlRank}-${afterItem.controlRank}`,
        kind: 'road',
        type: 'road-control-escalated',
        severity,
        title: '도로 통제 강화',
        message:
          `${afterItem.eventLabel}${location}의 통제가 `
          + `${beforeItem.controlLabel}에서 ${afterItem.controlLabel}(으)로 강화되었습니다.`
          + ' 진입 경로를 다시 확인하세요.',
        detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
        before: changePoint(previousSnapshot.observedAt, roadFacts(beforeItem)),
        after: changePoint(currentSnapshot.observedAt, roadFacts(afterItem)),
        source: sourceMetadata('road', previous.source, current.source),
      });
    }
  }

  return changes;
}

function detectErChanges(
  incidentPrefix: string,
  previousSnapshot: IncidentOperationalSnapshot,
  currentSnapshot: IncidentOperationalSnapshot,
  options: NormalizedOptions,
): IncidentDetectedChange[] {
  const previous = previousSnapshot.er;
  const current = currentSnapshot.er;
  if (!previous || !current || previous.state !== 'ready' || current.state !== 'ready') return [];

  const previousItems = erCandidateMap(previous.items);
  const currentItems = erCandidateMap(current.items);
  const changes: IncidentDetectedChange[] = [];

  for (const beforeItem of [...previousItems.values()]
    .sort((left, right) => left.identity.localeCompare(right.identity))) {
    const afterItem = currentItems.get(beforeItem.identity);
    if (!afterItem) {
      changes.push({
        dedupeKey: `${incidentPrefix}:er:${beforeItem.identity}:candidate-dropped`,
        kind: 'er',
        type: 'er-candidate-dropped',
        severity: 'warning',
        title: '이송 후보 이탈',
        message:
          `이송 후보에서 ${beforeItem.name}이 제외되었습니다.`
          + ' 현재 수용 여부를 해당 기관에 전화로 다시 확인하세요.',
        detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
        before: changePoint(
          previousSnapshot.observedAt,
          erFacts(beforeItem, true),
        ),
        after: changePoint(
          currentSnapshot.observedAt,
          erFacts(beforeItem, false),
        ),
        source: sourceMetadata('er', previous.source, current.source),
      });
      continue;
    }

    if (beforeItem.erBeds === null || afterItem.erBeds === null) continue;
    if (afterItem.erBeds >= beforeItem.erBeds || beforeItem.erBeds <= 0) continue;
    const decline = beforeItem.erBeds - afterItem.erBeds;
    const remainingRatio = afterItem.erBeds / beforeItem.erBeds;
    const sharpDrop =
      afterItem.erBeds === 0
      || (
        decline >= options.erBedDropAbsolute
        && remainingRatio <= options.erBedRemainingRatio
      );
    if (!sharpDrop) continue;

    changes.push({
      dedupeKey:
        `${incidentPrefix}:er:${beforeItem.identity}:beds`
        + `:${beforeItem.erBeds}-${afterItem.erBeds}`,
      kind: 'er',
      type: 'er-beds-dropped',
      severity:
        afterItem.erBeds === 0 || remainingRatio <= options.criticalBedRemainingRatio
          ? 'critical'
          : 'warning',
      title: '응급실 가용병상 급감',
      message:
        `${afterItem.name}의 응급실 가용 병상이 `
        + `${beforeItem.erBeds}병상에서 ${afterItem.erBeds}병상으로 급감했습니다.`
        + ' 실제 수용 가능 여부를 전화로 다시 확인하세요.',
      detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
      before: changePoint(previousSnapshot.observedAt, erFacts(beforeItem, true)),
      after: changePoint(currentSnapshot.observedAt, erFacts(afterItem, true)),
      source: sourceMetadata('er', previous.source, current.source),
    });
  }

  return changes;
}

function detectWeatherChanges(
  incidentPrefix: string,
  previousSnapshot: IncidentOperationalSnapshot,
  currentSnapshot: IncidentOperationalSnapshot,
  options: NormalizedOptions,
): IncidentDetectedChange[] {
  const previous = previousSnapshot.weather;
  const current = currentSnapshot.weather;
  if (!previous || !current || previous.state !== 'ready' || current.state !== 'ready') return [];
  const beforeWeather = normalizeWeather(previous.value);
  const afterWeather = normalizeWeather(current.value);
  if (!beforeWeather || !afterWeather) return [];

  const changes: IncidentDetectedChange[] = [];
  const beforeSpeed = beforeWeather.windSpeedMps;
  const afterSpeed = afterWeather.windSpeedMps;

  if (beforeSpeed !== null && afterSpeed !== null && afterSpeed > beforeSpeed) {
    const beforeLevel = weatherRiskLevel(beforeSpeed, options);
    const afterLevel = weatherRiskLevel(afterSpeed, options);
    const levelEscalated = afterLevel > beforeLevel;
    const suddenIncrease =
      !levelEscalated
      && afterSpeed - beforeSpeed >= options.suddenWindIncreaseMps
      && afterSpeed >= options.directionShiftMinWindMps;

    if (levelEscalated || suddenIncrease) {
      const transitionKey = levelEscalated
        ? `level:${beforeLevel}-${afterLevel}`
        : 'surge';
      const transitionText = levelEscalated
        ? `${weatherRiskLabel(beforeLevel)}에서 ${weatherRiskLabel(afterLevel)} 단계로 상승`
        : '짧은 주기 안에 급상승';
      changes.push({
        dedupeKey: `${incidentPrefix}:weather:wind-speed:${transitionKey}`,
        kind: 'weather',
        type: 'wind-speed-escalated',
        severity: afterLevel >= 2 ? 'critical' : 'warning',
        title: '풍속 위험 변화',
        message:
          `풍속이 ${formatWindSpeed(beforeSpeed)}에서 ${formatWindSpeed(afterSpeed)}로 올라 `
          + `${transitionText}했습니다. 연기·비산·항공 운용 조건을 다시 확인하세요.`,
        detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
        before: changePoint(
          previousSnapshot.observedAt,
          weatherFacts(beforeWeather, options),
        ),
        after: changePoint(
          currentSnapshot.observedAt,
          weatherFacts(afterWeather, options),
        ),
        source: sourceMetadata('weather', previous.source, current.source),
      });
    }
  }

  const beforeDirection = beforeWeather.windDirectionDegree;
  const afterDirection = afterWeather.windDirectionDegree;
  if (
    beforeDirection !== null
    && afterDirection !== null
    && afterSpeed !== null
    && afterSpeed >= options.directionShiftMinWindMps
  ) {
    const shift = directionDelta(beforeDirection, afterDirection);
    if (shift >= options.directionShiftDegrees) {
      const beforeSector = Math.round(beforeDirection / 22.5) % COMPASS_LABELS.length;
      const afterSector = Math.round(afterDirection / 22.5) % COMPASS_LABELS.length;
      changes.push({
        dedupeKey:
          `${incidentPrefix}:weather:wind-direction`
          + `:${beforeSector}-${afterSector}`,
        kind: 'weather',
        type: 'wind-direction-shifted',
        severity:
          afterSpeed >= options.windCriticalMps
            ? 'critical'
            : 'warning',
        title: '풍향 급변',
        message:
          `풍향이 ${beforeWeather.windDirectionLabel ?? `${Math.round(beforeDirection)}°`}에서 `
          + `${afterWeather.windDirectionLabel ?? `${Math.round(afterDirection)}°`} 방향으로 `
          + `약 ${Math.round(shift)}° 바뀌었습니다. 현재 풍속은 ${formatWindSpeed(afterSpeed)}입니다.`
          + ' 연기와 비산 위험 방향을 다시 확인하세요.',
        detectedAt: normalizeObservedAt(currentSnapshot.observedAt),
        before: changePoint(
          previousSnapshot.observedAt,
          weatherFacts(beforeWeather, options),
        ),
        after: changePoint(
          currentSnapshot.observedAt,
          weatherFacts(afterWeather, options),
        ),
        source: sourceMetadata('weather', previous.source, current.source),
      });
    }
  }

  return changes;
}

/**
 * 같은 출동의 두 성공 스냅샷만 비교한다.
 * 최초 조회, 출동 전환, loading/error/unavailable 데이터는 기준선 또는 미확인 상태로 보고
 * 변화 경보를 만들지 않는다.
 */
export function detectIncidentChanges(
  previousSnapshot: IncidentOperationalSnapshot | null | undefined,
  currentSnapshot: IncidentOperationalSnapshot,
  options: IncidentChangeOptions = {},
): IncidentDetectedChange[] {
  if (!previousSnapshot) return [];
  const previousIncidentId = normalizedText(previousSnapshot.incidentId);
  const currentIncidentId = normalizedText(currentSnapshot.incidentId);
  if (!previousIncidentId || !currentIncidentId || previousIncidentId !== currentIncidentId) {
    return [];
  }

  const normalized = normalizeOptions(options);
  const incidentPrefix = `incident:${stableToken(currentIncidentId)}`;
  return [
    ...detectRoadChanges(incidentPrefix, previousSnapshot, currentSnapshot, normalized),
    ...detectErChanges(incidentPrefix, previousSnapshot, currentSnapshot, normalized),
    ...detectWeatherChanges(incidentPrefix, previousSnapshot, currentSnapshot, normalized),
  ].sort((left, right) => (
    severityOrder(right.severity) - severityOrder(left.severity)
    || kindOrder(left.kind) - kindOrder(right.kind)
    || left.type.localeCompare(right.type)
    || left.dedupeKey.localeCompare(right.dedupeKey)
  ));
}
