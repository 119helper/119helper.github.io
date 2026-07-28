import { fetchNearbyAedXml, isStaleDataError, tagStale } from './apiClient';
import { districtFromAddress, normalizeLiveGwangjuAddress } from './administrativeRegions';

export interface AedFacility {
  id: string;
  name: string;
  locationDetail: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  phone: string;
  managerPhone: string;
  manufacturer: string;
  model: string;
  todayHours: string;
  district: string;
}

const DAY_FIELDS = [
  ['sunSttTme', 'sunEndTme'],
  ['monSttTme', 'monEndTme'],
  ['tueSttTme', 'tueEndTme'],
  ['wedSttTme', 'wedEndTme'],
  ['thuSttTme', 'thuEndTme'],
  ['friSttTme', 'friEndTme'],
  ['satSttTme', 'satEndTme'],
] as const;

function childText(element: Element, tag: string): string {
  const expected = tag.toLowerCase();
  const child = [...element.children].find(
    candidate => candidate.localName.toLowerCase() === expected,
  );
  return child?.textContent?.trim() || '';
}

function formatTime(value: string): string {
  const digits = value.replace(/\D/g, '').padStart(4, '0').slice(-4);
  if (!value || !/^\d{3,4}$/.test(value.replace(/\D/g, ''))) return '';
  if (digits === '2400') return '24:00';
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function todayHours(element: Element, now: Date): string {
  const [startField, endField] = DAY_FIELDS[now.getDay()];
  const start = formatTime(childText(element, startField));
  const end = formatTime(childText(element, endField));
  return start && end ? `${start}–${end}` : '운영시간 확인 필요';
}

export function parseNearbyAeds(xmlText: string, now = new Date()): AedFacility[] {
  const documentNode = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('AED 응답 XML 형식이 올바르지 않습니다.');

  return [...documentNode.querySelectorAll('item')]
    .map((item, index) => {
      const lat = Number.parseFloat(childText(item, 'wgs84lat'));
      const lng = Number.parseFloat(childText(item, 'wgs84lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return null;

      const rawAddress = childText(item, 'buildaddress');
      const address = normalizeLiveGwangjuAddress(rawAddress) || rawAddress || '주소 미상';
      const rawDistance = Number.parseFloat(childText(item, 'distance'));

      return {
        id: childText(item, 'serialSeq') || `aed-${lat}-${lng}-${index}`,
        name: childText(item, 'org') || childText(item, 'buildplace') || '자동심장충격기',
        locationDetail: childText(item, 'buildplace') || '설치 위치 확인 필요',
        address,
        lat,
        lng,
        distanceKm: Number.isFinite(rawDistance) ? rawDistance : null,
        phone: childText(item, 'clerktel'),
        managerPhone: childText(item, 'managertel'),
        manufacturer: childText(item, 'mfg'),
        model: childText(item, 'model'),
        todayHours: todayHours(item, now),
        district: districtFromAddress(address),
      } satisfies AedFacility;
    })
    .filter((item): item is AedFacility => item !== null)
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
}

export async function getNearbyAeds(
  lat: number,
  lng: number,
  forceRefresh = false,
): Promise<AedFacility[]> {
  try {
    return parseNearbyAeds(await fetchNearbyAedXml(lat, lng, forceRefresh));
  } catch (error) {
    if (isStaleDataError(error)) {
      const xml = (error.cachedData as { xml?: string } | null)?.xml;
      if (xml) return tagStale(parseNearbyAeds(xml), error.cachedAt);
    }
    throw error;
  }
}
