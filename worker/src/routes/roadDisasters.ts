/**
 * 국토교통부 국가교통정보센터(ITS) 재난상황정보 어댑터.
 *
 * Route:
 *   GET /api/road-disasters?lat=35.1595&lng=126.8526&radiusKm=5&eventType=all&days=1
 *
 * Source:
 *   https://its.go.kr/opendata/opendataList?service=disaster
 */

import { fetchWithTimeout, requireSecret } from './publicData';

const ITS_DISASTER_URL = 'https://openapi.its.go.kr:9443/disasterInfo';
const SOURCE_URL = 'https://its.go.kr/opendata/opendataList?service=disaster';
const MAX_XML_BYTES = 1_500_000;
const MAX_ITEMS = 500;
const MAX_GEOMETRY_POINTS = 10_000;

const EVENT_TYPES = ['all', 'D03', 'D04', 'D06', 'D07'] as const;
type EventTypeQuery = typeof EVENT_TYPES[number];

export type RoadDisasterType =
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

export interface RoadDisasterItem {
  eventId: string;
  eventType: RoadDisasterType;
  eventTypeCode: string;
  eventDetailType: string | null;
  status: string | null;
  occurredAt: string | null;
  endedAt: string | null;
  facilityName: string | null;
  facilityExtent: string | null;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'Unknown';
    coordinates: [number, number][];
    raw: string | null;
  };
  road: {
    linkIds: string[];
    names: string[];
    number: string | null;
    direction: string | null;
  };
  control: {
    type: RoadControlType;
    typeCode: string | null;
    blockedLanes: string | null;
  };
  message: string | null;
}

interface RoadDisasterQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  eventType: EventTypeQuery;
  days: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function strictNumber(
  value: string | null,
  name: string,
  min: number,
  max: number,
): number {
  const trimmed = value?.trim() ?? '';
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new Error(`INVALID_PARAMETER: ${name} 값이 올바르지 않습니다`);
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`INVALID_PARAMETER: ${name} 값은 ${min}~${max} 범위여야 합니다`);
  }
  return parsed;
}

function parseQuery(url: URL): RoadDisasterQuery {
  const lat = strictNumber(url.searchParams.get('lat'), 'lat', 32, 39.5);
  const lng = strictNumber(url.searchParams.get('lng'), 'lng', 124, 132.5);
  const radiusKm = url.searchParams.has('radiusKm')
    ? strictNumber(url.searchParams.get('radiusKm'), 'radiusKm', 0.5, 30)
    : 5;

  const eventTypeRaw = url.searchParams.get('eventType')?.trim() || 'all';
  if (!EVENT_TYPES.includes(eventTypeRaw as EventTypeQuery)) {
    throw new Error('INVALID_PARAMETER: eventType은 all, D03, D04, D06, D07 중 하나여야 합니다');
  }

  const daysRaw = url.searchParams.get('days')?.trim() || '1';
  if (!/^\d+$/.test(daysRaw)) {
    throw new Error('INVALID_PARAMETER: days 값이 올바르지 않습니다');
  }
  const days = Number(daysRaw);
  if (days < 1 || days > 7) {
    throw new Error('INVALID_PARAMETER: days 값은 1~7 범위여야 합니다');
  }

  return {
    lat,
    lng,
    radiusKm,
    eventType: eventTypeRaw as EventTypeQuery,
    days,
  };
}

function roundedCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function boundsAround(lat: number, lng: number, radiusKm: number): Bounds {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));

  return {
    minX: roundedCoordinate(lng - longitudeDelta),
    maxX: roundedCoordinate(lng + longitudeDelta),
    minY: roundedCoordinate(lat - latitudeDelta),
    maxY: roundedCoordinate(lat + latitudeDelta),
  };
}

