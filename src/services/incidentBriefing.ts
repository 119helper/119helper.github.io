export interface IncidentCoordinate {
  lat: number;
  lng: number;
}

export type IncidentCoordinateIssue =
  | 'missing-coordinate'
  | 'invalid-latitude'
  | 'invalid-longitude';

export type IncidentCoordinateValidation =
  | { valid: true; coordinate: IncidentCoordinate }
  | { valid: false; issue: IncidentCoordinateIssue };

export interface NearbyOptions {
  radiusKm?: number;
  limit?: number;
}

export interface RoadDisasterNormalizationOptions {
  referenceTime?: number;
}

export interface RoadDisasterRankingOptions
  extends NearbyOptions, RoadDisasterNormalizationOptions {}

export interface NearbyFireWaterFacility<T> {
  facility: T;
  coordinate: IncidentCoordinate;
  distanceKm: number;
  distanceLabel: string;
}

export type RoadDisasterEventType =
  | 'underpass-flooding'
  | 'river-flood'
  | 'sinkhole'
  | 'fire'
  | 'unknown';

export type RoadControlType =
  | 'unknown'
  | 'none'
  | 'partial'
  | 'lane-partial'
  | 'full'
  | 'detour'
  | 'contraflow';

export type RoadDisasterSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'unknown';

export type RoadGeometryType = 'Point' | 'LineString' | 'Polygon' | 'Unknown';

export interface NormalizedRoadDisaster {
  eventId: string;
  eventType: RoadDisasterEventType;
  eventTypeCode: string | null;
  eventLabel: string;
  eventDetailType: string | null;
  status: string | null;
  occurredAt: string | null;
  endedAt: string | null;
  isActive: boolean;
  facilityName: string | null;
  facilityExtent: string | null;
  geometryType: RoadGeometryType;
  coordinates: IncidentCoordinate[];
  roadNames: string[];
  roadNumber: string | null;
  direction: string | null;
  controlType: RoadControlType;
  controlTypeCode: string | null;
  controlLabel: string;
  blockedLanes: string | null;
  message: string | null;
  severity: RoadDisasterSeverity;
  severityRank: number;
  controlRank: number;
}

export interface NearbyRoadDisaster extends NormalizedRoadDisaster {
  nearestCoordinate: IncidentCoordinate;
  distanceKm: number;
  distanceLabel: string;
  priorityRank: number;
}

export const ROAD_CONTROL_RANK: Readonly<Record<RoadControlType, number>> = {
  none: 0,
  unknown: 1,
  partial: 2,
  'lane-partial': 3,
  contraflow: 4,
  detour: 5,
  full: 6,
};

