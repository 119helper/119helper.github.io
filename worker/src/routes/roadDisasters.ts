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
import {
  fetchLatestDisasterMessages,
  type NormalizedDisasterMessage,
} from './disaster';

const ITS_DISASTER_URL = 'https://openapi.its.go.kr:9443/disasterInfo';
const SOURCE_URL = 'https://its.go.kr/opendata/opendataList?service=disaster';
const DISASTER_MESSAGE_SOURCE_URL = 'https://www.safekorea.go.kr/idsiSFK/neo/sfk/cs/sfc/dis/disasterMsgList.jsp?menuSeq=679';
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
  regionName: string;
  districtName: string;
}

interface RoadDisasterSourceStatus {
  id: 'its' | 'disaster-message';
  label: string;
  kind: 'coordinate-feed' | 'message-feed';
  status: 'available' | 'unavailable';
  sourceUrl: string;
  detail: string;
}

interface RoadMessageCandidate {
  id: string;
  occurredAt: string;
  locationName: string;
  message: string;
  messageType: string;
  matchedTerms: string[];
  verification: 'message-only';
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

  const regionName = boundedLocationParam(url.searchParams.get('regionName'), 'regionName');
  const districtName = boundedLocationParam(url.searchParams.get('districtName'), 'districtName');

  return {
    lat,
    lng,
    radiusKm,
    eventType: eventTypeRaw as EventTypeQuery,
    days,
    regionName,
    districtName,
  };
}

