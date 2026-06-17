/**
 * GPS 자동 위치 감지 훅
 *
 * App.tsx에서 분리한 가장 복잡한 useEffect 중 하나.
 * 마운트 시 1회 현재 위치를 받아:
 *   1) 카카오 역지오코딩으로 지원 도시키를 얻으면 그 도시 선택
 *   2) 실패하면 가장 가까운 지원 도시(30km 이내)로 폴백
 *   3) 그래도 안 되면 사용자가 수동 선택하도록 안내
 * 이미 저장된 도시가 있으면(사용자가 직접 고름) 자동 감지를 건너뛴다.
 */

import { useEffect, useState } from 'react';
import { cityNames } from '../app/navigation';
import { getNearestSupportedCity, resolveCityByKakao, MAX_FALLBACK_DISTANCE_KM } from '../utils/locationResolver';

export type GpsStatus = 'loading' | 'granted' | 'denied' | 'idle' | 'unsupported';
export type LocationNoticeKind = 'info' | 'warning';
export interface LocationNotice {
  kind: LocationNoticeKind;
  message: string;
}

export interface UseGeolocationResult {
  gpsStatus: GpsStatus;
  locationNotice: LocationNotice | null;
  setGpsStatus: (status: GpsStatus) => void;
  setLocationNotice: (notice: LocationNotice | null) => void;
}

const SAVED_CITY_KEY = '119helper-city';

export function useGeolocation(setCity: (city: string) => void): UseGeolocationResult {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [locationNotice, setLocationNotice] = useState<LocationNotice | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unsupported');
      setLocationNotice({ kind: 'warning', message: '이 브라우저에서는 위치 자동감지를 지원하지 않습니다. 상단 지역 선택에서 직접 지역을 지정하세요.' });
      return;
    }
    const saved = localStorage.getItem(SAVED_CITY_KEY);
    if (saved) return;

    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const resolved = await resolveCityByKakao(latitude, longitude);
          if (resolved.cityKey) {
            setCity(resolved.cityKey);
            setGpsStatus('granted');
            setLocationNotice({
              kind: 'info',
              message: `GPS로 ${resolved.regionLabel}을 감지해 ${cityNames[resolved.cityKey]} 지역을 선택했습니다.`,
            });
            return;
          }

          setGpsStatus('unsupported');
          setLocationNotice({
            kind: 'warning',
            message: `GPS 위치는 ${resolved.regionLabel}입니다. 현재 지원 지역 목록에 없어 자동 선택하지 않았습니다. 상단 지역 선택에서 가장 가까운 실제 관할을 직접 지정하세요.`,
          });
          return;
        } catch (error) {
          console.warn('[GPS reverse geocoding] failed:', error);
        }

        const nearest = getNearestSupportedCity(latitude, longitude);
        if (nearest.distanceKm <= MAX_FALLBACK_DISTANCE_KM) {
          setCity(nearest.key);
          setGpsStatus('granted');
          setLocationNotice({
            kind: 'info',
            message: `GPS 좌표가 ${cityNames[nearest.key]} 중심에서 약 ${Math.round(nearest.distanceKm)}km 이내라 해당 지역을 선택했습니다.`,
          });
          return;
        }

        setGpsStatus('unsupported');
        setLocationNotice({
          kind: 'warning',
          message: `GPS 좌표가 지원 도시 중심에서 ${Math.round(nearest.distanceKm)}km 떨어져 있어 자동 선택하지 않았습니다. 상단 지역 선택에서 직접 지역을 지정하세요.`,
        });
      },
      () => {
        setGpsStatus('denied');
        setLocationNotice({ kind: 'warning', message: '위치 권한이 거부되어 지역을 자동 감지하지 못했습니다. 상단 지역 선택에서 직접 지역을 지정하세요.' });
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, [setCity]);

  return { gpsStatus, locationNotice, setGpsStatus, setLocationNotice };
}
