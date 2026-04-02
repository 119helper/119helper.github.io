import { useState, useEffect, useRef } from 'react';
import { ERG_CHEMICALS } from '../data/ergChemicals';


export default function HazmatCalc() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  
  // States
  const [selectedChem, setSelectedChem] = useState('UN1005');
  const [spillSize, setSpillSize] = useState<'small' | 'large'>('small');
  const [windSpeed, setWindSpeed] = useState('5');
  const [windDirection, setWindDirection] = useState('0'); // 0: North, 90: East, etc.
  
  const [originPoint, setOriginPoint] = useState<{lat: number, lng: number} | null>({ lat: 37.5665, lng: 126.9780 }); // Default Seoul City Hall
  const [isSelectingOrigin, setIsSelectingOrigin] = useState(false);
  const isSelectingRef = useRef(isSelectingOrigin);

  // Keep ref in sync with state
  useEffect(() => {
    isSelectingRef.current = isSelectingOrigin;
  }, [isSelectingOrigin]);

  // Map overlays refs
  const overlaysRef = useRef<{marker: any, circle: any, polygon: any}>({ marker: null, circle: null, polygon: null });

  // Initialize Kakao Map
  useEffect(() => {
    if (!window.kakao || !window.kakao.maps || !mapRef.current) return;
    
    window.kakao.maps.load(() => {
      const options = {
        center: new window.kakao.maps.LatLng(originPoint?.lat || 37.5665, originPoint?.lng || 126.9780),
        level: 4,
      };
      const initialMap = new window.kakao.maps.Map(mapRef.current, options);
      setMap(initialMap);

      // Map click event — uses ref to always get latest isSelectingOrigin
      window.kakao.maps.event.addListener(initialMap, 'click', (mouseEvent: any) => {
        if (!isSelectingRef.current) return;
        const latlng = mouseEvent.latLng;
        setOriginPoint({ lat: latlng.getLat(), lng: latlng.getLng() });
        setIsSelectingOrigin(false);
      });
    });
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

    const isolationDist = spillSize === 'small' ? chemData.isolationSmall : chemData.isolationLarge;
    const protectionDist = spillSize === 'small' ? chemData.protectionSmall : chemData.protectionLarge;
    
    // Draw Circle (Initial Isolation Zone)
    const newCircle = new window.kakao.maps.Circle({
      center: centerPos,
      radius: isolationDist,
      strokeWeight: 2,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeStyle: 'solid',
      fillColor: '#FF0000',
      fillOpacity: 0.3,
      map: map
    });

    // Draw Polygon (Downwind Protective Zone)
    // Wind Direction is WHERE WIND COMES FROM (0=North coming) -> Blows TO South (180 deg)
    const windFromAngle = parseFloat(windDirection) || 0;
    const windToAngle = (windFromAngle + 180) % 360;
    
    // Create cone polygon points
    // Base of cone is not point 0. It is a wedge.
    // For simplicity, we draw a triangle / cone from the edge of the circle up to the protectiondist
    // Let's draw arc of protection region
    const calcOffset = (lat: number, lng: number, distance: number, angleDeg: number) => {
      const angleRad = angleDeg * Math.PI / 180;
      const latChange = (distance * Math.cos(angleRad)) / 111320;
      const lngChange = (distance * Math.sin(angleRad)) / (111320 * Math.cos(lat * Math.PI / 180));
      return new window.kakao.maps.LatLng(lat + latChange, lng + lngChange);
    };

    const spreadAngle = 30; // +/- 30 degrees (총 60도 부채꼴)
    const polyPath = [];

    // Start at origin (or could start at isolation zone edge, but origin is fine for simple visual)
    polyPath.push(centerPos);
    
    // Create arc points
    for (let angle = windToAngle - spreadAngle; angle <= windToAngle + spreadAngle; angle += 5) {
      polyPath.push(calcOffset(originPoint.lat, originPoint.lng, protectionDist, angle));
    }

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

  const currentChem = ERG_CHEMICALS[selectedChem];
  const currentIsolation = spillSize === 'small' ? currentChem.isolationSmall : currentChem.isolationLarge;
  const currentProtection = spillSize === 'small' ? currentChem.protectionSmall : currentChem.protectionLarge;

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
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-on-surface-variant mb-1 block">물질 선택 (UN 번호)</label>
              <select 
                value={selectedChem} 
                onChange={e => setSelectedChem(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              >
                {Object.values(ERG_CHEMICALS).map(chem => (
                  <option key={chem.unInfo} value={chem.unInfo}>{chem.unInfo} - {chem.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-on-surface-variant mb-1 block">누출 규모</label>
              <div className="flex bg-surface-container rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setSpillSize('small')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${spillSize === 'small' ? 'bg-orange-500/20 text-orange-400' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  소량 누출 (208L 미만)
                </button>
                <button
                  type="button"
                  onClick={() => setSpillSize('large')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${spillSize === 'large' ? 'bg-orange-500/20 text-orange-400' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  대량 누출 (208L 이상)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">풍속 (m/s)</label>
                <input 
                  type="number" 
                  value={windSpeed} 
                  onChange={e => setWindSpeed(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">풍향 (풍배도, 도)</label>
                <input 
                  type="number" 
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
                <span className="text-base font-bold text-on-surface">{currentProtection / 1000} km</span>
              </div>
            </div>
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
            {/* Map renders here */}
          </div>
        </div>
      </div>
    </div>
  );
}
