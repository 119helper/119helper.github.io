import { useRef, useEffect, useState } from 'react';
import type { FireFacility } from '../data/mockData';
import { loadKakaoMapSDK, retryKakaoLoad } from '../utils/kakaoLoader';
import type { KakaoMapInstance, KakaoMarker, KakaoMarkerClusterer, KakaoMarkerImage, KakaoOverlay } from '../types/kakao';
import { getFireFacilityKey } from '../utils/fireFacilityIdentity';

// 도시별 중심 좌표
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
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

// 상태별 마커 색상
const STATUS_COLORS: Record<string, string> = {
  '정상': '#34d399',
  '점검필요': '#fbbf24',
  '고장': '#ef4444',
};

const escapeHtml = (value: unknown) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const isValidCoord = (lat: number, lng: number) => {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
};

interface KakaoMapProps {
  data: FireFacility[];
  city: string;
  height?: string;
  selectedKey?: string | null;
}

export default function KakaoMap({ data, city, height = '300px', selectedKey }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, KakaoMarker>>(new Map());
  const overlaysRef = useRef<Map<string, KakaoOverlay>>(new Map());
  const markerImageCacheRef = useRef<Map<string, KakaoMarkerImage>>(new Map());
  const markerImageUrlsRef = useRef<string[]>([]);
  const [sdkReady, setSdkReady] = useState(!!window.kakao?.maps);
  const [sdkError, setSdkError] = useState('');

  // Unmount 시 오브젝트 URL 정리
  useEffect(() => {
    const markerImageUrls = markerImageUrlsRef.current;
    return () => {
      markerImageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // SDK 동적 로드
  useEffect(() => {
    if (sdkReady) return;
    loadKakaoMapSDK()
      .then(() => setSdkReady(true))
      .catch(err => setSdkError(err.message));
  }, [sdkReady]);

  // 지도 초기화 (SDK 로드 완료 후)
  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.kakao?.maps) return;
    if (mapRef.current) return;

    const center = CITY_CENTERS.seoul;
    const options = {
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      level: 7,
    };

    const map = new window.kakao.maps.Map(containerRef.current, options);
    mapRef.current = map;

    // 줌 컨트롤
    const zoomControl = new window.kakao.maps.ZoomControl();
    map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

    // 마커 클러스터러 초기화
    const MarkerClusterer = window.kakao.maps.MarkerClusterer;
    const clusterer = MarkerClusterer
      ? new MarkerClusterer({
          map: map,
          averageCenter: true,
          minLevel: 7,
          disableClickZoom: false,
          styles: [{
            width: '40px', height: '40px',
            background: 'rgba(239, 68, 68, 0.9)',
            borderRadius: '50%',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '40px',
            fontSize: '14px',
            border: '2px solid rgba(255,255,255,0.5)',
            boxShadow: '0 4px 12px rgba(239,68,68,0.3)'
          }]
        })
      : null;
    clustererRef.current = clusterer;

    // 지도 빈 공간 클릭 시 모든 오버레이 닫기
    window.kakao.maps.event.addListener(map, 'click', () => {
      overlaysRef.current.forEach(o => o.setMap(null));
    });

    return () => {
      clustererRef.current?.clear();
      markersRef.current = new Map();
      overlaysRef.current = new Map();
    };
  }, [sdkReady]);

  // 도시 변경 시 중심 이동
  useEffect(() => {
    if (!mapRef.current) return;
    const center = CITY_CENTERS[city] || CITY_CENTERS.seoul;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [city]);

  // 마커 렌더링
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    // 기존 마커/오버레이 제거
    clustererRef.current?.clear();
    markersRef.current.forEach(m => m.setMap(null));
    overlaysRef.current.forEach(o => o.setMap(null));
    markersRef.current = new Map();
    overlaysRef.current = new Map();

    const newMarkers: KakaoMarker[] = [];
    const validItems: FireFacility[] = [];

    const getMarkerImage = (color: string) => {
      const cached = markerImageCacheRef.current.get(color);
      if (cached) return cached;

      const markerSize = new window.kakao.maps.Size(24, 35);
      const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="35" viewBox="0 0 24 35">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 23 12 23s12-14 12-23C24 5.4 18.6 0 12 0z" fill="${color}"/>
          <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
        </svg>
      `;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      markerImageUrlsRef.current.push(url);

      const image = new window.kakao.maps.MarkerImage(url, markerSize);
      markerImageCacheRef.current.set(color, image);
      return image;
    };

    data.forEach(item => {
      if (!isValidCoord(item.lat, item.lng)) return;
      validItems.push(item);
      const itemKey = getFireFacilityKey(item);

      const position = new window.kakao.maps.LatLng(item.lat, item.lng);
      const color = STATUS_COLORS[item.status] || '#9ca3af';

      const markerImage = getMarkerImage(color);

      const marker = new window.kakao.maps.Marker({
        position,
        image: markerImage,
        title: item.id,
      });

      const safeId = escapeHtml(item.id);
      const safeType = escapeHtml(item.type);
      const safeAddress = escapeHtml(item.address);
      const safeStatus = escapeHtml(item.status);

      // 커스텀 오버레이 (클릭 시 표시)
      const overlayContent = `
        <div style="
          background: #0f1629;
          border: 1px solid ${color}40;
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          min-width: 200px;
          font-family: 'Inter', sans-serif;
          position: relative;
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="
              display: inline-block;
              width: 8px; height: 8px;
              border-radius: 50%;
              background: ${color};
              ${item.status === '고장' ? 'animation: pulse 1.5s infinite;' : ''}
            "></span>
            <span style="color: #e5e7eb; font-weight: 800; font-size: 14px;">${safeId}</span>
            <span style="
              font-size: 10px;
              padding: 2px 8px;
              border-radius: 9999px;
              background: ${color}20;
              color: ${color};
              font-weight: 700;
              border: 1px solid ${color}40;
            ">${safeStatus}</span>
          </div>
          <p style="color: #9ca3af; font-size: 11px; margin: 0 0 4px;">${safeType}</p>
          <p style="color: #e5e7eb; font-size: 12px; margin: 0; line-height: 1.4;">${safeAddress}</p>
          <div style="
            position: absolute;
            bottom: -8px; left: 50%;
            transform: translateX(-50%);
            width: 0; height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 8px solid #0f1629;
          "></div>
        </div>
      `;

      const overlay = new window.kakao.maps.CustomOverlay({
        content: overlayContent,
        position,
        yAnchor: 1.5,
        zIndex: 10,
      });

      // 클릭 토글
      window.kakao.maps.event.addListener(marker, 'click', () => {
        // 다른 오버레이 모두 닫기
        overlaysRef.current.forEach(o => o.setMap(null));
        overlay.setMap(map);
        map.panTo(position);
      });

      markersRef.current.set(itemKey, marker);
      overlaysRef.current.set(itemKey, overlay);
      newMarkers.push(marker);
    });

    if (clustererRef.current) {
      clustererRef.current.addMarkers(newMarkers);
    } else {
      newMarkers.forEach(marker => marker.setMap(map));
    }

    // Bounds 맞추기 (데이터가 있을 때)
    if (validItems.length === 1) {
      const only = validItems[0];
      map.setCenter(new window.kakao.maps.LatLng(only.lat, only.lng));
      map.setLevel(4);
    } else if (validItems.length > 1) {
      const bounds = new window.kakao.maps.LatLngBounds();
      validItems.forEach(item => {
        bounds.extend(new window.kakao.maps.LatLng(item.lat, item.lng));
      });
      map.setBounds(bounds);
    }

    return () => {
      clustererRef.current?.clear();
      newMarkers.forEach(m => m.setMap(null));
      overlaysRef.current.forEach(o => o.setMap(null));
    };
  }, [data]);

  // 외부에서 selectedKey 변경 시 해당 마커 포커스
  useEffect(() => {
    if (!selectedKey || !mapRef.current) return;

    const overlay = overlaysRef.current.get(selectedKey);
    const marker = markersRef.current.get(selectedKey);
    if (!overlay || !marker) return;

    // 다른 오버레이 닫기
    overlaysRef.current.forEach(o => o.setMap(null));
    // 해당 마커에 오버레이 표시 + 이동
    overlay.setMap(mapRef.current);
    mapRef.current.panTo(marker.getPosition());
  }, [selectedKey]);

  // SDK 에러 시 UI
  if (sdkError) {
    return (
      <div style={{ width: '100%', height }} className="rounded-xl overflow-hidden bg-surface-container flex items-center justify-center">
        <div className="text-center p-6">
          <span className="material-symbols-outlined text-error text-3xl">map</span>
          <p className="text-sm text-on-surface-variant mt-2">카카오맵 SDK 로드 실패</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">{sdkError}</p>
          <button
            onClick={() => { setSdkError(''); retryKakaoLoad().then(() => setSdkReady(true)).catch(e => setSdkError(e.message)); }}
            className="mt-3 px-4 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            재시도
          </button>
        </div>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div style={{ width: '100%', height }} className="rounded-xl overflow-hidden bg-surface-container flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        <span className="ml-2 text-xs text-on-surface-variant">카카오맵 로딩 중...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height }}
      className="rounded-xl overflow-hidden"
    />
  );
}
