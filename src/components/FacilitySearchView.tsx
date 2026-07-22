import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCivilShelters, fetchTsunamiShelters, isStaleDataError } from '../services/apiClient';
import { fetchRestrooms, fetchRestroomCityIndex } from '../services/restroomApi';
import type { FireFacility } from '../data/mockData';
import type { CityIndex } from '../services/fireWaterApi';
import FacilityList from './FacilityList';
import { loadKakaoMapSDK } from '../utils/kakaoLoader';
import proj4 from 'proj4';
import BuildingView from './BuildingView';
import DataStatePanel from './DataStatePanel';
import type { KakaoMapInstance, KakaoMarker } from '../types/kakao';
import type { FacilityFilterState, FacilityViewState, ShelterCategory } from '../types/navigation';
import type { BuildingWorkspaceState } from '../types/buildingWorkspace';
import { formatDatasetDate, formatFreshnessSourceDate, getDatasetFreshness, isFreshnessExpired, type DatasetFreshness } from '../services/dataFreshness';

// EPSG:5179 (GRS80 UTM-K) 정의 — 공공데이터포털(재난안전데이터) 최신 좌표계
proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");

interface FacilitySearchProps {
  city: string;
  // 소방용수 데이터 (App에서 전달)
  fireFacilities?: FireFacility[];
  isLoadingFacilities?: boolean;
  cityIndex?: CityIndex | null;
  selectedDistrict?: string | null;
  onDistrictChange?: (district: string) => void;
  activeCategory: ShelterCategory;
  filterState: FacilityFilterState;
  viewState: FacilityViewState;
  onCategoryChange: (category: ShelterCategory) => void;
  onFilterStateChange: (patch: Partial<FacilityFilterState>) => void;
  onViewStateChange: (patch: Partial<FacilityViewState>) => void;
  incidentAddress?: string;
  buildingWorkspace: BuildingWorkspaceState;
  onBuildingWorkspaceChange: (patch: Partial<BuildingWorkspaceState>) => void;
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
  id?: string;
  name: string;
  address: string;
  type: string;
  capacity?: number;
  lat: number;
  lng: number;
  category: string;
  district?: string;
  hasBell?: 'Y' | 'N';
  maleToilet?: number;
  femaleToilet?: number;
}

type FacilitySourceItem = Record<string, unknown>;

const fieldText = (item: FacilitySourceItem, key: string) => String(item[key] ?? '');

const facilityItemKey = (facility: FacilityItem) => facility.id
  ? `id:${facility.id}`
  : `location:${facility.name}|${facility.address}|${facility.lat}|${facility.lng}`;

const escapeHtml = (value: unknown) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

// 통합 카테고리 정의
const CATEGORIES = [
  { id: 'building', label: '건축물대장', icon: 'apartment', desc: '건축물대장 및 소방시설 현황 조회', isFireWater: false, isBuilding: true },
  { id: 'hydrants', label: '소화전', icon: 'fire_hydrant', desc: '소화전 · 비상소화장치', isFireWater: true, isBuilding: false },
  { id: 'waterTowers', label: '급수탑/저수조', icon: 'water_pump', desc: '급수탑 · 저수조', isFireWater: true, isBuilding: false },
  { id: 'civil', label: '민방위 대피시설', icon: 'shield', desc: '전시/재난 대비 지하 대피시설', isFireWater: false, isBuilding: false },
  { id: 'tsunami', label: '지진해일 대피소', icon: 'tsunami', desc: '지진해일 긴급 대피장소', isFireWater: false, isBuilding: false },
  { id: 'restrooms', label: '공중화장실', icon: 'wc', desc: '공공 개방 화장실', isFireWater: false, isBuilding: false },
] as const;

