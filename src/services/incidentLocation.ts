import { loadKakaoMapSDK } from '../utils/kakaoLoader';
import type { KakaoRegionResult } from '../types/kakao';
import type { IncidentLocation } from './incidentSession';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 30_000,
};

const GPS_REGION_RESOLVE_TIMEOUT_MS = 2_500;

function toLocation(
  lat: number,
  lng: number,
  source: IncidentLocation['source'],
  resolvedAddress: string,
  accuracyMeters?: number,
  regionName?: string,
  districtName?: string,
  legalDongCode?: string,
  queryAddress?: string,
): IncidentLocation {
  if (
    !Number.isFinite(lat)
    || !Number.isFinite(lng)
    || lat < -90
    || lat > 90
    || lng < -180
    || lng > 180
  ) {
    throw new Error('확인된 현장 좌표가 올바르지 않습니다.');
  }

  return {
    lat,
    lng,
    source,
    queryAddress: queryAddress?.trim() || undefined,
    resolvedAddress: resolvedAddress.trim(),
    regionName: regionName?.trim() || undefined,
    districtName: districtName?.trim() || undefined,
    legalDongCode: legalDongCode?.replace(/\D/g, '') || undefined,
    resolvedAt: Date.now(),
    accuracyMeters,
  };
}

export async function geocodeIncidentAddress(address: string): Promise<IncidentLocation> {
  const query = address.trim();
  if (!query) throw new Error('현장 주소를 입력해 주세요.');

  await loadKakaoMapSDK();
  const services = window.kakao?.maps?.services;
  if (!services) throw new Error('주소 검색 기능을 불러오지 못했습니다.');

  return new Promise<IncidentLocation>((resolve, reject) => {
    const geocoder = new services.Geocoder();
    geocoder.addressSearch(query, (result, status) => {
      const match = result[0];
      if (status !== services.Status.OK || !match) {
        reject(new Error('주소를 찾지 못했습니다. 도로명 또는 지번 주소를 확인해 주세요.'));
        return;
      }

      try {
        resolve(toLocation(
          Number(match.y),
          Number(match.x),
          'address',
          match.address?.address_name || query,
          undefined,
          match.address?.region_1depth_name,
          match.address?.region_2depth_name,
          match.address?.b_code,
          query,
        ));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      GPS_REGION_RESOLVE_TIMEOUT_MS,
    );
    promise.then(
      value => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function enrichGpsLocation(
  lat: number,
  lng: number,
  accuracyMeters: number,
): Promise<IncidentLocation> {
  const fallback = toLocation(lat, lng, 'gps', '현재 위치', accuracyMeters);

  try {
    await withTimeout(
      loadKakaoMapSDK(),
      '현재 위치의 행정구역 확인 시간이 초과되었습니다.',
    );
    const services = window.kakao?.maps?.services;
    if (!services?.Geocoder) return fallback;

    const region = await withTimeout(
      new Promise<KakaoRegionResult>((resolve, reject) => {
        const geocoder = new services.Geocoder();
        geocoder.coord2RegionCode(lng, lat, (result, status) => {
          if (status !== services.Status.OK || !result.length) {
            reject(new Error('현재 위치의 행정구역을 찾지 못했습니다.'));
            return;
          }
          resolve(result.find(item => item.region_type === 'H') || result[0]);
        });
      }),
      '현재 위치의 행정구역 확인 시간이 초과되었습니다.',
    );
    const resolvedAddress = [
      region.region_1depth_name,
      region.region_2depth_name,
      region.region_3depth_name,
    ].filter(Boolean).join(' ');

    return toLocation(
      lat,
      lng,
      'gps',
      resolvedAddress || '현재 위치',
      accuracyMeters,
      region.region_1depth_name,
      region.region_2depth_name,
      region.code,
    );
  } catch {
    // 좌표 자체는 유효하므로 역지오코딩 실패가 GPS 출동 시작을 막지 않게 한다.
    return fallback;
  }
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return '현재 위치 권한이 거부되었습니다.';
  if (error.code === error.POSITION_UNAVAILABLE) return '현재 위치를 확인할 수 없습니다.';
  if (error.code === error.TIMEOUT) return '현재 위치 확인 시간이 초과되었습니다.';
  return '현재 위치를 확인하지 못했습니다.';
}

export function getCurrentIncidentLocation(): Promise<IncidentLocation> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('이 기기에서는 현재 위치를 사용할 수 없습니다.'));
  }

  return new Promise<IncidentLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        try {
          if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 1_000) {
            reject(new Error('현재 위치 오차가 너무 큽니다. 위치 서비스를 켜고 다시 시도해 주세요.'));
            return;
          }
          void enrichGpsLocation(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
          ).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      },
      error => reject(new Error(geolocationErrorMessage(error))),
      GEOLOCATION_OPTIONS,
    );
  });
}
