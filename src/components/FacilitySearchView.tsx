import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCivilShelters, fetchTsunamiShelters } from '../services/apiClient';
import type { FireFacility } from '../data/mockData';
import type { CityIndex } from '../services/fireWaterApi';
import FacilityList from './FacilityList';

interface FacilitySearchProps {
  city: string;
  // 소방용수 데이터 (App에서 전달)
  fireFacilities?: FireFacility[];
  isLoadingFacilities?: boolean;
  cityIndex?: CityIndex | null;
  selectedDistrict?: string | null;
  onDistrictChange?: (district: string) => void;
  // 초기 카테고리 (대시보드에서 바로 진입 시)
  initialCategory?: string;
}

const cityToCtprvn: Record<string, string> = {
  seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시', incheon: '인천광역시',
  gwangju: '광주광역시', daejeon: '대전광역시', ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도',
};

const cityShort: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

const cityCenters: Record<string, { lat: number; lng: number }> = {
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

interface FacilityItem {
  name: string;
  address: string;
  type: string;
  capacity: number;
  lat: number;
  lng: number;
  category: string;
}

// 통합 카테고리 정의
const CATEGORIES = [
  { id: 'hydrants', label: '소화전', icon: 'fire_hydrant', desc: '소화전 · 비상소화장치', isFireWater: true },
  { id: 'waterTowers', label: '급수탑/저수조', icon: 'water_pump', desc: '급수탑 · 저수조', isFireWater: true },
  { id: 'civil', label: '민방위 대피시설', icon: 'shield', desc: '전시/재난 대비 지하 대피시설', isFireWater: false },
  { id: 'tsunami', label: '지진해일 대피소', icon: 'tsunami', desc: '지진해일 긴급 대피장소', isFireWater: false },
];

export default function FacilitySearchView({
  city,
  fireFacilities = [],
  isLoadingFacilities = false,
  cityIndex,
  selectedDistrict,
  onDistrictChange,
  initialCategory,
}: FacilitySearchProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'hydrants');
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<FacilityItem | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // initialCategory가 변경되면 반영
  useEffect(() => {
    if (initialCategory) setActiveCategory(initialCategory);
  }, [initialCategory]);

  // GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  // 현재 카테고리 정보
  const currentCat = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];

  // 소방용수 카테고리인지 판단
  const isFireWater = currentCat.isFireWater;

  // 소방용수: 타입별 필터링된 데이터
  const filteredFireWater = isFireWater
    ? activeCategory === 'hydrants'
      ? fireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치')
      : fireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조')
    : [];

  // 대피소 데이터 로드
  const loadShelterData = useCallback(async () => {
    if (isFireWater) return; // 소방용수는 App에서 관리

    setLoading(true);
    setApiError(null);
    setFacilities([]);
    setSelectedFacility(null);

    try {
      let items: any[] = [];
      const ctprvnNm = cityToCtprvn[city] || '서울특별시';

      if (activeCategory === 'civil') {
        const data = await fetchCivilShelters(ctprvnNm);
        items = Array.isArray(data) ? data : [];
      } else if (activeCategory === 'tsunami') {
        const data = await fetchTsunamiShelters(ctprvnNm);
        // API가 필터링을 지원하지 않는 경우 전체 목록이 오므로 프론트엔드에서 필터링
        const rawItems = Array.isArray(data) ? data : [];
        items = rawItems.filter((it: any) => 
          it.CTPRVN_NM === ctprvnNm || it.ctprvnNm === ctprvnNm || 
          it.RDNMADR?.startsWith(ctprvnNm) || it.rdnmadr?.startsWith(ctprvnNm)
        );
        // 전국에 600여개 뿐이므로 광주같은 내륙은 데이터가 없을 확률이 매우 높음
      }

      if (items.length > 0) {
        const parsed: FacilityItem[] = items
          .map((it: any) => {
            const lat = parseFloat(it.lat || it.LAT || it.ycord || it.YCRD || it.latitude || '0');
            const lng = parseFloat(it.lot || it.LOT || it.xcord || it.XCRD || it.longitude || it.LON || it.lon || '0');
            if (!lat || !lng) return null;

            return {
              name: it.fcltNm || it.FCLT_NM || it.shltNm || it.SHLT_NM || it.fclt_nm || it.shelter_nm || '무명 시설',
              address: it.rdnmadr || it.RDNMADR || it.lnmadr || it.LNMADR || it.dtlAdres || it.ronAdres || it.adres || '주소 미상',
              type: it.fcltSeNm || it.FCLT_SE_NM || it.shltSeNm || it.fclt_se_nm || it.shelter_type || '대피시설',
              capacity: parseInt(it.shltCo || it.atchPrsnCo || it.acmPrsnCo || it.ACMP_PRSN_CO || it.acmp_prsn_co || '0') || 0,
              lat,
              lng,
              category: activeCategory,
            } as FacilityItem;
          })
          .filter((f): f is FacilityItem => f !== null);

        if (userPos) {
          parsed.sort((a, b) => {
            const dA = Math.sqrt((a.lat - userPos.lat) ** 2 + (a.lng - userPos.lng) ** 2);
            const dB = Math.sqrt((b.lat - userPos.lat) ** 2 + (b.lng - userPos.lng) ** 2);
            return dA - dB;
          });
        }

        setFacilities(parsed);
      }
    } catch (e: any) {
      setApiError(e?.message || '시설 데이터를 불러올 수 없습니다.');
    }
    setLoading(false);
  }, [city, activeCategory, userPos, isFireWater]);

  useEffect(() => { loadShelterData(); }, [loadShelterData]);

  // 카카오맵 초기화 — 대피소 카테고리에서만 사용
  useEffect(() => {
    if (isFireWater) return; // 소방용수는 FacilityList가 KakaoMap 자체 보유
    if (!window.kakao || !window.kakao.maps || !mapRef.current) return;
    window.kakao.maps.load(() => {
      const cityCenter = cityCenters[city] || cityCenters.seoul;
      const center = new window.kakao.maps.LatLng(cityCenter.lat, cityCenter.lng);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(center);
        return;
      }

      const map = new window.kakao.maps.Map(mapRef.current, { center, level: 8 });
      mapInstanceRef.current = map;

      if (userPos) {
        new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(userPos.lat, userPos.lng),
          map,
          title: '현재 위치',
        });
      }
    });
  }, [city, userPos, isFireWater]);

  // 마커 업데이트 (대피소용)
  useEffect(() => {
    if (isFireWater) return;
    const map = mapInstanceRef.current;
    if (!map || !window.kakao) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const visible = facilities.filter(f =>
      !filter || f.name.includes(filter) || f.address.includes(filter)
    ).slice(0, 200);

    visible.forEach(fac => {
      const pos = new window.kakao.maps.LatLng(fac.lat, fac.lng);
      const marker = new window.kakao.maps.Marker({ position: pos, map, title: fac.name });
      const info = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;max-width:220px;line-height:1.4;">
          <strong style="color:#1a73e8;">${fac.name}</strong><br/>
          <span style="color:#666;">${fac.address}</span>
          ${fac.capacity ? `<br/><span style="color:#333;">👥 수용 ${fac.capacity.toLocaleString()}명</span>` : ''}
        </div>`
      });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedFacility(fac);
        info.open(map, marker);
        map.panTo(pos);
      });
      markersRef.current.push(marker);
    });
  }, [facilities, filter, isFireWater]);

  const handleSelectFacility = (fac: FacilityItem) => {
    setSelectedFacility(fac);
    const map = mapInstanceRef.current;
    if (map && window.kakao) {
      map.panTo(new window.kakao.maps.LatLng(fac.lat, fac.lng));
      map.setLevel(4);
    }
  };

  const filtered = facilities.filter(f =>
    !filter || f.name.includes(filter) || f.address.includes(filter)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <span className="material-symbols-outlined text-primary text-2xl">location_city</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">시설 조회</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                <span className="text-primary font-bold">{cityShort[city] || city}</span> 지역
                {isFireWater
                  ? ` | ${currentCat.desc}`
                  : !loading && !apiError ? ` | ${currentCat.label} ${filtered.length}개소` : ''
                }
                {!isFireWater && userPos && ' | GPS 거리순'}
              </p>
            </div>
          </div>
          {!isFireWater && (
            <button onClick={loadShelterData} disabled={loading}
              className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
              <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
              새로고침
            </button>
          )}
        </div>

        {/* 통합 카테고리 선택 */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg"
                style={activeCategory === cat.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 소방용수 카테고리: FacilityList 임베드 ═══ */}
      {isFireWater && (
        <FacilityList
          data={filteredFireWater}
          title={activeCategory === 'hydrants' ? '소화전 위치' : '급수탑 · 저수조 위치'}
          icon={activeCategory === 'hydrants' ? '🚒' : '💧'}
          typeLabel={currentCat.desc}
          city={city}
          isLoading={isLoadingFacilities}
          cityIndex={cityIndex}
          selectedDistrict={selectedDistrict}
          onDistrictChange={onDistrictChange}
        />
      )}

      {/* ═══ 대피소 카테고리: 기존 지도+목록 뷰 ═══ */}
      {!isFireWater && (
        <>
          {/* API 에러 */}
          {!loading && apiError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
              <span className="material-symbols-outlined text-5xl text-red-400/60 mb-3 block">cloud_off</span>
              <h3 className="text-lg font-bold text-on-surface mb-2">{currentCat.label} API 연결 실패</h3>
              <p className="text-sm text-red-300/80 max-w-lg mx-auto mb-1">{apiError}</p>
              <button onClick={loadShelterData}
                className="mt-3 bg-red-500/20 text-red-300 px-5 py-2 rounded-lg text-sm font-bold hover:bg-red-500/30 transition-colors inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">refresh</span>
                다시 시도
              </button>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-12 flex items-center justify-center gap-3">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm text-on-surface-variant">{currentCat.label} 데이터 로딩 중...</span>
            </div>
          )}

          {/* 컨텐츠 */}
          {!loading && !apiError && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* 지도 */}
              <div className="lg:col-span-7">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                  <div ref={mapRef} className="w-full h-[400px] lg:h-[500px]" />
                </div>
              </div>

              {/* 목록 */}
              <div className="lg:col-span-5">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                  {/* 검색 */}
                  <div className="p-3 border-b border-outline-variant/10 bg-surface-container">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
                      <input
                        type="text" placeholder="시설명 또는 주소 검색..."
                        value={filter} onChange={e => setFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-on-surface-variant">{filtered.length}개 시설</span>
                      {userPos && <span className="text-[10px] text-primary">📍 거리순 정렬</span>}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="p-8 text-center">
                      <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl">location_off</span>
                      <p className="text-sm text-on-surface-variant mt-2">해당 지역에 시설 데이터가 없습니다</p>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
                      {filtered.slice(0, 100).map((fac, idx) => (
                        <button
                          key={`${fac.name}-${idx}`}
                          onClick={() => handleSelectFacility(fac)}
                          className={`w-full text-left p-3 hover:bg-surface-container-high transition-colors ${
                            selectedFacility?.name === fac.name && selectedFacility?.lat === fac.lat
                              ? 'bg-primary/10 border-l-2 border-primary'
                              : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-on-surface truncate">{fac.name}</p>
                              <p className="text-xs text-on-surface-variant truncate mt-0.5">{fac.address}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                {fac.type && (
                                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                                    {fac.type}
                                  </span>
                                )}
                                {fac.capacity > 0 && (
                                  <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                                    👥 {fac.capacity.toLocaleString()}명
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 선택된 시설 상세 */}
          {selectedFacility && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">location_on</span>
                    {selectedFacility.name}
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1">{selectedFacility.address}</p>
                  <div className="flex items-center gap-4 mt-3">
                    {selectedFacility.type && (
                      <div className="text-center">
                        <p className="text-sm font-bold text-primary">{selectedFacility.type}</p>
                        <p className="text-[10px] text-on-surface-variant">시설유형</p>
                      </div>
                    )}
                    {selectedFacility.capacity > 0 && (
                      <>
                        <div className="w-px h-10 bg-outline-variant/20" />
                        <div className="text-center">
                          <p className="text-2xl font-black text-primary">{selectedFacility.capacity.toLocaleString()}</p>
                          <p className="text-[10px] text-on-surface-variant">수용인원</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedFacility(null)}
                  className="p-1 rounded-lg hover:bg-surface-container transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