export default function FacilitySearchView({
  city,
  fireFacilities = [],
  isLoadingFacilities = false,
  cityIndex,
  selectedDistrict,
  onDistrictChange,
  activeCategory,
  filterState,
  viewState,
  onCategoryChange,
  onFilterStateChange,
  onViewStateChange,
  incidentAddress,
  buildingWorkspace,
  onBuildingWorkspaceChange,
}: FacilitySearchProps) {
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [kakaoMap, setKakaoMap] = useState<KakaoMapInstance | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [freshness, setFreshness] = useState<DatasetFreshness | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const facilityListRef = useRef<HTMLDivElement>(null);
  const listScrollFrameRef = useRef<number | null>(null);
  const pendingListScrollTopRef = useRef(viewState.listScrollTop);
  const persistedListScrollTopRef = useRef(viewState.listScrollTop);
  const filter = filterState.query;
  const filterDistrict = filterState.district;
  const setFilter = (query: string) => {
    onFilterStateChange({ query });
    onViewStateChange({ selectedKey: null, listScrollTop: 0 });
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };
  const setFilterDistrict = (district: string) => {
    onFilterStateChange({ district });
    onViewStateChange({ selectedKey: null, listScrollTop: 0 });
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const [restroomIndex, setRestroomIndex] = useState<CityIndex | null>(null);

  // 공중화장실 전용 도시 인덱스 (기존 cityIndex가 없거나 다를 경우 대비)
  useEffect(() => {
    if (activeCategory === 'restrooms') {
      fetchRestroomCityIndex(city).then(idx => {
        setRestroomIndex(idx);
        if (idx && filterDistrict === '전체') {
          // 자동으로 첫 번째 구/군을 선택할지 여부: 에러 메시지로 유도하는 것도 나쁘지 않음.
        }
      });
    }
  }, [city, activeCategory, filterDistrict]);

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
  const freshnessExpired = freshness ? isFreshnessExpired(freshness) : false;

  useEffect(() => {
    let alive = true;
    setFreshness(null);
    getDatasetFreshness(activeCategory, city).then(meta => {
      if (alive) setFreshness(meta);
    });
    return () => { alive = false; };
  }, [activeCategory, city]);

  // 소방용수 카테고리인지 판단
  const isFireWater = currentCat.isFireWater;
  const isBuilding = currentCat.isBuilding;

  // 소방용수: 타입별 필터링된 데이터
  const filteredFireWater = isFireWater
    ? activeCategory === 'hydrants'
      ? fireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치')
      : fireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조')
    : [];

  // 대피소/화장실 데이터 로드
  const loadShelterData = useCallback(async () => {
    if (isFireWater || isBuilding) return; // 소방용수/건축물대장은 자체 관리

    setLoading(true);
    setApiError(null);
    setWarning(null);
    setFacilities([]);

    try {
      let items: FacilitySourceItem[] = [];
      const ctprvnNm = cityToCtprvn[city] || '서울특별시';

      if (activeCategory === 'tsunami') {
        let rawItems: FacilitySourceItem[];
        try {
          rawItems = await fetchTsunamiShelters() as FacilitySourceItem[];
        } catch (e: unknown) {
          if (isStaleDataError(e)) {
            rawItems = e.cachedData as FacilitySourceItem[];
            const t = e.cachedAt ? new Date(e.cachedAt).toLocaleTimeString() : '';
            setWarning(`${e.message}${t ? ` (성공: ${t})` : ''}`);
          } else throw e;
        }
        
        items = rawItems.filter((it) => {
          const addr1 = fieldText(it, 'SHNT_PLACE_DTL_POSITION');
          const addr2 = fieldText(it, 'RN_DTL_ADRES');
          const addr3 = fieldText(it, 'LNMADR');
          const addr4 = fieldText(it, 'RDNMADR');
          const ctprvn = fieldText(it, 'CTPRVN_NM') || fieldText(it, 'ctprvnNm');
          
          return ctprvn === ctprvnNm ||
            addr1.startsWith(ctprvnNm) ||
            addr2.startsWith(ctprvnNm) ||
            addr3.startsWith(ctprvnNm) ||
            addr4.startsWith(ctprvnNm);
        });
      } else if (activeCategory === 'civil') {
        let rawItems: FacilitySourceItem[];
        try {
          rawItems = await fetchCivilShelters(ctprvnNm) as FacilitySourceItem[];
        } catch (e: unknown) {
          if (isStaleDataError(e)) {
            rawItems = e.cachedData as FacilitySourceItem[];
            const t = e.cachedAt ? new Date(e.cachedAt).toLocaleTimeString() : '';
            setWarning(`${e.message}${t ? ` (성공: ${t})` : ''}`);
          } else throw e;
        }

        items = rawItems.filter((it) => {
          const addr1 = fieldText(it, 'LCTN_WHOL_ADDR'); // DSSP-IF-10166
          const addr2 = fieldText(it, 'RDNMADR');
          const addr3 = fieldText(it, 'rdnmadr');
          const ctprvn = fieldText(it, 'CTPRVN_NM') || fieldText(it, 'ctprvnNm');
          return ctprvn === ctprvnNm ||
            addr1.startsWith(ctprvnNm) ||
            addr2.startsWith(ctprvnNm) ||
            addr3.startsWith(ctprvnNm);
        });

        if (items.length === 0) {
          throw new Error('선택된 지역의 대피시설 데이터가 현재 로드된 페이지 내에 존재하지 않습니다.');
        }
      } else if (activeCategory === 'restrooms') {
        if (!filterDistrict || filterDistrict === '전체') {
          // 공중화장실의 경우 데이터가 방대하므로 구별 선택을 강제 또는 안내
          throw new Error('화장실 정보는 데이터가 방대하여 특정 구/군을 먼저 선택해야 합니다.');
        } else {
          const rawItems = await fetchRestrooms(city, filterDistrict, userPos?.lat, userPos?.lng);
          const parsed: FacilityItem[] = rawItems.map(it => ({
            id: it.id,
            name: it.nm,
            address: it.addr,
            type: it.type,
            lat: it.lat,
            lng: it.lng,
            category: activeCategory,
            district: filterDistrict,
            hasBell: it.hasBell,
            maleToilet: it.male,
            femaleToilet: it.female
          }));
          
          // 위치 기반일 경우 가까운 50개만 잘라서 렉 방지
          const finalFacilities = userPos ? parsed.slice(0, 50) : parsed;
          
          setFacilities(finalFacilities);
          setLoading(false);
          return;
        }
      }

      if (items.length > 0) {
        const parsed: FacilityItem[] = items
          .map((it) => {
            let lat = parseFloat(
              fieldText(it, 'lat') || fieldText(it, 'LA') || fieldText(it, 'LAT') || fieldText(it, 'ycord') || fieldText(it, 'YCRD') || fieldText(it, 'latitude') || fieldText(it, 'LAT_EPSG4326') || '0'
            );
            let lng = parseFloat(
              fieldText(it, 'lot') || fieldText(it, 'LO') || fieldText(it, 'LOT') || fieldText(it, 'xcord') || fieldText(it, 'XCRD') || fieldText(it, 'longitude') || fieldText(it, 'LON') || fieldText(it, 'lon') || fieldText(it, 'LOT_EPST4326') || '0'
            );

            
            // EPSG:5179 좌표계 변환 (DSSP-IF-10166 대응)
            const epsgX = parseFloat(fieldText(it, 'CRD_INFO_X_EPSG5179') || '0');
            const epsgY = parseFloat(fieldText(it, 'CRD_INFO_Y_EPSG5179') || '0');
            
            if ((!lat || !lng) && epsgX && epsgY) {
              const wgs = proj4("EPSG:5179", "EPSG:4326", [epsgX, epsgY]);
              lng = wgs[0];
              lat = wgs[1];
            }
            
            if (!lat || !lng) return null;

            const addressStr = fieldText(it, 'LCTN_WHOL_ADDR') || fieldText(it, 'rdnmadr') || fieldText(it, 'SHNT_PLACE_DTL_POSITION') || fieldText(it, 'RN_DTL_ADRES') || fieldText(it, 'RDNMADR') || fieldText(it, 'lnmadr') || fieldText(it, 'LNMADR') || fieldText(it, 'dtlAdres') || fieldText(it, 'ronAdres') || fieldText(it, 'adres') || '주소 미상';
            
            let district = '전체';
            const addressTokens = addressStr.split(' ');
            const dToken = addressTokens.find((t: string) => (t.endsWith('구') || t.endsWith('군')) && !t.includes('광역시') && !t.includes('특별시'));
            if (dToken) district = dToken;

            return {
              name: fieldText(it, 'FCLT_NM') || fieldText(it, 'fcltNm') || fieldText(it, 'SHNT_PLACE_NM') || fieldText(it, 'shltNm') || fieldText(it, 'SHLT_NM') || fieldText(it, 'fclt_nm') || fieldText(it, 'shelter_nm') || '무명 시설',
              address: addressStr,
              type: fieldText(it, 'FCLT_SE') || fieldText(it, 'fcltSeNm') || fieldText(it, 'FCLT_SE_NM') || fieldText(it, 'shltSeNm') || fieldText(it, 'fclt_se_nm') || fieldText(it, 'shelter_type') || '대피시설',
              capacity: parseInt(fieldText(it, 'MAX_ACTC_PERNE') || fieldText(it, 'shltCo') || fieldText(it, 'PSBL_NMPR') || fieldText(it, 'atchPrsnCo') || fieldText(it, 'acmPrsnCo') || fieldText(it, 'ACMP_PRSN_CO') || fieldText(it, 'acmp_prsn_co') || '0') || 0,
              lat,
              lng,
              category: activeCategory,
              district,
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
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : '시설 데이터를 불러올 수 없습니다.');
    }
    setLoading(false);
  }, [city, activeCategory, userPos, isFireWater, isBuilding, filterDistrict]);

  useEffect(() => { loadShelterData(); }, [loadShelterData]);

  // 카카오맵 초기화 — 대피소 카테고리에서만 사용
  useEffect(() => {
    if (isFireWater || isBuilding || loading || apiError) return;
    
    // SDK가 아직 준비되지 않았다면 로드
    if (!window.kakao || !window.kakao.maps) {
      loadKakaoMapSDK().then(() => setSdkReady(true)).catch(console.error);
      return; // 다시 렌더링될 때까지 대기
    }
    
    const mapContainer = mapRef.current;
    if (!mapContainer) return;
    
    window.kakao.maps.load(() => {
      const cityCenter = cityCenters[city] || cityCenters.seoul;
      const center = new window.kakao.maps.LatLng(cityCenter.lat, cityCenter.lng);

      if (kakaoMap && mapContainer.hasChildNodes()) {
        kakaoMap.panTo(center);
        return;
      }

      mapContainer.innerHTML = ''; // 기존 맵 초기화
      
      const map = new window.kakao.maps.Map(mapContainer, { center, level: 8 });
      setKakaoMap(map);

      if (userPos) {
        new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(userPos.lat, userPos.lng),
          map,
          title: '현재 위치',
        });
      }
    });
  }, [city, userPos, isFireWater, isBuilding, loading, apiError, kakaoMap, sdkReady]);

  const selectFacility = useCallback((facility: FacilityItem) => {
    onViewStateChange({ selectedKey: facilityItemKey(facility) });
  }, [onViewStateChange]);

  // 마커 업데이트 (대피소용)
  useEffect(() => {
    if (isFireWater || isBuilding || !kakaoMap || !window.kakao) return;
    
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const visible = facilities.filter(f =>
      (filterDistrict === '전체' || f.district === filterDistrict) &&
      (!filter || f.name.includes(filter) || f.address.includes(filter))
    ).slice(0, 200);

    visible.forEach(fac => {
      const pos = new window.kakao.maps.LatLng(fac.lat, fac.lng);
      
      // 마커 아이콘 설정 (기본은 파란색, 타입에 따라 다르게)
      let imageSrc = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png"; // 기본 별 마커 설정
      const imageSize = new window.kakao.maps.Size(24, 35);
      
      if (fac.category === 'restrooms') {
        const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1e88e5"><path d="M12 2c-3.3 0-6 2.7-6 6v3h2V8c0-2.2 1.8-4 4-4s4 1.8 4 4v3h2V8c0-3.3-2.7-6-6-6zm-1 14h2v6h-2zM8 12c-1.1 0-2 .9-2 2v6h2v-6h4v6h2v-6c0-1.1-.9-2-2-2H8z"/></svg>`;
        imageSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markerSvg);
      } else if (fac.category === 'tsunami') {
         const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#00acc1"><path d="M14.54 11.23c-1.63-.5-2.7-1.46-3.8-2.65C9.72 7.45 8.5 6.5 6 6.5s-3.72.95-4.74 2.08L2.68 7.1C4 5.76 5.58 5 8 5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65V11.23zM8 11c-2.5 0-3.72.95-4.74 2.08l1.42 1.48C6 13.24 7.58 12.5 10 12.5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65v-1.47c-1.63-.5-2.7-1.46-3.8-2.65C13.22 11.95 12 11 8 11zM10 17c-2.5 0-3.72.95-4.74 2.08l1.42 1.48C8 19.24 9.58 18.5 12 18.5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65v-1.47c-1.63-.5-2.7-1.46-3.8-2.65C15.22 17.95 14 17 10 17z"/></svg>`;
        imageSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markerSvg);
      }
      const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize);

      const marker = new window.kakao.maps.Marker({ position: pos, map: kakaoMap, title: fac.name, image: markerImage });
      
      const safeName = escapeHtml(fac.name);
      const safeAddress = escapeHtml(fac.address);
      const safeCapacity = escapeHtml(fac.capacity?.toLocaleString());
      const safeMaleToilet = escapeHtml(fac.maleToilet || 0);
      const safeFemaleToilet = escapeHtml(fac.femaleToilet || 0);
      const capacityInfo = fac.capacity && fac.capacity > 0 ? `<br/><span style="color:#333;">👥 수용 ${safeCapacity}명</span>` : '';
      const restroomInfo = fac.category === 'restrooms' ? `<br/><span style="color:#333;">🚻 남 ${safeMaleToilet} / 여 ${safeFemaleToilet} ${fac.hasBell === 'Y' ? ' (비상벨🚨)' : ''}</span>` : '';
      
      const info = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;max-width:220px;line-height:1.4;">
          <strong style="color:#1a73e8;">${safeName}</strong><br/>
          <span style="color:#666;">${safeAddress}</span>
          ${capacityInfo}${restroomInfo}
        </div>`
      });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        selectFacility(fac);
        info.open(kakaoMap, marker);
        kakaoMap.panTo(pos);
      });
      markersRef.current.push(marker);
    });
  }, [facilities, filter, isFireWater, isBuilding, kakaoMap, filterDistrict, selectFacility]);

  const handleSelectFacility = (fac: FacilityItem) => {
    selectFacility(fac);
    if (kakaoMap && window.kakao) {
      kakaoMap.panTo(new window.kakao.maps.LatLng(fac.lat, fac.lng));
      kakaoMap.setLevel(4);
    }
  };

  const filtered = facilities.filter(f =>
    (filterDistrict === '전체' || f.district === filterDistrict) &&
    (!filter || f.name.includes(filter) || f.address.includes(filter))
  );
  const selectedFacility = facilities.find(facility => facilityItemKey(facility) === viewState.selectedKey) ?? null;
  const hasQuery = filter.trim().length > 0;
  const hasDistrictFilter = filterDistrict !== '전체';
  const hasActiveFilters = hasQuery || hasDistrictFilter;
  const resetFilters = () => {
    onFilterStateChange({ query: '', district: '전체' });
    onViewStateChange({ selectedKey: null, listScrollTop: 0 });
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  useEffect(() => {
    pendingListScrollTopRef.current = viewState.listScrollTop;
    persistedListScrollTopRef.current = viewState.listScrollTop;
    const frame = window.requestAnimationFrame(() => {
      const list = facilityListRef.current;
      if (!list) return;
      list.scrollTo({
        top: Math.min(viewState.listScrollTop, Math.max(0, list.scrollHeight - list.clientHeight)),
        behavior: 'auto',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategory, city, facilities.length, filter, filterDistrict, viewState.listScrollTop]);

  useEffect(() => () => {
    if (listScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(listScrollFrameRef.current);
      listScrollFrameRef.current = null;
    }
    if (pendingListScrollTopRef.current !== persistedListScrollTopRef.current) {
      onViewStateChange({ listScrollTop: pendingListScrollTopRef.current });
    }
  }, [onViewStateChange]);

  const handleFacilityListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    pendingListScrollTopRef.current = event.currentTarget.scrollTop;
    if (listScrollFrameRef.current !== null) return;
    listScrollFrameRef.current = window.requestAnimationFrame(() => {
      listScrollFrameRef.current = null;
      persistedListScrollTopRef.current = pendingListScrollTopRef.current;
      onViewStateChange({ listScrollTop: pendingListScrollTopRef.current });
    });
  };

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
                  : isBuilding
                    ? ` | ${currentCat.desc}`
                    : !loading && !apiError ? ` | ${currentCat.label} ${filtered.length}개소` : ''
                }
                {!isFireWater && !isBuilding && userPos && ' | GPS 거리순'}
              </p>
              {freshness && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-on-surface-variant">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${
                    freshnessExpired
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                      : 'border-outline-variant/30 bg-surface-container text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-[13px]">database</span>
                    {formatFreshnessSourceDate(freshness)}
                  </span>
                  <span>생성 {formatDatasetDate(freshness.generatedAt)}</span>
                  {freshnessExpired && <span className="font-bold text-amber-400">갱신 주기 초과</span>}
                </div>
              )}
            </div>
          </div>
          {!isFireWater && !isBuilding && (
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
              type="button"
              aria-pressed={activeCategory === cat.id}
              onClick={() => onCategoryChange(cat.id)}
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
          filterState={filterState}
          onFilterStateChange={onFilterStateChange}
          viewState={viewState}
          onViewStateChange={onViewStateChange}
        />
      )}

      {/* ═══ 건축물대장 카테고리 ═══ */}
      {isBuilding && (
        <div className="mt-4">
          <BuildingView
            initialAddress={incidentAddress}
            workspace={buildingWorkspace}
            onWorkspaceChange={onBuildingWorkspaceChange}
          />
        </div>
      )}

      {/* ═══ 대피소 카테고리: 기존 지도+목록 뷰 ═══ */}
      {!isFireWater && !isBuilding && (
        <>
          {/* 구/군 필터 UI (대피소/화장실용) 항상 표시되도록 밖으로 뺌 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-lg">location_city</span>
              <h3 className="text-sm font-bold text-on-surface">지역구 구분</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={filterDistrict === '전체'}
                onClick={() => setFilterDistrict('전체')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterDistrict === '전체'
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >전체</button>
              
              {/* 동적 구/군 렌더링: 화장실은 restroomIndex 사용, 나머지는 로드된 데이터(facilities)에서 추출 */}
              {(activeCategory === 'restrooms' && restroomIndex
                  ? Object.keys(restroomIndex.districts).sort()
                  : Array.from(new Set(facilities.map(f => f.district).filter(d => Boolean(d) && d !== '전체'))).sort()
                ).map(d => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={filterDistrict === d}
                  onClick={() => setFilterDistrict(d as string)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterDistrict === d
                      ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {d} {activeCategory === 'restrooms' && restroomIndex?.districts && d ? `(${restroomIndex.districts[d as string]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* API 에러 */}
          {!loading && apiError && (
            <DataStatePanel
              tone={apiError.includes('방대하여') ? 'guidance' : 'error'}
              icon={apiError.includes('방대하여') ? 'touch_app' : 'cloud_off'}
              title={apiError.includes('방대하여') ? `${currentCat.label} 구역을 선택해 주세요` : `${currentCat.label} 정보를 불러오지 못했습니다`}
              description={apiError}
              action={apiError.includes('방대하여') ? undefined : {
                label: '다시 시도',
                icon: 'refresh',
                onClick: () => void loadShelterData(),
              }}
              className="mt-4"
            />
          )}

          {/* Warning */}
          {!loading && warning && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <span aria-hidden="true" className="material-symbols-outlined text-amber-700 dark:text-amber-300">warning</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">최신 데이터 갱신 실패</p>
                <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">{warning} 마지막으로 성공한 데이터를 표시 중입니다.</p>
              </div>
            </div>
          )}

          {/* 로딩 오버레이 (지도 위에 띄움) */}
          {loading && (
            <div role="status" aria-live="polite" className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-12">
              <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-on-surface-variant">{currentCat.label} 데이터 로딩 중...</span>
            </div>
          )}

          {/* 컨텐츠 (apiError가 없을 때만 지도 컨테이너 유지) */}
          {!apiError && (
            <div className={`space-y-4 ${loading ? 'opacity-50 mt-4 pointer-events-none' : 'mt-4'}`}>

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
                        ref={searchInputRef}
                        aria-label="시설명 또는 주소 검색"
                        type="text" placeholder="시설명 또는 주소 검색..."
                        value={filter} onChange={e => setFilter(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest py-2 pl-9 pr-12 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      {hasQuery && (
                        <button
                          type="button"
                          aria-label="시설 검색어 지우기"
                          onClick={() => {
                            setFilter('');
                            window.requestAnimationFrame(() => searchInputRef.current?.focus());
                          }}
                          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span role="status" aria-live="polite" className="text-[10px] text-on-surface-variant">{filtered.length}개 시설</span>
                      {userPos && <span className="text-[10px] text-primary">📍 거리순 정렬</span>}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <DataStatePanel
                      icon={hasActiveFilters ? 'search_off' : 'location_off'}
                      title={hasActiveFilters ? '검색·필터 결과가 없습니다' : '표시할 시설 데이터가 없습니다'}
                      description={hasActiveFilters
                        ? <>{hasQuery && <><strong className="text-on-surface">‘{filter.trim()}’</strong> 검색어</>}{hasQuery && hasDistrictFilter ? '와 ' : ''}{hasDistrictFilter && <><strong className="text-on-surface">{filterDistrict}</strong> 지역 필터</>}에 맞는 시설이 없습니다.</>
                        : '다른 지역이나 시설 종류를 선택해 확인해 주세요.'}
                      action={hasActiveFilters ? { label: '검색·필터 초기화', icon: 'restart_alt', onClick: resetFilters } : undefined}
                      className="m-4 border-0 bg-transparent"
                    />
                  ) : (
                    <div
                      ref={facilityListRef}
                      onScroll={handleFacilityListScroll}
                      className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10"
                    >
                      {filtered.slice(0, 100).map((fac, index) => (
                        <button
                          key={`${facilityItemKey(fac)}:${index}`}
                          type="button"
                          aria-pressed={facilityItemKey(fac) === viewState.selectedKey}
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
                                {fac.capacity !== undefined && fac.capacity > 0 && (
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
                    {selectedFacility.capacity !== undefined && selectedFacility.capacity > 0 && (
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
                <button
                  type="button"
                  aria-label="선택한 시설 닫기"
                  onClick={() => onViewStateChange({ selectedKey: null })}
                  className="p-1 rounded-lg hover:bg-surface-container transition-colors">
                  <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