export const ROAD_SEVERITY_RANK: Readonly<Record<RoadDisasterSeverity, number>> = {
  unknown: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const ROAD_CONTROL_LABEL: Readonly<Record<RoadControlType, string>> = {
  unknown: '통제 미상',
  none: '통제 없음',
  partial: '부분 통제',
  'lane-partial': '차로 부분 통제',
  full: '전면 통제',
  detour: '우회',
  contraflow: '대항차로 운영',
};

const ROAD_EVENT_LABEL: Readonly<Record<RoadDisasterEventType, string>> = {
  'underpass-flooding': '지하차도 침수',
  'river-flood': '하천 범람',
  sinkhole: '땅꺼짐',
  fire: '화재',
  unknown: '도로 재난',
};

const EARTH_RADIUS_KM = 6371.0088;
const DEFAULT_NEARBY_RADIUS_KM = 5;
const DEFAULT_NEARBY_LIMIT = 5;
const ROAD_EVENT_COMPLETION_STATUS: Readonly<
  Record<RoadDisasterEventType, readonly string[]>
> = {
  // ITS D03은 문자열 상태 중 "해제" 또는 "*해제"만 종료로 본다.
  'underpass-flooding': [],
  // ITS D04의 숫자 상태 의미는 공개 명세로 확정할 수 없어 endDate만 사용한다.
  'river-flood': [],
  // ITS D06: 1 복구중, 2 임시복구, 3 복구완료.
  sinkhole: ['3'],
  // ITS D07: 1 진화중, 2 진화완료, 3 산불 외 종료.
  fire: ['2', '3'],
  unknown: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCoordinateField(
  record: Record<string, unknown>,
  keys: readonly string[],
): { present: boolean; value: number | null } {
  let present = false;
  for (const key of keys) {
    if (!(key in record)) continue;
    present = true;
    const parsed = toFiniteNumber(record[key]);
    if (parsed !== null) return { present, value: parsed };
  }
  return { present, value: null };
}

export function validateIncidentCoordinate(value: unknown): IncidentCoordinateValidation {
  if (!isRecord(value)) return { valid: false, issue: 'missing-coordinate' };

  const latitude = readCoordinateField(value, ['lat', 'latitude']);
  const longitude = readCoordinateField(value, ['lng', 'longitude', 'lon']);

  if (!latitude.present || !longitude.present) {
    return { valid: false, issue: 'missing-coordinate' };
  }
  if (latitude.value === null || latitude.value < -90 || latitude.value > 90) {
    return { valid: false, issue: 'invalid-latitude' };
  }
  if (longitude.value === null || longitude.value < -180 || longitude.value > 180) {
    return { valid: false, issue: 'invalid-longitude' };
  }

  return {
    valid: true,
    coordinate: {
      lat: Object.is(latitude.value, -0) ? 0 : latitude.value,
      lng: Object.is(longitude.value, -0) ? 0 : longitude.value,
    },
  };
}

export function normalizeIncidentCoordinate(value: unknown): IncidentCoordinate | null {
  const result = validateIncidentCoordinate(value);
  return result.valid ? result.coordinate : null;
}

export function isIncidentCoordinate(value: unknown): value is IncidentCoordinate {
  return validateIncidentCoordinate(value).valid;
}

/**
 * 두 WGS84 좌표 사이의 대권거리(km)를 계산한다.
 * 호출 전에 normalizeIncidentCoordinate로 외부 입력을 검증해야 한다.
 */
export function haversineDistanceKm(
  from: IncidentCoordinate,
  to: IncidentCoordinate,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude)
      * Math.cos(toLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, haversine));
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

export function distanceBetweenCoordinatesKm(from: unknown, to: unknown): number | null {
  const normalizedFrom = normalizeIncidentCoordinate(from);
  const normalizedTo = normalizeIncidentCoordinate(to);
  if (!normalizedFrom || !normalizedTo) return null;
  return haversineDistanceKm(normalizedFrom, normalizedTo);
}

export function formatDistanceLabel(distanceKm: number | null | undefined): string {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return '거리 미상';
  }
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000).toLocaleString('ko-KR')}m`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1).replace(/\.0$/, '')}km`;
  return `${Math.round(distanceKm).toLocaleString('ko-KR')}km`;
}

function normalizeNearbyOptions(options: NearbyOptions): { radiusKm: number; limit: number } {
  const radiusKm =
    typeof options.radiusKm === 'number'
    && Number.isFinite(options.radiusKm)
    && options.radiusKm >= 0
      ? options.radiusKm
      : DEFAULT_NEARBY_RADIUS_KM;
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(0, Math.floor(options.limit))
      : DEFAULT_NEARBY_LIMIT;
  return { radiusKm, limit };
}

/**
 * 정규화된 FireFacility({lat,lng})와 원본 FireWaterFacility
 * ({latitude,longitude})를 모두 받을 수 있다.
 */
export function pickNearbyFireWaterFacilities<T extends object>(
  facilities: readonly T[],
  originInput: unknown,
  options: NearbyOptions = {},
): NearbyFireWaterFacility<T>[] {
  const origin = normalizeIncidentCoordinate(originInput);
  if (!origin) return [];
  const { radiusKm, limit } = normalizeNearbyOptions(options);
  if (limit === 0) return [];

  return facilities
    .map((facility, sourceIndex) => {
      const coordinate = normalizeIncidentCoordinate(facility);
      if (!coordinate) return null;
      const distanceKm = haversineDistanceKm(origin, coordinate);
      if (distanceKm > radiusKm) return null;
      return {
        facility,
        coordinate,
        distanceKm,
        distanceLabel: formatDistanceLabel(distanceKm),
        sourceIndex,
      };
    })
    .filter((item): item is NearbyFireWaterFacility<T> & { sourceIndex: number } => item !== null)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.sourceIndex - right.sourceIndex)
    .slice(0, limit)
    .map(({ sourceIndex: _sourceIndex, ...item }) => item);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function normalizeRoadEventType(value: unknown): RoadDisasterEventType {
  const normalized = optionalText(value)?.toLowerCase() ?? '';
  if (normalized === 'underpass-flooding' || normalized === 'd03') return 'underpass-flooding';
  if (normalized === 'river-flood' || normalized === 'd04') return 'river-flood';
  if (normalized === 'sinkhole' || normalized === 'd06') return 'sinkhole';
  if (normalized === 'fire' || normalized === 'd07') return 'fire';
  if (normalized.includes('지하차도') && normalized.includes('침수')) return 'underpass-flooding';
  if (normalized.includes('하천') && normalized.includes('범람')) return 'river-flood';
  if (normalized.includes('땅꺼짐') || normalized.includes('싱크홀')) return 'sinkhole';
  if (normalized.includes('화재') || normalized.includes('산불')) return 'fire';
  return 'unknown';
}

