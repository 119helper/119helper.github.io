/**
 * 위치 → 지원 도시 해석 로직
 *
 * App.tsx에서 분리한 순수/준순수 헬퍼 모음. GPS 좌표를 받아
 * (1) 카카오 역지오코딩으로 행정구역·도시키를 얻거나
 * (2) 실패 시 가장 가까운 지원 도시로 폴백한다.
 *
 * 순수 함수(getDistanceKm, getNearestSupportedCity)는 단위 테스트 가능하다.
 */

import { loadKakaoMapSDK } from './kakaoLoader';

interface KakaoRegionResult {
  region_type?: string;
  region_1depth_name: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
}

/** 카카오 1depth 행정구역명 → 내부 도시키 */
export const KAKAO_REGION_TO_CITY: Record<string, string> = {
  서울특별시: 'seoul',
  부산광역시: 'busan',
  대구광역시: 'daegu',
  인천광역시: 'incheon',
  광주광역시: 'gwangju',
  대전광역시: 'daejeon',
  울산광역시: 'ulsan',
  세종특별자치시: 'sejong',
  제주특별자치도: 'jeju',
};

/** 지원 도시 대표 좌표 (폴백 거리 계산용) */
export const SUPPORTED_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  seoul: { lat: 37.5665, lng: 126.978 },
  busan: { lat: 35.1796, lng: 129.0756 },
  daegu: { lat: 35.8714, lng: 128.6014 },
  incheon: { lat: 37.4563, lng: 126.7052 },
  gwangju: { lat: 35.1595, lng: 126.8526 },
  daejeon: { lat: 36.3504, lng: 127.3845 },
  ulsan: { lat: 35.5384, lng: 129.3114 },
  sejong: { lat: 36.48, lng: 127.0 },
  jeju: { lat: 33.4996, lng: 126.5312 },
};

/** 이보다 멀면 "가까운 도시 폴백"을 신뢰하지 않는다 (km) */
export const MAX_FALLBACK_DISTANCE_KM = 30;

/** 두 좌표 사이 하버사인 거리(km) */
export function getDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const toRad = (degree: number) => degree * Math.PI / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 현재 좌표에서 가장 가까운 지원 도시와 그 거리 */
export function getNearestSupportedCity(latitude: number, longitude: number): { key: string; distanceKm: number } {
  const current = { lat: latitude, lng: longitude };
  return Object.entries(SUPPORTED_CITY_COORDS).reduce(
    (nearest, [key, coords]) => {
      const distanceKm = getDistanceKm(current, coords);
      return distanceKm < nearest.distanceKm ? { key, distanceKm } : nearest;
    },
    { key: 'seoul', distanceKm: Number.POSITIVE_INFINITY }
  );
}

/** 카카오 역지오코딩으로 도시키·행정구역 라벨 해석 (SDK 로드 포함) */
export async function resolveCityByKakao(latitude: number, longitude: number): Promise<{ cityKey?: string; regionLabel: string }> {
  await loadKakaoMapSDK();

  return new Promise<{ cityKey?: string; regionLabel: string }>((resolve, reject) => {
    const services = window.kakao?.maps?.services;
    if (!services?.Geocoder) {
      reject(new Error('카카오 지오코더를 사용할 수 없습니다.'));
      return;
    }

    const geocoder = new services.Geocoder();
    geocoder.coord2RegionCode(longitude, latitude, (result: KakaoRegionResult[], status: string) => {
      if (status !== services.Status.OK || !result?.length) {
        reject(new Error('현재 위치의 행정구역을 찾지 못했습니다.'));
        return;
      }

      const region = result.find(item => item.region_type === 'H') || result[0];
      const regionLabel = [region.region_1depth_name, region.region_2depth_name, region.region_3depth_name]
        .filter(Boolean)
        .join(' ');

      resolve({
        cityKey: KAKAO_REGION_TO_CITY[region.region_1depth_name],
        regionLabel,
      });
    });
  });
}
