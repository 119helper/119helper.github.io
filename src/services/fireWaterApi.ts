// 소방용수시설 API — Cloudflare Worker 프록시 경유

import { fetchFireWater } from './apiClient';

export interface FireWaterFacility {
  fcltyNo?: string;
  ctprvnNm?: string;
  signguNm?: string;
  rdnmadr?: string;
  lnmadr?: string;
  latitude?: string;
  longitude?: string;
  fcltyKndNm?: string;
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
    const items = await fetchFireWater(searchCity) as FireWaterFacility[];
    return items.filter((item: FireWaterFacility) =>
      (item.ctprvnNm && item.ctprvnNm.includes(searchCity)) ||
      (item.rdnmadr && item.rdnmadr.includes(searchCity)) ||
      (item.lnmadr && item.lnmadr.includes(searchCity))
    );
  } catch (err) {
    console.error('소방용수시설 데이터 로드 실패:', err);
    return [];
  }
}