function kstYmd(daysAgo: number): string {
  const timestamp = Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(timestamp).toISOString().slice(0, 10).replaceAll('-', '');
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ITS_ROAD_DISASTERS: RESPONSE_TOO_LARGE (${contentLength} bytes)`);
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`ITS_ROAD_DISASTERS: RESPONSE_TOO_LARGE (>${maxBytes} bytes)`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function decodeXmlText(value: string): string {
  const withoutCdata = value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
  return withoutCdata
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(code, 16))
    .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(code, 10))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function safeCodePoint(code: string, radix: number): string {
  const parsed = Number.parseInt(code, radix);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x10ffff) return '';
  try {
    return String.fromCodePoint(parsed);
  } catch {
    return '';
  }
}

function tagText(xml: string, tagName: string): string | null {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = '(?:[A-Za-z_][\\w.-]*:)?';
  const paired = new RegExp(
    `<${prefix}${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${prefix}${escaped}\\s*>`,
    'i',
  ).exec(xml);
  if (paired) return decodeXmlText(paired[1]);

  const selfClosing = new RegExp(`<${prefix}${escaped}\\b[^>]*\\/\\s*>`, 'i').test(xml);
  return selfClosing ? '' : null;
}

function nullableText(value: string | null): string | null {
  const trimmed = value?.trim() || '';
  return !trimmed || trimmed.toUpperCase() === 'NULL' ? null : trimmed;
}

function splitList(value: string | null): string[] {
  const seen = new Set<string>();
  for (const part of value?.split(',') ?? []) {
    const normalized = nullableText(part);
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

function normalizedEventType(code: string): RoadDisasterType {
  switch (code.toUpperCase()) {
    case 'D03': return 'underpass-flooding';
    case 'D04': return 'river-flood';
    case 'D06': return 'sinkhole';
    case 'D07': return 'fire';
    default: return 'unknown';
  }
}

function normalizedControlType(code: string | null): RoadControlType {
  switch (code) {
    case '1': return 'none';
    case '2': return 'partial';
    case '3': return 'lane-partial';
    case '4': return 'full';
    case '5': return 'detour';
    case '6': return 'contraflow';
    default: return 'unknown';
  }
}

function itsTimestamp(value: string | null): string | null {
  const timestamp = nullableText(value);
  if (!timestamp || !/^\d{14}$/.test(timestamp)) return null;

  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(4, 6));
  const day = Number(timestamp.slice(6, 8));
  const hour = Number(timestamp.slice(8, 10));
  const minute = Number(timestamp.slice(10, 12));
  const second = Number(timestamp.slice(12, 14));
  const verified = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    verified.getUTCFullYear() !== year
    || verified.getUTCMonth() !== month - 1
    || verified.getUTCDate() !== day
    || verified.getUTCHours() !== hour
    || verified.getUTCMinutes() !== minute
    || verified.getUTCSeconds() !== second
  ) {
    return null;
  }

  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`
    + `T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}+09:00`;
}

function geometry(
  locationInfoType: string | null,
  rawLocation: string | null,
): RoadDisasterItem['geometry'] {
  const raw = nullableText(rawLocation);
  let type: RoadDisasterItem['geometry']['type'];
  switch (locationInfoType) {
    case '1': type = 'Point'; break;
    case '2': type = 'LineString'; break;
    case '3': type = 'Polygon'; break;
    default:
      if (/^\s*(?:SRID=\d+;)?POINT\b/i.test(raw || '')) type = 'Point';
      else if (/^\s*(?:SRID=\d+;)?LINESTRING\b/i.test(raw || '')) type = 'LineString';
      else if (/^\s*(?:SRID=\d+;)?POLYGON\b/i.test(raw || '')) type = 'Polygon';
      else type = 'Unknown';
  }

  const coordinates: [number, number][] = [];
  if (raw) {
    const coordinatePattern =
      /([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = coordinatePattern.exec(raw)) !== null) {
      const longitude = Number(match[1]);
      const latitude = Number(match[2]);
      if (
        Number.isFinite(longitude)
        && Number.isFinite(latitude)
        && longitude >= -180
        && longitude <= 180
        && latitude >= -90
        && latitude <= 90
      ) {
        coordinates.push([longitude, latitude]);
      }
      if (coordinates.length > MAX_GEOMETRY_POINTS) {
        throw new Error('ITS_ROAD_DISASTERS: INVALID_XML geometry point limit exceeded');
      }
    }
  }

  return { type, coordinates, raw };
}

function parseItem(itemXml: string): RoadDisasterItem {
  const eventTypeCode = nullableText(tagText(itemXml, 'eventType')) || '';
  const controlTypeCode = nullableText(tagText(itemXml, 'lanesBlockType'));

  return {
    eventId: nullableText(tagText(itemXml, 'eventId')) || '',
    eventType: normalizedEventType(eventTypeCode),
    eventTypeCode,
    eventDetailType: nullableText(tagText(itemXml, 'eventDetailType')),
    status: nullableText(tagText(itemXml, 'status')),
    occurredAt: itsTimestamp(tagText(itemXml, 'startDate')),
    endedAt: itsTimestamp(tagText(itemXml, 'endDate')),
    facilityName: nullableText(tagText(itemXml, 'socName')),
    facilityExtent: nullableText(tagText(itemXml, 'socExtent')),
    geometry: geometry(
      nullableText(tagText(itemXml, 'locationInfoType')),
      tagText(itemXml, 'locationInfo'),
    ),
    road: {
      linkIds: splitList(tagText(itemXml, 'linkId')),
      names: splitList(tagText(itemXml, 'roadName')),
      number: nullableText(tagText(itemXml, 'roadNo')),
      direction: nullableText(tagText(itemXml, 'roadDrcType')),
    },
    control: {
      type: normalizedControlType(controlTypeCode),
      typeCode: controlTypeCode,
      blockedLanes: nullableText(tagText(itemXml, 'lanesBlocked')),
    },
    message: nullableText(tagText(itemXml, 'message')),
  };
}

function parseItsXml(xml: string): {
  totalCount: number;
  items: RoadDisasterItem[];
  truncated: boolean;
} {
  if (!xml.trimStart().startsWith('<?xml') && !/<response\b/i.test(xml)) {
    throw new Error(`ITS_ROAD_DISASTERS: INVALID_XML ${xml.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('ITS_ROAD_DISASTERS: INVALID_XML document type declarations are not allowed');
  }

  const resultCode = nullableText(tagText(xml, 'resultCode'));
  const resultMessage = nullableText(tagText(xml, 'resultMsg')) || '';
  if (resultCode === null) {
    throw new Error('ITS_ROAD_DISASTERS: INVALID_XML missing resultCode');
  }
  if (!/^0+$/.test(resultCode)) {
    throw new Error(`ITS_ROAD_DISASTERS: API_RESULT_${resultCode} ${resultMessage}`.trim());
  }

  const declaredTotal = Number(nullableText(tagText(xml, 'totalCount')));
  const items: RoadDisasterItem[] = [];
  const itemPattern = /<(?:[A-Za-z_][\w.-]*:)?item\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?item\s*>/gi;
  let match: RegExpExecArray | null;
  let hasAdditionalItem = false;
  while ((match = itemPattern.exec(xml)) !== null) {
    if (items.length >= MAX_ITEMS) {
      hasAdditionalItem = true;
      break;
    }
    items.push(parseItem(match[1]));
  }
  const totalCount = Number.isFinite(declaredTotal) && declaredTotal >= 0
    ? declaredTotal
    : items.length;

  return {
    totalCount,
    items,
    truncated: hasAdditionalItem || totalCount > items.length,
  };
}

export async function handleRoadDisasters(
  url: URL,
  apiKey: string | undefined,
): Promise<{ data: unknown; cacheTtl: number }> {
  const key = requireSecret(apiKey, 'ITS_API_KEY');
  if (key.toLowerCase() === 'test') {
    throw new Error('ITS_ROAD_DISASTERS: DEMO_KEY_NOT_ALLOWED');
  }
  const query = parseQuery(url);
  const bounds = boundsAround(query.lat, query.lng, query.radiusKm);
  const startDate = kstYmd(query.days - 1);
  const endDate = kstYmd(0);

  const upstreamUrl = new URL(ITS_DISASTER_URL);
  upstreamUrl.search = new URLSearchParams({
    apiKey: key,
    category: 'D',
    eventType: query.eventType,
    startDate,
    endDate,
    minX: String(bounds.minX),
    maxX: String(bounds.maxX),
    minY: String(bounds.minY),
    maxY: String(bounds.maxY),
    getType: 'xml',
  }).toString();

  const response = await fetchWithTimeout(upstreamUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'application/xml, text/xml;q=0.9',
      'User-Agent': '119-helper-worker/1.0',
    },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ITS_ROAD_DISASTERS: HTTP_${response.status}`);
  }

  const xml = await readTextWithLimit(response, MAX_XML_BYTES);
  const parsed = parseItsXml(xml);

  return {
    data: {
      source: '국토교통부 국가교통정보센터',
      sourceUrl: SOURCE_URL,
      retrievedAt: new Date().toISOString(),
      query: {
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
        eventType: query.eventType,
        startDate,
        endDate,
        bounds,
      },
      totalCount: parsed.totalCount,
      truncated: parsed.truncated,
      items: parsed.items,
    },
    cacheTtl: 60,
  };
}