function normalizeRoadControlType(value: unknown): RoadControlType {
  const normalized = optionalText(value)?.toLowerCase() ?? '';
  if (
    normalized === 'full'
    || normalized.includes('전면')
    || normalized.includes('통행금지')
    || normalized.includes('폐쇄')
  ) {
    return 'full';
  }
  if (normalized === 'detour' || normalized.includes('우회')) return 'detour';
  if (normalized === 'contraflow' || normalized.includes('대항차로')) return 'contraflow';
  if (
    normalized === 'lane-partial'
    || (normalized.includes('차로') && normalized.includes('통제'))
  ) {
    return 'lane-partial';
  }
  if (normalized === 'partial' || normalized.includes('부분') || normalized.includes('일부')) {
    return 'partial';
  }
  if (
    normalized === 'none'
    || normalized.includes('통제 없음')
    || normalized.includes('통제없음')
    || normalized.includes('정상')
    || normalized.includes('해제')
  ) {
    return 'none';
  }
  return 'unknown';
}

function severityForEventType(eventType: RoadDisasterEventType): RoadDisasterSeverity {
  if (
    eventType === 'underpass-flooding'
    || eventType === 'river-flood'
    || eventType === 'sinkhole'
  ) {
    return 'critical';
  }
  if (eventType === 'fire') return 'high';
  return 'unknown';
}

export function getRoadControlRank(value: unknown): number {
  return ROAD_CONTROL_RANK[normalizeRoadControlType(value)];
}

export function getRoadSeverityRank(value: unknown): number {
  return ROAD_SEVERITY_RANK[severityForEventType(normalizeRoadEventType(value))];
}

function normalizeGeometryType(value: unknown): RoadGeometryType {
  return value === 'Point' || value === 'LineString' || value === 'Polygon'
    ? value
    : 'Unknown';
}

function normalizeLngLatPair(value: unknown): IncidentCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  return normalizeIncidentCoordinate({ lng: value[0], lat: value[1] });
}

function normalizeGeometryCoordinates(value: unknown): IncidentCoordinate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeLngLatPair)
    .filter((coordinate): coordinate is IncidentCoordinate => coordinate !== null);
}

function normalizeCoordinateList(value: unknown): IncidentCoordinate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeIncidentCoordinate)
    .filter((coordinate): coordinate is IncidentCoordinate => coordinate !== null);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = optionalText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function statusLooksEnded(
  status: string | null,
  eventType: RoadDisasterEventType,
): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  if (eventType === 'underpass-flooding') return normalized.endsWith('해제');
  if (ROAD_EVENT_COMPLETION_STATUS[eventType].includes(normalized)) return true;
  return false;
}

function normalizeReferenceTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function endTimeHasPassed(endedAt: string | null, referenceTime: number): boolean {
  if (!endedAt) return false;
  const parsed = Date.parse(endedAt);
  return Number.isFinite(parsed) && parsed <= referenceTime;
}

/**
 * Worker의 /api/road-disasters 항목을 화면에서 사용할 안정적인 형태로 정규화한다.
 * 좌표가 없는 항목도 데이터 상태 표시에 쓸 수 있도록 버리지 않는다.
 */