function boundedLocationParam(value: string | null, name: string): string {
  const normalized = value?.trim().replace(/\s+/g, ' ') || '';
  const hasControlCharacter = [...normalized].some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (normalized.length > 60 || hasControlCharacter) {
    throw new Error(`INVALID_PARAMETER: ${name} 값이 올바르지 않습니다`);
  }
  return normalized;
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

async function fetchItsRoadDisasters(
  query: RoadDisasterQuery,
  apiKey: string | undefined,
): Promise<ReturnType<typeof parseItsXml>> {
  const key = requireSecret(apiKey, 'ITS_API_KEY');
  if (key.toLowerCase() === 'test') {
    throw new Error('ITS_ROAD_DISASTERS: DEMO_KEY_NOT_ALLOWED');
  }
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
  }, 4_000);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ITS_ROAD_DISASTERS: HTTP_${response.status}`);
  }

  const xml = await readTextWithLimit(response, MAX_XML_BYTES);
  return parseItsXml(xml);
}

function compactLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function regionAliases(regionName: string): string[] {
  const normalized = compactLocation(regionName);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  const short = normalized.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
  if (short) aliases.add(short);
  if (normalized === '전남광주통합특별시' || normalized === '광주광역시' || short === '광주') {
    aliases.add('전남광주통합특별시');
    aliases.add('광주광역시');
    aliases.add('광주');
  }
  return [...aliases];
}

function locationMatchesScope(
  locationName: string,
  regionName: string,
  districtName: string,
): boolean {
  const aliases = regionAliases(regionName);
  if (aliases.length === 0) return false;
  const district = compactLocation(districtName);
  const locations = locationName.split(',').map(compactLocation).filter(Boolean);

  return locations.some(location => {
    if (location === '전국' || location.includes('전국')) return true;
    const alias = aliases.find(candidate => (
      location === candidate || location.startsWith(`${candidate} `)
    ));
    if (!alias) return false;
    if (!district || location === alias) return true;
    if (location.includes(` ${district}`)) return true;
    return /(?:전체|전 지역|일원)$/.test(location);
  });
}

const ROAD_FEATURE_TERMS = [
  '도로', '교량', '대교', '지하차도', '터널', '고속도로', '국도', '지방도',
  '차로', '구간', '나들목', 'IC', 'JC',
] as const;
const ROAD_ACTION_TERMS = [
  '통제', '차단', '침수', '우회', '진입 금지', '진입금지', '통행 금지',
  '통행금지', '통행 제한', '통행제한', '운행 중단', '운행중단',
] as const;

function roadMatchedTerms(message: string): string[] {
  const upperMessage = message.toUpperCase();
  const features = ROAD_FEATURE_TERMS.filter(term => upperMessage.includes(term.toUpperCase()));
  const actions = ROAD_ACTION_TERMS.filter(term => upperMessage.includes(term.toUpperCase()));
  if (features.length === 0 || actions.length === 0) return [];
  return [...new Set([...features, ...actions])].slice(0, 6);
}

function roadMessageCandidate(
  message: NormalizedDisasterMessage,
  query: RoadDisasterQuery,
): RoadMessageCandidate | null {
  if (!locationMatchesScope(message.location_name, query.regionName, query.districtName)) return null;
  const matchedTerms = roadMatchedTerms(message.msg);
  if (matchedTerms.length === 0) return null;
  return {
    id: `disaster-message:${message.md101_sn}`,
    occurredAt: message.create_date,
    locationName: message.location_name,
    message: message.msg,
    messageType: message.msgType,
    matchedTerms,
    verification: 'message-only',
  };
}

function failureDetail(error: unknown, provider: 'its' | 'disaster-message'): string {
  const message = error instanceof Error ? error.message : String(error);
  if (provider === 'its' && message.includes('DEMO_KEY_NOT_ALLOWED')) {
    return '공개 샘플 키는 실시간 현장 정보가 아니어서 제외했습니다.';
  }
  if (message.includes('API_KEY_NOT_CONFIGURED')) {
    return '운영 인증키가 없어 현재 조회할 수 없습니다.';
  }
  if (message === 'REGION_REQUIRED') {
    return '현장 관할을 확인하지 못해 문자를 섞지 않았습니다.';
  }
  return '공식 원문 조회가 일시적으로 실패했습니다.';
}

function verificationLinks(regionName: string) {
  const links = [
    { label: '국가교통정보센터', url: 'https://www.its.go.kr/', scope: '전국 도로' },
    { label: 'ROAD PLUS', url: 'https://www.roadplus.co.kr/', scope: '고속도로' },
    { label: '도시교통정보센터', url: 'https://www.utic.go.kr/', scope: '도시부 도로' },
  ];
  if (regionName.includes('서울')) {
    links.push({ label: '서울 TOPIS', url: 'https://topis.seoul.go.kr/', scope: '서울' });
  } else if (regionName.includes('경기')) {
    links.push({ label: '경기도 교통정보센터', url: 'https://gits.gg.go.kr/', scope: '경기' });
  }
  return links;
}

export async function handleRoadDisasters(
  url: URL,
  apiKey: string | undefined,
  disasterApiKey?: string,
): Promise<{ data: unknown; cacheTtl: number }> {
  const query = parseQuery(url);
  const bounds = boundsAround(query.lat, query.lng, query.radiusKm);
  const startDate = kstYmd(query.days - 1);
  const endDate = kstYmd(0);
  const [itsResult, messageResult] = await Promise.allSettled([
    fetchItsRoadDisasters(query, apiKey),
    query.regionName
      ? fetchLatestDisasterMessages(disasterApiKey, 100)
      : Promise.reject(new Error('REGION_REQUIRED')),
  ]);

  if (itsResult.status === 'rejected' && messageResult.status === 'rejected') {
    if (
      messageResult.reason instanceof Error
      && messageResult.reason.message === 'REGION_REQUIRED'
    ) {
      throw itsResult.reason;
    }
    throw new Error('ROAD_DISASTER_SOURCES_UNAVAILABLE');
  }

  const parsed = itsResult.status === 'fulfilled'
    ? itsResult.value
    : { totalCount: 0, items: [], truncated: false };
  const allMessageCandidates = messageResult.status === 'fulfilled'
    ? messageResult.value
      .map(message => roadMessageCandidate(message, query))
      .filter((candidate): candidate is RoadMessageCandidate => candidate !== null)
    : [];
  const messageCandidates = allMessageCandidates.slice(0, 20);
  const sources: RoadDisasterSourceStatus[] = [
    {
      id: 'its',
      label: '국토교통부 국가교통정보센터',
      kind: 'coordinate-feed',
      status: itsResult.status === 'fulfilled' ? 'available' : 'unavailable',
      sourceUrl: SOURCE_URL,
      detail: itsResult.status === 'fulfilled'
        ? `좌표 기반 ${parsed.totalCount}건 조회`
        : failureDetail(itsResult.reason, 'its'),
    },
    {
      id: 'disaster-message',
      label: '행정안전부 재난문자',
      kind: 'message-feed',
      status: messageResult.status === 'fulfilled' ? 'available' : 'unavailable',
      sourceUrl: DISASTER_MESSAGE_SOURCE_URL,
      detail: messageResult.status === 'fulfilled'
        ? `관할 도로 통제 후보 ${allMessageCandidates.length}건`
        : failureDetail(messageResult.reason, 'disaster-message'),
    },
  ];

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
      sources,
      messageCandidates,
      messageCandidatesTruncated: allMessageCandidates.length > messageCandidates.length,
      verificationLinks: verificationLinks(query.regionName),
    },
    cacheTtl: 60,
  };
}
