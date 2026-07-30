// 공중화장실 API — 로컬 정적 데이터 (scripts/sync-restrooms.js 스크립트로 분할된 JSON 사용)

import { normalizeLiveGwangjuAddress } from './administrativeRegions';

export type RestroomCoordinateKind = 'facility_point' | 'address_point' | 'unknown';

export interface RestroomFacility {
  id: string;              // MNG_NO
  nm: string;              // 화장실명
  lat: number;
  lng: number;
  addr: string;            // 주소
  isOpenAtNight: 'Y' | 'N';// 24시간 여부
  hasBell: 'Y' | 'N';      // 비상벨 여부
  male: number;            // 남성용 대변기 수
  female: number;          // 여성용 대변기 수
  type: string;            // 개방형태 등
  distance?: number;       // 계산된 거리
  coordinateKind?: RestroomCoordinateKind;
}

export interface CityIndex {
  total: number;
  districts: Record<string, number>;
}

const ADDRESS_POINT_ROOT = '/data/restroom-address-points';
const ADDRESS_POINT_CITIES = new Set(['busan']);

export function normalizeRestroomCoordinateKind(value: unknown): RestroomCoordinateKind {
  if (value === 'facility_point' || value === 'address_point') return value;
  return 'unknown';
}

function normalizeFacility(item: RestroomFacility, cityQuery: string): RestroomFacility {
  return {
    ...item,
    addr: cityQuery === 'gwangju'
      ? normalizeLiveGwangjuAddress(item.addr) || item.addr
      : item.addr,
    coordinateKind: normalizeRestroomCoordinateKind(item.coordinateKind),
  };
}

async function fetchCityIndex(url: string): Promise<CityIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 인덱스 응답 오류: HTTP ${res.status}`);
  const json = await res.json() as Partial<CityIndex>;
  if (!json || typeof json.total !== 'number' || !json.districts) {
    throw new Error(`${url} 인덱스 형식이 올바르지 않습니다.`);
  }
  return {
    total: json.total,
    districts: json.districts,
  };
}

async function fetchFacilities(url: string): Promise<RestroomFacility[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 데이터 응답 오류: HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.items)) throw new Error(`${url} 데이터 형식이 올바르지 않습니다.`);
  return json.items as RestroomFacility[];
}

function mergeCityIndexes(base: CityIndex, overlay: CityIndex | null): CityIndex {
  if (!overlay) return base;
  const districts = { ...base.districts };
  for (const [district, count] of Object.entries(overlay.districts)) {
    districts[district] = (districts[district] || 0) + Number(count || 0);
  }
  return {
    total: base.total + overlay.total,
    districts,
  };
}

// TODO: 환경에 맞춰 City Map 재구성 (fireWater와 유사)
// const CITY_MAP: Record<string, string> = {
//   seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시',
//   incheon: '인천광역시', gwangju: '광주광역시', daejeon: '대전광역시',
//   ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도'
// };

/**
 * 도시 메타 정보(구 목록 + 건수) 로드
 */
export async function fetchRestroomCityIndex(cityQuery: string): Promise<CityIndex | null> {
  const [base, addressPoints] = await Promise.all([
    fetchCityIndex(`/data/restrooms/${cityQuery}/index.json`),
    ADDRESS_POINT_CITIES.has(cityQuery)
      ? fetchCityIndex(`${ADDRESS_POINT_ROOT}/${cityQuery}/index.json`)
      : Promise.resolve(null),
  ]);
  return mergeCityIndexes(base, addressPoints);
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 공중화장실 데이터 조회
 */
export async function fetchRestrooms(
  cityQuery: string,
  district: string,
  userLat?: number,
  userLng?: number
): Promise<RestroomFacility[]> {
  if (!district) return []; // 공중화장실은 구 단위로만 조회 허용 (데이터 너무 큼)

  try {
    const baseUrl = `/data/restrooms/${cityQuery}/${district}.json`;
    const addressPointUrl = `${ADDRESS_POINT_ROOT}/${cityQuery}/${district}.json`;
    const [baseResponse, addressPointItems] = await Promise.all([
      fetchFacilities(baseUrl),
      ADDRESS_POINT_CITIES.has(cityQuery)
        ? fetchFacilities(addressPointUrl)
        : Promise.resolve([]),
    ]);
    const itemsById = new Map<string, RestroomFacility>();
    for (const item of baseResponse) {
      itemsById.set(String(item.id), item);
    }
    for (const item of addressPointItems) {
      const id = String(item.id);
      if (itemsById.has(id)) {
        throw new Error(`기본 좌표와 주소 대표점 ID가 중복됐습니다: ${id}`);
      }
      itemsById.set(id, item);
    }
    let items = [...itemsById.values()];

    // 필터링 및 거리 계산 (유효한 위치 정보 확보)
    items = items
      .filter(item => item.lat && item.lng)
      .map(item => normalizeFacility(item, cityQuery));

    if (userLat && userLng) {
      items.forEach(item => {
        item.distance = Math.round(haversineDistance(userLat, userLng, item.lat, item.lng) * 10) / 10;
      });
      items.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    }

    return items;
  } catch (err) {
    console.error('공중화장실 데이터 로드 실패:', err);
    throw err;
  }
}