export function normalizeRoadDisasterItem(
  value: unknown,
  options: RoadDisasterNormalizationOptions = {},
): NormalizedRoadDisaster | null {
  if (!isRecord(value)) return null;
  const geometry = isRecord(value.geometry) ? value.geometry : {};
  const road = isRecord(value.road) ? value.road : {};
  const control = isRecord(value.control) ? value.control : {};
  const eventType = normalizeRoadEventType(value.eventType ?? value.eventTypeCode);
  const controlType = normalizeRoadControlType(control.type ?? value.controlType);
  const severity = severityForEventType(eventType);
  const status = optionalText(value.status);
  const endedAt = optionalText(value.endedAt);
  const referenceTime = normalizeReferenceTime(options.referenceTime);
  const coordinates = Array.isArray(value.coordinates)
    ? normalizeCoordinateList(value.coordinates)
    : normalizeGeometryCoordinates(geometry.coordinates);

  return {
    eventId: optionalText(value.eventId) ?? '',
    eventType,
    eventTypeCode: optionalText(value.eventTypeCode),
    eventLabel: ROAD_EVENT_LABEL[eventType],
    eventDetailType: optionalText(value.eventDetailType),
    status,
    occurredAt: optionalText(value.occurredAt),
    endedAt,
    isActive:
      !statusLooksEnded(status, eventType)
      && !endTimeHasPassed(endedAt, referenceTime),
    facilityName: optionalText(value.facilityName),
    facilityExtent: optionalText(value.facilityExtent),
    geometryType: normalizeGeometryType(value.geometryType ?? geometry.type),
    coordinates,
    roadNames: normalizeStringList(value.roadNames ?? road.names),
    roadNumber: optionalText(value.roadNumber ?? road.number),
    direction: optionalText(value.direction ?? road.direction),
    controlType,
    controlTypeCode: optionalText(value.controlTypeCode ?? control.typeCode),
    controlLabel: ROAD_CONTROL_LABEL[controlType],
    blockedLanes: optionalText(value.blockedLanes ?? control.blockedLanes),
    message: optionalText(value.message),
    severity,
    severityRank: ROAD_SEVERITY_RANK[severity],
    controlRank: ROAD_CONTROL_RANK[controlType],
  };
}

export function normalizeRoadDisasterItems(
  value: unknown,
  options: RoadDisasterNormalizationOptions = {},
): NormalizedRoadDisaster[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : [];
  return list
    .map(item => normalizeRoadDisasterItem(item, options))
    .filter((item): item is NormalizedRoadDisaster => item !== null);
}

interface ProjectedPoint {
  x: number;
  y: number;
}

function longitudeDeltaDegrees(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function normalizeLongitude(value: number): number {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return longitude;
}

/**
 * ITS 조회 반경(최대 30km) 안에서 쓰는 현장 중심 접평면 투영.
 * 도로 선분/영역의 최소거리 판정용이며 표시 거리는 최종 좌표로 haversine 재계산한다.
 */
function projectAroundOrigin(
  origin: IncidentCoordinate,
  coordinate: IncidentCoordinate,
): ProjectedPoint {
  const latitudeRadians = (origin.lat * Math.PI) / 180;
  const longitudeDelta = longitudeDeltaDegrees(origin.lng, coordinate.lng);
  return {
    x:
      EARTH_RADIUS_KM
      * (longitudeDelta * Math.PI / 180)
      * Math.cos(latitudeRadians),
    y: EARTH_RADIUS_KM * ((coordinate.lat - origin.lat) * Math.PI / 180),
  };
}

function interpolateCoordinate(
  from: IncidentCoordinate,
  to: IncidentCoordinate,
  amount: number,
): IncidentCoordinate {
  const longitudeDelta = longitudeDeltaDegrees(from.lng, to.lng);
  return {
    lat: from.lat + (to.lat - from.lat) * amount,
    lng: normalizeLongitude(from.lng + longitudeDelta * amount),
  };
}

function closestPointOnSegment(
  origin: IncidentCoordinate,
  from: IncidentCoordinate,
  to: IncidentCoordinate,
): { coordinate: IncidentCoordinate; distanceKm: number } {
  const projectedFrom = projectAroundOrigin(origin, from);
  const projectedTo = projectAroundOrigin(origin, to);
  const segmentX = projectedTo.x - projectedFrom.x;
  const segmentY = projectedTo.y - projectedFrom.y;
  const squaredLength = segmentX ** 2 + segmentY ** 2;
  const amount = squaredLength === 0
    ? 0
    : Math.min(
      1,
      Math.max(
        0,
        -(projectedFrom.x * segmentX + projectedFrom.y * segmentY) / squaredLength,
      ),
    );
  const coordinate = interpolateCoordinate(from, to, amount);
  return {
    coordinate,
    distanceKm: haversineDistanceKm(origin, coordinate),
  };
}

function pointIsInsidePolygon(
  origin: IncidentCoordinate,
  coordinates: readonly IncidentCoordinate[],
): boolean {
  if (coordinates.length < 3) return false;
  const projected = coordinates.map(coordinate => projectAroundOrigin(origin, coordinate));
  let inside = false;

  for (let current = 0, previous = projected.length - 1; current < projected.length; previous = current++) {
    const currentPoint = projected[current];
    const previousPoint = projected[previous];
    const crossesHorizontalRay =
      (currentPoint.y > 0) !== (previousPoint.y > 0)
      && 0
        < (
          (previousPoint.x - currentPoint.x)
          * -currentPoint.y
          / (previousPoint.y - currentPoint.y)
          + currentPoint.x
        );
    if (crossesHorizontalRay) inside = !inside;
  }

  return inside;
}

function nearestVertex(
  origin: IncidentCoordinate,
  coordinates: readonly IncidentCoordinate[],
): { coordinate: IncidentCoordinate; distanceKm: number } | null {
  let nearest: { coordinate: IncidentCoordinate; distanceKm: number } | null = null;
  for (const coordinate of coordinates) {
    const distanceKm = haversineDistanceKm(origin, coordinate);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { coordinate, distanceKm };
    }
  }
  return nearest;
}

