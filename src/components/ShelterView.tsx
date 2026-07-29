import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getShelters, type ShelterData } from '../services/shelterApi';
import type { KakaoInfoWindow, KakaoMapInstance, KakaoMarker } from '../types/kakao';

interface ShelterViewProps {
  city: string;
}

const cityToCtprvn: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalize = (value?: string) =>
  (value || '').replace(/\s+/g, '').toLowerCase();

const isValidCoord = (lat: unknown, lng: unknown) => {
  const la = Number(lat);
  const ln = Number(lng);

  return (
    Number.isFinite(la) &&
    Number.isFinite(ln) &&
    la >= 33 &&
    la <= 39 &&
    ln >= 124 &&
    ln <= 132
  );
};

export default function ShelterView({ city }: ShelterViewProps) {
  const [shelters, setShelters] = useState<ShelterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [mapError, setMapError] = useState('');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedShelter, setSelectedShelter] = useState<ShelterData | null>(null);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const infoWindowsRef = useRef<KakaoInfoWindow[]>([]);
  const myMarkerRef = useRef<KakaoMarker | null>(null);
  const myInfoWindowRef = useRef<KakaoInfoWindow | null>(null);
  const requestSeqRef = useRef(0);

  // GPS 위치 가져오기
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  // 데이터 로드
  const loadData = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setApiError(null);
    
    try {
      const data = await getShelters(city, userPos?.lat, userPos?.lng);
      if (seq !== requestSeqRef.current) return;
      setShelters(data);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setApiError(err instanceof Error ? err.message : '대피소 데이터를 불러올 수 없습니다.');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [city, userPos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 카카오맵 1회 초기화
  useEffect(() => {
    const mapContainer = mapRef.current;
    if (!window.kakao?.maps || !mapContainer) {
      if (!window.kakao) {
        setMapError('카카오 지도를 불러오지 못했습니다.');
      }
      return;
    }
    if (mapInstanceRef.current) return;

    window.kakao.maps.load(() => {
      const map = new window.kakao.maps.Map(mapContainer, {
        center: new window.kakao.maps.LatLng(37.5665, 126.978),
        level: 8,
      });
      mapInstanceRef.current = map;
    });
  }, []);

  // GPS 위치 연동
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps || !userPos) return;

    const pos = new window.kakao.maps.LatLng(userPos.lat, userPos.lng);
    map.panTo(pos);

    if (myMarkerRef.current) {
      myMarkerRef.current.setPosition(pos);
    } else {
      myMarkerRef.current = new window.kakao.maps.Marker({
        position: pos,
        map,
        title: '현재 위치',
      });
      myInfoWindowRef.current = new window.kakao.maps.InfoWindow({
        content: '<div style="padding:3px 8px;font-size:11px;background:#1e3a5f;color:white;border-radius:4px;">📍 현재 위치</div>',
      });
      myInfoWindowRef.current.open(map, myMarkerRef.current);
    }
  }, [userPos]);

  const normalizedFilter = normalize(filter);
  const filteredShelters = useMemo(() => shelters.filter(s => {
    if (!normalizedFilter) return true;
    return (
      normalize(s.shelterName).includes(normalizedFilter) ||
      normalize(s.address).includes(normalizedFilter)
    );
  }), [shelters, normalizedFilter]);

  // 마커 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    // 기존 마커 및 정보창 제거
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoWindowsRef.current.forEach(w => w.close());
    infoWindowsRef.current = [];

    const filteredList = filteredShelters
      .filter(s => isValidCoord(s.lat, s.lng))
      .slice(0, 100);

    filteredList.forEach(shelter => {
      const pos = new window.kakao.maps.LatLng(shelter.lat, shelter.lng);
      const marker = new window.kakao.maps.Marker({
        position: pos,
        map,
        title: shelter.shelterName,
      });

      const name = escapeHtml(shelter.shelterName);
      const address = escapeHtml(shelter.address);
      const capacity = Number.isFinite(shelter.capacity) ? shelter.capacity.toLocaleString() : '미상';
      const altitude = Number.isFinite(shelter.altitude) ? shelter.altitude : '미상';
      const distanceHtml = shelter.distance !== undefined ? `<br/><span style="color:#e65100;">📏 ${escapeHtml(shelter.distance)}km</span>` : '';

      const infoContent = `
        <div style="padding:8px 12px;font-size:12px;max-width:220px;line-height:1.5;">
          <strong style="color:#1a73e8;">🏢 ${name}</strong><br/>
          <span style="color:#666;">📍 ${address}</span><br/>
          <span style="color:#333;">👥 수용: ${capacity}명 | 해발: ${altitude}m</span>
          ${distanceHtml}
        </div>`;

      const infoWindow = new window.kakao.maps.InfoWindow({ content: infoContent });

      window.kakao.maps.event.addListener(marker, 'click', () => {
        infoWindowsRef.current.forEach(w => w.close());
        setSelectedShelter(shelter);
        infoWindow.open(map, marker);
        map.panTo(pos);
      });

      markersRef.current.push(marker);
      infoWindowsRef.current.push(infoWindow);
    });
  }, [filteredShelters]);

  // 리스트 클릭 시 지도 이동
  const handleSelectShelter = (shelter: ShelterData) => {
    setSelectedShelter(shelter);
    const map = mapInstanceRef.current;
    if (map && window.kakao?.maps) {
      map.panTo(new window.kakao.maps.LatLng(shelter.lat, shelter.lng));
      map.setLevel(4);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <span className="material-symbols-outlined text-blue-400 text-2xl">emergency</span>
            </div>
            <div>
              <h2 className="ui-page-title">지진·해일 긴급 대피소</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {cityToCtprvn[city] || city} 지역 | 총 {shelters.length}개소
                {userPos && ' | GPS 기반 거리 정렬'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
        <input
          aria-label="대피소 검색"
                type="text"
                placeholder="대피소 검색..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-48"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Map */}
        <div className="lg:col-span-7">
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden relative">
            <div
              ref={mapRef}
              className="w-full h-[400px] lg:h-[500px]"
            />
            {mapError && (
              <div className="absolute inset-0 bg-surface-container-lowest/80 flex items-center justify-center p-4">
                <div className="bg-error/10 border border-error/20 p-4 rounded-xl flex items-center gap-3 text-error">
                  <span className="material-symbols-outlined">map</span>
                  <span className="text-sm font-bold">{mapError}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-5">
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-outline-variant/10 bg-surface-container flex items-center justify-between">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-400 text-lg">list</span>
                대피소 목록
              </h3>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                {filteredShelters.length}개
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                <span className="ml-3 text-sm text-on-surface-variant">대피소 데이터 로딩 중...</span>
              </div>
            ) : apiError ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-red-400/60 text-4xl">cloud_off</span>
                <p className="text-sm font-bold text-on-surface mt-2">대피소 API 연결 실패</p>
                <p className="text-xs text-red-300/80 mt-1 max-w-xs mx-auto">{apiError}</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  공공데이터 서버 장애 또는 API 승인 대기 중일 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={loadData}
                  className="mt-3 bg-red-500/20 text-red-300 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  다시 시도
                </button>
              </div>
            ) : filteredShelters.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl">location_off</span>
                <p className="text-sm text-on-surface-variant mt-2">해당 지역에 대피소 데이터가 없습니다</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
                {filteredShelters.slice(0, 50).map((shelter, idx) => (
                  <button
                    type="button"
                    key={`${shelter.shelterName}-${idx}`}
                    onClick={() => handleSelectShelter(shelter)}
                    className={`w-full text-left p-3 hover:bg-surface-container-high transition-colors ${
                      selectedShelter?.shelterName === shelter.shelterName ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface truncate">{shelter.shelterName}</p>
                        <p className="text-xs text-on-surface-variant truncate mt-0.5">{shelter.address}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                            👥 {shelter.capacity.toLocaleString()}명
                          </span>
                          <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                            ⛰️ 해발 {shelter.altitude}m
                          </span>
                        </div>
                      </div>
                      {shelter.distance !== undefined && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-blue-400">{shelter.distance}km</p>
                          <p className="text-[10px] text-on-surface-variant">거리</p>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected shelter detail card */}
      {selectedShelter && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">location_on</span>
                {selectedShelter.shelterName}
              </h3>
              <p className="text-sm text-on-surface-variant mt-1">{selectedShelter.address}</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="text-center">
                  <p className="text-2xl font-black text-blue-400">{selectedShelter.capacity.toLocaleString()}</p>
                  <p className="text-[10px] text-on-surface-variant">수용인원</p>
                </div>
                <div className="w-px h-10 bg-outline-variant/20"></div>
                <div className="text-center">
                  <p className="text-2xl font-black text-cyan-400">{selectedShelter.altitude}m</p>
                  <p className="text-[10px] text-on-surface-variant">해발고도</p>
                </div>
                {selectedShelter.distance !== undefined && (
                  <>
                    <div className="w-px h-10 bg-outline-variant/20"></div>
                    <div className="text-center">
                      <p className="text-2xl font-black text-orange-400">{selectedShelter.distance}km</p>
                      <p className="text-[10px] text-on-surface-variant">현재 위치에서</p>
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedShelter(null)}
              className="p-1 rounded-lg hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
