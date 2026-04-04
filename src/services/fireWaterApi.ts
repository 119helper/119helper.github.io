// 소방용수시설 API — 로컬 정적 데이터 (소방청_소방용수시설 CSV 추출 기반)
// 대형 도시(서울, 부산, 대구, 인천, 광주)는 구별 분할 데이터 사용

export interface FireWaterFacility {
  fcltyNo?: string;
  ctprvnNm?: string;
  signguNm?: string;
  rdnmadr?: string;
  lnmadr?: string;
  latitude?: string;
  longitude?: string;
  fcltyKndNm?: string;
  fcltySeNm?: string;
  fcltyTyNm?: string;
  fcltyNm?: string;
  insptnSttusNm?: string;
}

export interface CityIndex {
  total: number;
  districts: Record<string, number>;
  hydrants?: number;     // 소화전 + 비상소화장치 합계
  waterTowers?: number;  // 급수탑 + 저수조 합계
}

const CITY_MAP: Record<string, string> = {
  seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시',
  incheon: '인천광역시', gwangju: '광주광역시', daejeon: '대전광역시',
  ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도'
};

// 구별 분할된 도시 목록
const SPLIT_CITIES = new Set(['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시']);

/**
 * 도시 메타 정보(구 목록 + 건수) 로드 — 분할된 도시만 해당
 * 분할되지 않은 도시는 null 반환
 */
export async function fetchCityIndex(cityQuery: string): Promise<CityIndex | null> {
  const searchCity = CITY_MAP[cityQuery] || '서울특별시';
  if (!SPLIT_CITIES.has(searchCity)) return null;

  try {
    const res = await fetch(`/firewater/${searchCity}/index.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 소방용수시설 데이터 로드
 * - 분할 도시 + district 지정: 해당 구만 로드 (~500KB-1MB)
 * - 분할 도시 + district 없음: 전체 로드 (원본 파일, 비권장)
 * - 비분할 도시: 기존대로 전체 로드
 */
export async function fetchFireWaterFacilities(
  cityQuery: string,
  district?: string
): Promise<FireWaterFacility[]> {
  const searchCity = CITY_MAP[cityQuery] || '서울특별시';
  const isSplit = SPLIT_CITIES.has(searchCity);

  try {
    let url: string;
    if (isSplit && district) {
      // 구별 분할 파일 로드
      url = `/firewater/${searchCity}/${district}.json`;
    } else {
      // 전체 파일 로드 (비분할 도시 또는 전체 요청)
      url = `/firewater/${searchCity}.json`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) console.warn(`지역 데이터 없음: ${url}`);
      return [];
    }
    const json = await res.json();
    return json?.response?.body?.items || [];
  } catch (err) {
    console.error('소방용수시설 데이터 로드 실패:', err);
    return [];
  }
}

/**
 * 해당 도시가 구별 분할되어 있는지 확인
 */
export function isSplitCity(cityQuery: string): boolean {
  const searchCity = CITY_MAP[cityQuery] || '서울특별시';
  return SPLIT_CITIES.has(searchCity);
}