function nearestSegmentPoint(
  origin: IncidentCoordinate,
  coordinates: readonly IncidentCoordinate[],
  closePath: boolean,
): { coordinate: IncidentCoordinate; distanceKm: number } | null {
  if (coordinates.length < 2) return nearestVertex(origin, coordinates);
  const segmentCount = closePath ? coordinates.length : coordinates.length - 1;
  let nearest: { coordinate: IncidentCoordinate; distanceKm: number } | null = null;

  for (let index = 0; index < segmentCount; index += 1) {
    const candidate = closestPointOnSegment(
      origin,
      coordinates[index],
      coordinates[(index + 1) % coordinates.length],
    );
    if (!nearest || candidate.distanceKm < nearest.distanceKm) nearest = candidate;
  }

  return nearest;
}

function nearestGeometryPoint(
  origin: IncidentCoordinate,
  geometryType: RoadGeometryType,
  coordinates: readonly IncidentCoordinate[],
): { coordinate: IncidentCoordinate; distanceKm: number } | null {
  if (geometryType === 'Polygon') {
    if (pointIsInsidePolygon(origin, coordinates)) {
      return { coordinate: origin, distanceKm: 0 };
    }
    return nearestSegmentPoint(origin, coordinates, true);
  }
  if (geometryType === 'LineString') {
    return nearestSegmentPoint(origin, coordinates, false);
  }
  return nearestVertex(origin, coordinates);
}

/**
 * 진행 중인 항목을 먼저 두고, 재난 심각도 → 통제 강도 → 거리 순으로 정렬한다.
 * LineString은 선분 최소거리, Polygon은 내부 0km 또는 경계 최소거리를 사용한다.
 */
export function rankNearbyRoadDisasters(
  items: readonly unknown[],
  originInput: unknown,
  options: RoadDisasterRankingOptions = {},
): NearbyRoadDisaster[] {
  const origin = normalizeIncidentCoordinate(originInput);
  if (!origin) return [];
  const { radiusKm, limit } = normalizeNearbyOptions(options);
  if (limit === 0) return [];

  return items
    .map((value, sourceIndex) => {
      const item = normalizeRoadDisasterItem(value, options);
      if (!item) return null;
      const nearest = nearestGeometryPoint(origin, item.geometryType, item.coordinates);
      if (!nearest || nearest.distanceKm > radiusKm) return null;
      const priorityRank =
        (item.isActive ? 1000 : 0)
        + item.severityRank * 100
        + item.controlRank * 10;
      return {
        ...item,
        nearestCoordinate: nearest.coordinate,
        distanceKm: nearest.distanceKm,
        distanceLabel: formatDistanceLabel(nearest.distanceKm),
        priorityRank,
        sourceIndex,
      };
    })
    .filter((item): item is NearbyRoadDisaster & { sourceIndex: number } => item !== null)
    .sort((left, right) => (
      Number(right.isActive) - Number(left.isActive)
      || right.severityRank - left.severityRank
      || right.controlRank - left.controlRank
      || left.distanceKm - right.distanceKm
      || left.sourceIndex - right.sourceIndex
    ))
    .slice(0, limit)
    .map(({ sourceIndex: _sourceIndex, ...item }) => item);
}
