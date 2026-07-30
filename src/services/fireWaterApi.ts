// 소방용수시설 API — 로컬 정적 데이터 (소방청_소방용수시설 CSV 추출 기반)
// 대형 도시(서울, 부산, 대구, 인천, 광주)는 구별 분할 데이터 사용

import { CITY_TO_STATIC_PROVINCE } from './administrativeRegions';
import type { FireFacility } from '../data/mockData';

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
  fcltySeCode?: string;
  fcltyNm?: string;
  insptnSttusNm?: string;
}

export interface CityIndex {
  total: number;
  districts: Record<string, number>;
  hydrants?: number;     // 소화전 + 비상소화장치 합계
  waterTowers?: number;  // 급수탑 + 저수조 합계
}

const FACILITY_TYPE_BY_CODE: Record<string, string> = {
  '1': '소화전', '01': '소화전',
  '2': '소화전', '02': '소화전',
  '3': '급수탑', '03': '급수탑',
  '4': '저수조', '04': '저수조',
  '5': '소화전', '05': '소화전',
  '6': '비상소화장치', '06': '비상소화장치',
};

// 구별 분할된 도시 목록
const SPLIT_CITIES = new Set(['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시']);

/**
 * 도시 메타 정보(구 목록 + 건수) 로드 — 분할된 도시만 해당
 * 분할되지 않은 도시는 null 반환
 */
export async function fetchCityIndex(cityQuery: string): Promise<CityIndex | null> {
  const searchCity = CITY_TO_STATIC_PROVINCE[cityQuery] || '서울특별시';
  if (!SPLIT_CITIES.has(searchCity)) return null;

  try {
    const res = await fetch(`/firewater/${searchCity}/index.json`);
    if (!res.ok) {
      throw new Error(`소방용수 지역 색인을 불러오지 못했습니다. (${res.status})`);
    }
    const value: unknown = await res.json();
    if (
      !value
      || typeof value !== 'object'
      || !('districts' in value)
      || !value.districts
      || typeof value.districts !== 'object'
      || !('total' in value)
      || !Number.isFinite(Number(value.total))
    ) {
      throw new Error('소방용수 지역 색인 형식이 올바르지 않습니다.');
    }
    return value as CityIndex;
  } catch (error) {
    console.error('소방용수 지역 색인 로드 실패:', error);
    throw error instanceof Error ? error : new Error('소방용수 지역 색인을 불러오지 못했습니다.');
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
  const searchCity = CITY_TO_STATIC_PROVINCE[cityQuery] || '서울특별시';
  const isSplit = SPLIT_CITIES.has(searchCity);

  let url: string;
  if (isSplit && district) {
    // 구별 분할 파일 로드
    url = `/firewater/${searchCity}/${district}.json`;
  } else {
    // 전체 파일 로드 (비분할 도시 또는 전체 요청)
    url = `/firewater/${searchCity}.json`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? `소방용수 등록 데이터 파일이 없습니다. (${searchCity}${district ? ` ${district}` : ''})`
          : `소방용수 등록 데이터를 불러오지 못했습니다. (${res.status})`,
      );
    }
    const json: unknown = await res.json();
    const items = (
      json
      && typeof json === 'object'
      && 'response' in json
      && json.response
      && typeof json.response === 'object'
      && 'body' in json.response
      && json.response.body
      && typeof json.response.body === 'object'
      && 'items' in json.response.body
    )
      ? json.response.body.items
      : undefined;
    if (!Array.isArray(items)) {
      throw new Error('소방용수 등록 데이터 형식이 올바르지 않습니다.');
    }
    return items as FireWaterFacility[];
  } catch (err) {
    console.error('소방용수시설 데이터 로드 실패:', err);
    throw err instanceof Error ? err : new Error('소방용수 등록 데이터를 불러오지 못했습니다.');
  }
}

export function parseFireWaterFacilities(items: FireWaterFacility[]): FireFacility[] {
  return items.map((item, idx) => {
    const inspectionStatus = item.insptnSttusNm?.trim() || '';
    let status: FireFacility['status'] = '미확인';
    if (inspectionStatus.includes('고장')) status = '고장';
    else if (inspectionStatus.includes('점검')) status = '점검필요';
    else if (inspectionStatus.includes('정상') || inspectionStatus.includes('양호')) status = '정상';

    const kindRaw = item.fcltyKndNm
      || item.fcltySeNm
      || item.fcltyTyNm
      || FACILITY_TYPE_BY_CODE[item.fcltySeCode?.trim() || '']
      || '';
    let type: FireFacility['type'] = '소화전';
    if (kindRaw.includes('급수탑')) type = '급수탑';
    else if (kindRaw.includes('저수조')) type = '저수조';
    else if (kindRaw.includes('비상소화장치')) type = '비상소화장치';

    return {
      id: item.fcltyNo || item.fcltyNm || `FW-${idx}`,
      type,
      address: item.rdnmadr || item.lnmadr || '주소 미상',
      lat: Number.parseFloat(item.latitude || '0'),
      lng: Number.parseFloat(item.longitude || '0'),
      district: item.signguNm || '알수없음',
      status,
    };
  }).filter(item => item.lat > 0 && item.lng > 0);
}

/**
 * 해당 도시가 구별 분할되어 있는지 확인
 */
export function isSplitCity(cityQuery: string): boolean {
  const searchCity = CITY_TO_STATIC_PROVINCE[cityQuery] || '서울특별시';
  return SPLIT_CITIES.has(searchCity);
}
