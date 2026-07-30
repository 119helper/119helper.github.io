import type { ERRealTimeData } from '../services/erApi';

export interface MatchedHospital {
  id: string | null;
  hpid: string | null;
  phpid: string | null;
  name: string;
  address: string;
  tel: string;
  erBeds: number | null;   // 응급실 가용 병상 (hvec)
  wardBeds: number | null; // 입원실 가용 병상 (hvgc)
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
}

function toNumOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v.trim() === '' || v.trim() === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 하버사인 거리(km)
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface MatchOptions {
  origin?: { lat: number; lon: number } | null;
  limit?: number;
}

/**
 * ER 실시간 병상 데이터를 가용병상·거리 기준으로 정렬해 수용 후보 병원을 추린다.
 * origin이 주어지면 거리 우선(가용병상 0 제외 후 거리순), 없으면 가용병상 많은 순.
 */
export function matchHospitals(beds: ERRealTimeData[], options: MatchOptions = {}): MatchedHospital[] {
  const { origin = null, limit = 5 } = options;

  const mapped: MatchedHospital[] = beds.map(b => {
    const lat = toNumOrNull(b.wgs84Lat);
    const lon = toNumOrNull(b.wgs84Lon);
    const distanceKm =
      origin && lat !== null && lon !== null ? haversineKm(origin.lat, origin.lon, lat, lon) : null;
    return {
      id: b.hpid || b.phpid || null,
      hpid: b.hpid || null,
      phpid: b.phpid || null,
      name: b.dutyName,
      address: b.dutyAddr,
      tel: b.dutyTel3,
      erBeds: toNumOrNull(b.hvec),
      wardBeds: toNumOrNull(b.hvgc),
      lat,
      lon,
      distanceKm,
    };
  });

  // 가용 응급실 병상이 0 또는 미상인 곳은 후순위로
  const available = mapped.filter(h => (h.erBeds ?? 0) > 0);
  const rest = mapped.filter(h => (h.erBeds ?? 0) <= 0);

  const sortFn = (a: MatchedHospital, b: MatchedHospital): number => {
    if (origin) {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    }
    return (b.erBeds ?? 0) - (a.erBeds ?? 0);
  };

  available.sort(sortFn);
  rest.sort((a, b) => (b.erBeds ?? 0) - (a.erBeds ?? 0));

  return [...available, ...rest].slice(0, limit);
}
