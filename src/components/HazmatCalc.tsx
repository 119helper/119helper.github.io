import { useState, useEffect, useRef } from 'react';
import { ERG_CHEMICALS } from '../data/ergChemicals';
import {
  buildHazmatProtectiveZonePath,
  getHazmatDistances,
  type SpillSize,
} from '../utils/fieldCalculations';
import type { KakaoLatLng, KakaoMapInstance, KakaoOverlay } from '../types/kakao';

interface KakaoMouseEvent {
  latLng: KakaoLatLng;
}

const DEFAULT_ORIGIN = { lat: 37.5665, lng: 126.9780 };

export default function HazmatCalc() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<KakaoMapInstance | null>(null);
  const [mapError, setMapError] = useState('');
  
  // States
  const [selectedChem, setSelectedChem] = useState('UN1005');
  const [spillSize, setSpillSize] = useState<SpillSize>('small');
  const [windSpeed, setWindSpeed] = useState('5');
  const [windDirection, setWindDirection] = useState('0'); // 0: North, 90: East, etc.
  
  const [originPoint, setOriginPoint] = useState<{lat: number, lng: number} | null>(DEFAULT_ORIGIN);
  const [isSelectingOrigin, setIsSelectingOrigin] = useState(false);
  const isSelectingRef = useRef(isSelectingOrigin);

  // Keep ref in sync with state
  useEffect(() => {
    isSelectingRef.current = isSelectingOrigin;
  }, [isSelectingOrigin]);

  // Map overlays refs
  const overlaysRef = useRef<{marker: KakaoOverlay | null, circle: KakaoOverlay | null, polygon: KakaoOverlay | null}>({ marker: null, circle: null, polygon: null });

  // Initialize Kakao Map
  useEffect(() => {
    let retryCount = 0;

    const initMap = () => {
      const mapContainer = mapRef.current;
      if (!mapContainer) return;

      if (!window.kakao?.maps) {
        retryCount += 1;
        if (retryCount > 20) {
          setMapError('카카오 지도를 불러오지 못했습니다. 네트워크 또는 API 키를 확인하세요.');
          return;
        }
        setTimeout(initMap, 300);
        return;
      }

      window.kakao.maps.load(() => {
        const options = {
          center: new window.kakao.maps.LatLng(DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng),
          level: 4,
        };
        const initialMap = new window.kakao.maps.Map(mapContainer, options);
        setMap(initialMap);

        // Map click event — uses ref to always get latest isSelectingOrigin
        window.kakao.maps.event.addListener(initialMap, 'click', (mouseEvent) => {
          const event = mouseEvent as KakaoMouseEvent;
          if (!isSelectingRef.current) return;
          const latlng = event.latLng;
          setOriginPoint({ lat: latlng.getLat(), lng: latlng.getLng() });
          setIsSelectingOrigin(false);
        });
      });
    };

    initMap();
  }, []);

  // Set cursor when selecting
  useEffect(() => {
    if (!map) return;
    const mapDiv = mapRef.current;
    if (mapDiv) {
      if (isSelectingOrigin) {
        mapDiv.style.cursor = 'crosshair';
      } else {
        mapDiv.style.cursor = '';
      }
    }
  }, [isSelectingOrigin, map]);

  // Handle map drawings when inputs or origin changes
  useEffect(() => {
    if (!map || !originPoint) return;

    // Clear old overlays
    const { marker, circle, polygon } = overlaysRef.current;
    if (marker) marker.setMap(null);
    if (circle) circle.setMap(null);
    if (polygon) polygon.setMap(null);

    const centerPos = new window.kakao.maps.LatLng(originPoint.lat, originPoint.lng);

    // Draw Marker
    const newMarker = new window.kakao.maps.Marker({
      position: centerPos,
      map: map,
      title: '누출 위치'
    });

    const chemData = ERG_CHEMICALS[selectedChem];
    if (!chemData) return;

    const { isolationM, protectionM } = getHazmatDistances(chemData, spillSize);
    
    // Draw Circle (Initial Isolation Zone)
    const newCircle = new window.kakao.maps.Circle({
      center: centerPos,
      radius: isolationM,
      strokeWeight: 2,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeStyle: 'solid',
      fillColor: '#FF0000',
      fillOpacity: 0.3,
      map: map
    });

    const polyPath = buildHazmatProtectiveZonePath(
      originPoint,
      protectionM,
      parseFloat(windDirection),
    ).map(point => new window.kakao.maps.LatLng(point.lat, point.lng));

    const newPolygon = new window.kakao.maps.Polygon({
      path: polyPath,
      strokeWeight: 2,
      strokeColor: '#FFA500',
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      fillColor: '#FFA500',
      fillOpacity: 0.3,
      map: map
    });

    overlaysRef.current = { marker: newMarker, circle: newCircle, polygon: newPolygon };

    // Move map to center and zoom correctly if it's the first time or if requested
    // map.setCenter(centerPos);

    return () => {
      newMarker.setMap(null);
      newCircle.setMap(null);
      newPolygon.setMap(null);
    };
  }, [map, originPoint, selectedChem, spillSize, windDirection]);

  // Center on current GPS
  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOriginPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          if (map) map.setCenter(new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        },
        () => alert('위치 정보를 가져오는데 실패했습니다.')
      );
    }
  };

  const formatDistance = (m: number) => {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${m.toLocaleString()} m`;
  };

  const currentChem = ERG_CHEMICALS[selectedChem];

  if (!currentChem) {
    return (
      <div className="bg-surface-container-lowest border border-error/30 rounded-xl p-6 text-error">
        선택한 유해화학물질 데이터를 찾을 수 없습니다.
      </div>
    );
  }

  const { isolationM: currentIsolation, protectionM: currentProtection } = getHazmatDistances(currentChem, spillSize);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-orange-500/10 rounded-lg">
          <span className="material-symbols-outlined text-orange-500 text-2xl">science</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-on-surface">유해화학물질(Hazmat) 대피 반경 계산기</h3>
          <p className="text-xs text-on-surface-variant">ERG 기반 초기이격 및 풍하향 방호구역 가시화</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Settings Panel */}
        <div className="md:col-span-5 space-y-4">
          <img
            src="/images/tools/diagram_hazmat_wind.svg"
            alt="누출 지점에서 풍하향으로 확장되는 방호구역"
            className="h-36 w-full rounded-lg border border-orange-500/20 object-cover"
          />
          <div className="space-y-3">
            <div>
              <label htmlFor="hazmat-chemical" className="text-xs font-bold text-on-surface-variant mb-1 block">물질 선택 (UN 번호)</label>
              <select 
                id="hazmat-chemical"
                value={selectedChem} 
                onChange={e => setSelectedChem(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              >
                {Object.entries(ERG_CHEMICALS).map(([chemicalKey, chem]) => (
                  <option key={chemicalKey} value={chemicalKey}>{chem.unInfo} - {chem.name}</option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="text-xs font-bold text-on-surface-variant mb-1 block">누출 규모</legend>
              <div className="flex bg-surface-container rounded-lg p-1">
                <button
                  type="button"
                  aria-pressed={spillSize === 'small'}
                  onClick={() => setSpillSize('small')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${spillSize === 'small' ? 'bg-orange-500/20 text-orange-400' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  소량 누출 (208L 미만)
                </button>
                <button
                  type="button"
                  aria-pressed={spillSize === 'large'}
                  onClick={() => setSpillSize('large')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${spillSize === 'large' ? 'bg-orange-500/20 text-orange-400' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  대량 누출 (208L 이상)
                </button>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="hazmat-wind-speed" className="text-xs font-bold text-on-surface-variant mb-1 block">풍속 (m/s) · 참고용</label>
                <input 
                  id="hazmat-wind-speed"
                  type="number" 
                  min={0}
                  step={0.1}
                  value={windSpeed} 
                  onChange={e => setWindSpeed(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label htmlFor="hazmat-wind-direction" className="text-xs font-bold text-on-surface-variant mb-1 block">풍향 (풍배도, 도)</label>
                <input 
                  id="hazmat-wind-direction"
                  type="number" 
                  min={0}
                  max={359}
                  step={1}
                  value={windDirection} 
                  onChange={e => setWindDirection(e.target.value)}
                  placeholder="예: 북(0), 동(90)"
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
            </div>
            <p className="text-[10px] text-on-surface-variant/80">풍향 값은 바람이 불어오는 방향(방위각)을 입력하세요.</p>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 mt-2">
            <h4 className="text-sm font-bold text-orange-400 mb-3 border-b border-orange-500/20 pb-2">계산 결과</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-on-surface-variant flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500/50 border-2 border-red-500"></span> 초기 이격 거리</span>
                <span className="text-base font-bold text-on-surface">{currentIsolation} m</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-on-surface-variant flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500/50 border-2 border-orange-500 border-dashed"></span> 풍하향 방호 구역</span>
                <span className="text-base font-bold text-on-surface">{formatDistance(currentProtection)}</span>
              </div>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-3 leading-relaxed">
              ※ 현재 계산은 ERG 기준 초기이격 및 방호거리와 풍향만 반영합니다. 풍속은 현장 판단 참고값입니다.<br />
              ※ 주황색 영역은 풍하향 방호구역의 단순 시각화(원점 기준)입니다. 실제 통제선은 현장 지형·건물·기상 조건을 함께 고려하세요.
            </p>
          </div>
        </div>

        {/* Map Panel */}
        <div className="md:col-span-7 flex flex-col gap-2">
          <div className="flex justify-between items-center bg-surface-container px-3 py-2 rounded-lg">
            <span className="text-xs text-on-surface-variant">지도에서 중심점을 지정하세요.</span>
            <div className="flex gap-2">
              <button 
                onClick={handleGetCurrentLocation}
                className="text-xs bg-surface-container-high hover:bg-surface-container-highest px-3 py-1.5 rounded-md text-on-surface transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">my_location</span> 내 위치
              </button>
              <button 
                onClick={() => setIsSelectingOrigin(true)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${isSelectingOrigin ? 'bg-orange-500 text-white animate-pulse' : 'bg-primary text-on-primary hover:bg-primary/80'}`}
              >
                <span className="material-symbols-outlined text-sm">location_on</span> 
                {isSelectingOrigin ? '지도 클릭하여 선택...' : '원점 선택'}
              </button>
            </div>
          </div>
          <div 
            ref={mapRef} 
            className="w-full h-80 rounded-xl border border-outline-variant/20 overflow-hidden relative"
          >
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container z-10 p-4 text-center">
                <p className="text-sm text-error font-bold">{mapError}</p>
              </div>
            )}
            {/* Map renders here */}
          </div>
        </div>
      </div>
    </div>
  );
}
