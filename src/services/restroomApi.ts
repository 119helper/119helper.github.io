// 공중화장실 API — 로컬 정적 데이터 (scripts/sync-restrooms.js 스크립트로 분할된 JSON 사용)

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
}

export interface CityIndex {
  total: number;
  districts: Record<string, number>;
}

// TODO: 환경에 맞춰 City Map 재구성 (fireWater와 유사)
const CITY_MAP: Record<string, string> = {
  seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시',
  incheon: '인천광역시', gwangju: '광주광역시', daejeon: '대전광역시',
  ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도'
};

/**
 * 도시 메타 정보(구 목록 + 건수) 로드
 */
export async function fetchRestroomCityIndex(cityQuery: string): Promise<CityIndex | null> {
  try {
    const res = await fetch(`/data/restrooms/${cityQuery}/index.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
    const url = `/data/restrooms/${cityQuery}/${district}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) console.warn(`지역 데이터 없음: ${url}`);
      return [];
    }
    const json = await res.json();
    let items: RestroomFacility[] = json?.items || [];

    // 필터링 및 거리 계산 (유효한 위치 정보 확보)
    items = items.filter(item => item.lat && item.lng);

    if (userLat && userLng) {
      items.forEach(item => {
        item.distance = Math.round(haversineDistance(userLat, userLng, item.lat, item.lng) * 10) / 10;
      });
      items.sort((a, b) => (a.distance || 999) - (b.distance || 999));
    }

    return items;
  } catch (err) {
    console.error('공중화장실 데이터 로드 실패:', err);
    return [];
  }
}
