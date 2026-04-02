// 소방용수시설 API — 로컬 정적 데이터 (소방청_소방용수시설 CSV 추출 기반)

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

export async function fetchFireWaterFacilities(cityQuery: string): Promise<FireWaterFacility[]> {
  const cityMap: Record<string, string> = {
    seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시',
    incheon: '인천광역시', gwangju: '광주광역시', daejeon: '대전광역시',
    ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도'
  };
  const searchCity = cityMap[cityQuery] || '서울특별시';

  try {
    const res = await fetch(`/firewater/${searchCity}.json`);
    if (!res.ok) {
      if (res.status === 404) console.warn(`지역 데이터 없음: ${searchCity}`);
      return [];
    }
    const json = await res.json();
    return json?.response?.body?.items || [];
  } catch (err) {
    console.error('소방용수시설 데이터 로드 실패:', err);
    return [];
  }
}
