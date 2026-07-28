// 에어코리아 대기질 API — Cloudflare Worker 프록시 경유

import { fetchAirQuality, isStaleDataError, tagStale } from './apiClient';
import type { ApiRecord } from './apiClient';
import { GWANGJU_CURRENT_NAME, isFormerGwangjuAddress } from './administrativeRegions';

export interface AirQualityData {
  stationName: string;
  dataTime: string;
  pm10Value: string;
  pm25Value: string;
  o3Value: string;
  khaiValue: string;
  khaiGrade: string;
  pm10Grade: string;
  pm25Grade: string;
}

function getSidoName(addressName: string): string {
  if (addressName === GWANGJU_CURRENT_NAME || isFormerGwangjuAddress(addressName)) return '광주';
  if (addressName.startsWith('서울')) return '서울';
  if (addressName.startsWith('부산')) return '부산';
  if (addressName.startsWith('대구')) return '대구';
  if (addressName.startsWith('인천')) return '인천';
  if (addressName.startsWith('광주')) return '광주';
  if (addressName.startsWith('대전')) return '대전';
  if (addressName.startsWith('울산')) return '울산';
  if (addressName.startsWith('세종')) return '세종';
  if (addressName.startsWith('경기')) return '경기';
  if (addressName.startsWith('강원')) return '강원';
  if (addressName.startsWith('충청북도') || addressName.startsWith('충북')) return '충북';
  if (addressName.startsWith('충청남도') || addressName.startsWith('충남')) return '충남';
  if (addressName.startsWith('전라북도') || addressName.startsWith('전북')) return '전북';
  if (addressName.startsWith('전라남도') || addressName.startsWith('전남')) return '전남';
  if (addressName.startsWith('경상북도') || addressName.startsWith('경북')) return '경북';
  if (addressName.startsWith('경상남도') || addressName.startsWith('경남')) return '경남';
  if (addressName.startsWith('제주')) return '제주';
  return '전국';
}

type AirQualityApiItem = ApiRecord & {
  stationName?: unknown;
  dataTime?: unknown;
  pm10Value?: unknown;
  pm25Value?: unknown;
  o3Value?: unknown;
  khaiValue?: unknown;
  khaiGrade?: unknown;
  pm10Grade?: unknown;
  pm25Grade?: unknown;
};

function text(value: unknown, fallback = ''): string {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function toAirQualityData(items: AirQualityApiItem[]): AirQualityData | null {
  if (!items || items.length === 0) return null;
  const validItem = items.find(item => text(item.pm10Value) !== '-' && text(item.pm10Value) !== '' && text(item.khaiGrade) !== '') || items[0];

  return {
    stationName: text(validItem.stationName, '알 수 없음'),
    dataTime: text(validItem.dataTime),
    pm10Value: text(validItem.pm10Value, '-'),
    pm25Value: text(validItem.pm25Value, '-'),
    o3Value: text(validItem.o3Value, '-'),
    khaiValue: text(validItem.khaiValue, '-'),
    khaiGrade: text(validItem.khaiGrade, '-'),
    pm10Grade: text(validItem.pm10Grade, '-'),
    pm25Grade: text(validItem.pm25Grade, '-'),
  };
}

export async function getRealtimeAirQuality(addressName: string): Promise<AirQualityData | null> {
  const sidoName = getSidoName(addressName);

  try {
    const items = await fetchAirQuality(sidoName);
    return toAirQualityData(items);
  } catch (e) {
    // 네트워크 실패 시 캐시 폴백 데이터를 신선도 태그와 함께 반환
    if (isStaleDataError(e)) {
      const recovered = toAirQualityData(e.cachedData as AirQualityApiItem[]);
      if (recovered) return tagStale(recovered, e.cachedAt);
    }
    console.error('에어코리아 API 호출 실패:', e);
    return null;
  }
}
