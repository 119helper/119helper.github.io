import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchCivilShelters, fetchTsunamiShelters, getStaleAt, isStaleDataError } from '../services/apiClient';
import {
  fetchRestrooms,
  fetchRestroomCityIndex,
  type RestroomCoordinateKind,
} from '../services/restroomApi';
import { getNearbyAeds } from '../services/aedApi';
import type { FireFacility } from '../data/mockData';
import {
  fetchCityIndex,
  fetchFireWaterFacilities,
  isSplitCity,
  parseFireWaterFacilities,
  type CityIndex,
} from '../services/fireWaterApi';
import FacilityList from './FacilityList';
import { loadKakaoMapSDK } from '../utils/kakaoLoader';
import { kakaoRegionToCity } from '../utils/locationResolver';
import proj4 from 'proj4';
import BuildingView from './BuildingView';
import DataStatePanel from './DataStatePanel';
import type { KakaoMapInstance, KakaoMarker } from '../types/kakao';
import type { FacilityFilterState, FacilityViewState, ShelterCategory } from '../types/navigation';
import type { BuildingWorkspaceState } from '../types/buildingWorkspace';
import type { IncidentLocation } from '../services/incidentSession';
import { formatDatasetDate, formatFreshnessSourceDate, getDatasetFreshness, isFreshnessExpired, type DatasetFreshness } from '../services/dataFreshness';
import DatasetCompletenessNotice from './DatasetCompletenessNotice';
import ResponsiveTabs from './ResponsiveTabs';
import {
  CITY_TO_STATIC_PROVINCE,
  districtFromAddress,
  normalizeGwangjuDisplayText,
  recordMatchesAppCity,
} from '../services/administrativeRegions';

// EPSG:5179 (GRS80 UTM-K) 정의 — 공공데이터포털(재난안전데이터) 최신 좌표계
proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");

interface FacilitySearchProps {
  city: string;
  // 소방용수 데이터 (App에서 전달)
  fireFacilities?: FireFacility[];
  isLoadingFacilities?: boolean;
  facilityLoadError?: string;
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
  incidentLocation?: IncidentLocation;
  buildingWorkspace: BuildingWorkspaceState;
  onBuildingWorkspaceChange: (patch: Partial<BuildingWorkspaceState>) => void;
}

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
  distanceKm?: number | null;
  phone?: string;
  managerPhone?: string;
  todayHours?: string;
  manufacturer?: string;
  model?: string;
  coordinateKind?: RestroomCoordinateKind;
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

const formatDistance = (distanceKm?: number | null) => {
  if (distanceKm === undefined || distanceKm === null || !Number.isFinite(distanceKm)) return '';
  return distanceKm < 1
    ? `${Math.max(1, Math.round(distanceKm * 1000))}m`
    : `${distanceKm.toFixed(1)}km`;
};

const ADDRESS_POINT_WARNING = '도로명주소와 건물명이 일치하는 건물 대표 좌표입니다. 실제 화장실 위치·출입구와 다를 수 있습니다.';
const UNKNOWN_COORDINATE_WARNING = '좌표 출처 유형을 확인하지 못했습니다. 현장에서 실제 위치를 다시 확인해 주세요.';

const cityIndexHasDistrict = (index: CityIndex | null, district: string) => Boolean(
  district
  && index
  && Object.prototype.hasOwnProperty.call(index.districts, district),
);

// 통합 카테고리 정의
const CATEGORIES = [
  { id: 'building', label: '건축물대장', icon: 'apartment', desc: '건축물대장 및 소방시설 현황 조회', isFireWater: false, isBuilding: true },
  { id: 'hydrants', label: '소화전', icon: 'fire_hydrant', desc: '소화전 · 비상소화장치', isFireWater: true, isBuilding: false },
  { id: 'waterTowers', label: '급수탑/저수조', icon: 'water_pump', desc: '급수탑 · 저수조', isFireWater: true, isBuilding: false },
  { id: 'civil', label: '민방위 대피시설', icon: 'shield', desc: '전시/재난 대비 지하 대피시설', isFireWater: false, isBuilding: false },
  { id: 'tsunami', label: '지진해일 대피소', icon: 'tsunami', desc: '지진해일 긴급 대피장소', isFireWater: false, isBuilding: false },
  { id: 'aed', label: '자동심장충격기', icon: 'cardiology', desc: '현재 위치 주변 AED', isFireWater: false, isBuilding: false },
  { id: 'restrooms', label: '공중화장실', icon: 'wc', desc: '공공 개방 화장실', isFireWater: false, isBuilding: false },
] as const;

export default function FacilitySearchView({
  city,
  fireFacilities = [],
  isLoadingFacilities = false,
  facilityLoadError = '',
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
  incidentLocation,
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
  const facilityRequestSeqRef = useRef(0);
  const facilityContextRef = useRef('');
  const fireWaterRequestSeqRef = useRef(0);
  const fireWaterContextRef = useRef('');
  const hasRetainedFacilityData = Boolean(apiError && facilities.length > 0);
  const hasBlockingApiError = Boolean(apiError && !hasRetainedFacilityData);
  const isGuidanceApiError = Boolean(
    apiError
    && (
      apiError.includes('방대하여')
      || apiError.startsWith('관할 공개 데이터 없음:')
    ),
  );
  const pendingListScrollTopRef = useRef(viewState.listScrollTop);
  const persistedListScrollTopRef = useRef(viewState.listScrollTop);
  const filter = filterState.query;
  const filterDistrict = filterState.district;
  const setFilter = (query: string) => {
    onFilterStateChange({ query });
    onViewStateChange({ selectedKey: null, listScrollTop: 0 });
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const [restroomIndex, setRestroomIndex] = useState<CityIndex | null>(null);
  const [restroomIndexCity, setRestroomIndexCity] = useState('');
  const [restroomIndexLoading, setRestroomIndexLoading] = useState(false);
  const [restroomIndexError, setRestroomIndexError] = useState('');
  const [restroomIndexRefreshKey, setRestroomIndexRefreshKey] = useState(0);
  const [incidentFireFacilities, setIncidentFireFacilities] = useState<FireFacility[]>([]);
  const [incidentFireWaterLoading, setIncidentFireWaterLoading] = useState(false);
  const [incidentFireWaterError, setIncidentFireWaterError] = useState('');
  const operationalPos = useMemo(
    () => incidentLocation
      ? { lat: incidentLocation.lat, lng: incidentLocation.lng }
      : userPos,
    [incidentLocation, userPos],
  );
  const incidentCity = incidentLocation?.regionName
    ? kakaoRegionToCity(incidentLocation.regionName, incidentLocation.districtName)
    : undefined;
  const incidentDistrict = incidentCity ? incidentLocation?.districtName?.trim() || '' : '';
  const dataCity = incidentCity || city;
  const dataCityLabel = cityShort[dataCity] || dataCity;
  const incidentJurisdictionOverride = Boolean(incidentCity && incidentCity !== city);
  const incidentRegionUnsupported = Boolean(incidentLocation?.regionName && !incidentCity);
  const incidentRegionUnavailable = Boolean(incidentLocation && !incidentLocation.regionName);
  const usesRegionalDataPool = activeCategory !== 'aed' && activeCategory !== 'building';
  const incidentFilterContextKey = incidentCity
    ? `${incidentCity}:${incidentDistrict}:${city}:${activeCategory}`
    : '';
  const [incidentDistrictSelection, setIncidentDistrictSelection] = useState<{
    contextKey: string;
    district: string;
  } | null>(null);
  const incidentDefaultDistrict = activeCategory === 'restrooms' && incidentDistrict
    ? incidentDistrict
    : '전체';
  const effectiveFilterDistrict = incidentFilterContextKey
    ? incidentDistrictSelection?.contextKey === incidentFilterContextKey
      ? incidentDistrictSelection.district
      : incidentDefaultDistrict
    : filterDistrict;
  const restroomRequestDistrict = activeCategory === 'restrooms'
    ? effectiveFilterDistrict
    : '전체';
  const setFilterDistrict = (district: string) => {
    if (incidentFilterContextKey) {
      setIncidentDistrictSelection({ contextKey: incidentFilterContextKey, district });
    } else {
      onFilterStateChange({ district });
    }
    onViewStateChange({ selectedKey: null, listScrollTop: 0 });
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };
  const handleContextFilterStateChange = (patch: Partial<FacilityFilterState>) => {
    if (!incidentFilterContextKey || patch.district === undefined) {
      onFilterStateChange(patch);
      return;
    }
    setIncidentDistrictSelection({
      contextKey: incidentFilterContextKey,
      district: patch.district,
    });
    const parentPatch = { ...patch };
    delete parentPatch.district;
    if (Object.keys(parentPatch).length > 0) {
      onFilterStateChange(parentPatch);
    }
  };
  const scopedIncidentDistrict = activeCategory === 'restrooms'
    ? effectiveFilterDistrict
    : incidentDistrict;
  const isDistrictScopedIncidentPool = Boolean(
    scopedIncidentDistrict
    && scopedIncidentDistrict !== '전체'
    && (
      activeCategory === 'restrooms'
      || (
        (activeCategory === 'hydrants' || activeCategory === 'waterTowers')
        && isSplitCity(dataCity)
      )
    ),
  );
  const dataPoolLabel = `${dataCityLabel}${
    isDistrictScopedIncidentPool ? ` ${scopedIncidentDistrict}` : ''
  }`;

  // 공중화장실 전용 도시 인덱스 (기존 cityIndex가 없거나 다를 경우 대비)
  useEffect(() => {
    let cancelled = false;
    if (activeCategory !== 'restrooms') {
      setRestroomIndex(null);
      setRestroomIndexCity('');
      setRestroomIndexLoading(false);
      setRestroomIndexError('');
      return () => {
        cancelled = true;
      };
    }

    setRestroomIndex(null);
    setRestroomIndexCity('');
    setRestroomIndexLoading(true);
    setRestroomIndexError('');
    fetchRestroomCityIndex(dataCity).then(idx => {
      if (cancelled) return;
      if (!idx) {
        setRestroomIndexError('공중화장실 지역 인덱스가 없습니다.');
      }
      setRestroomIndex(idx);
      setRestroomIndexCity(dataCity);
    }).catch(error => {
      if (cancelled) return;
      setRestroomIndex(null);
      setRestroomIndexCity(dataCity);
      setRestroomIndexError(error instanceof Error
        ? error.message
        : '공중화장실 지역 인덱스를 불러오지 못했습니다.');
    }).finally(() => {
      if (!cancelled) setRestroomIndexLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, dataCity, restroomIndexRefreshKey]);
  const activeRestroomIndex = restroomIndexCity === dataCity ? restroomIndex : null;

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
    getDatasetFreshness(activeCategory, dataCity).then(meta => {
      if (alive) setFreshness(meta);
    });
    return () => { alive = false; };
  }, [activeCategory, dataCity]);

  // 소방용수 카테고리인지 판단
  const isFireWater = currentCat.isFireWater;
  const isBuilding = currentCat.isBuilding;
  const useIncidentFireWater = Boolean(isFireWater && incidentCity);

  useEffect(() => {
    const seq = ++fireWaterRequestSeqRef.current;
    if (!useIncidentFireWater) {
      setIncidentFireWaterLoading(false);
      return;
    }

    const contextKey = `${dataCity}:${incidentDistrict}`;
    const contextChanged = fireWaterContextRef.current !== contextKey;
    fireWaterContextRef.current = contextKey;
    const isCurrent = () => seq === fireWaterRequestSeqRef.current;
    if (contextChanged) setIncidentFireFacilities([]);
    setIncidentFireWaterLoading(true);
    setIncidentFireWaterError('');

    const splitCity = isSplitCity(dataCity);
    if (splitCity && !incidentDistrict) {
      setIncidentFireWaterLoading(false);
      setIncidentFireWaterError('현장 구·군을 확인하지 못해 분할 소방용수 데이터를 불러오지 않았습니다.');
      return;
    }

    void (async () => {
      try {
        if (splitCity) {
          const index = await fetchCityIndex(dataCity);
          if (!isCurrent()) return;
          if (!cityIndexHasDistrict(index, incidentDistrict)) {
            setIncidentFireWaterError(
              `현장 관할 ${dataPoolLabel}와 정확히 일치하는 소방용수 분할 파일이 없습니다. `
              + '과거 행정구역 파일을 임의로 대체하지 않았습니다.',
            );
            return;
          }
        }

        const items = await fetchFireWaterFacilities(
          dataCity,
          splitCity ? incidentDistrict : undefined,
        );
        if (!isCurrent()) return;
        setIncidentFireFacilities(parseFireWaterFacilities(items));
      } catch (error) {
        if (!isCurrent()) return;
        setIncidentFireWaterError(
          error instanceof Error
            ? error.message
            : '출동 현장 소방용수 등록 데이터를 불러오지 못했습니다.',
        );
      } finally {
        if (isCurrent()) setIncidentFireWaterLoading(false);
      }
    })();

    return () => {
      fireWaterRequestSeqRef.current += 1;
    };
  }, [
    dataCity,
    dataPoolLabel,
    incidentDistrict,
    useIncidentFireWater,
  ]);

  const activeFireFacilities = useIncidentFireWater
    ? incidentFireFacilities
    : fireFacilities;
  const activeFireWaterLoading = useIncidentFireWater
    ? incidentFireWaterLoading
    : isLoadingFacilities;
  const activeFireWaterError = useIncidentFireWater
    ? incidentFireWaterError
    : facilityLoadError;

  // 소방용수: 타입별 필터링된 데이터
  const filteredFireWater = isFireWater
    ? activeCategory === 'hydrants'
      ? activeFireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치')
      : activeFireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조')
    : [];

  // 대피소/화장실 데이터 로드
  const loadShelterData = useCallback(async () => {
    const seq = ++facilityRequestSeqRef.current;
    if (isFireWater || isBuilding) {
      setLoading(false);
      return; // 소방용수/건축물대장은 자체 관리
    }
    const contextKey = [
      dataCity,
      incidentDistrict,
      activeCategory,
      restroomRequestDistrict,
      operationalPos?.lat ?? '',
      operationalPos?.lng ?? '',
    ].join(':');
    const contextChanged = facilityContextRef.current !== contextKey;
    facilityContextRef.current = contextKey;
    const isCurrent = () => seq === facilityRequestSeqRef.current;

    setLoading(true);
    setApiError(null);
    setWarning(null);
    if (contextChanged) setFacilities([]);

    if (
      activeCategory === 'restrooms'
      && (restroomIndexLoading || restroomIndexCity !== dataCity)
    ) {
      return;
    }

    try {
      let items: FacilitySourceItem[] = [];
      const ctprvnNm = CITY_TO_STATIC_PROVINCE[dataCity] || '서울특별시';

      if (activeCategory === 'aed') {
        const origin = operationalPos || cityCenters[dataCity] || cityCenters.seoul;
        const aeds = await getNearbyAeds(origin.lat, origin.lng);
        if (!isCurrent()) return;
        const staleAt = getStaleAt(aeds);
        if (staleAt) {
          setWarning(`AED 최신 조회에 실패했습니다. (${new Date(staleAt).toLocaleTimeString()} 성공)`);
        }
        setFacilities(aeds.map(aed => ({
          id: aed.id,
          name: aed.name,
          address: aed.address,
          type: aed.locationDetail,
          lat: aed.lat,
          lng: aed.lng,
          category: activeCategory,
          district: aed.district,
          distanceKm: aed.distanceKm,
          phone: aed.phone,
          managerPhone: aed.managerPhone,
          todayHours: aed.todayHours,
          manufacturer: aed.manufacturer,
          model: aed.model,
        })));
        setLoading(false);
        return;
      } else if (activeCategory === 'tsunami') {
        let rawItems: FacilitySourceItem[];
        try {
          rawItems = await fetchTsunamiShelters() as FacilitySourceItem[];
          if (!isCurrent()) return;
        } catch (e: unknown) {
          if (!isCurrent()) return;
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
          
          return recordMatchesAppCity(dataCity, ctprvn, addr1, addr2, addr3, addr4);
        });
      } else if (activeCategory === 'civil') {
        let rawItems: FacilitySourceItem[];
        try {
          rawItems = await fetchCivilShelters(ctprvnNm) as FacilitySourceItem[];
          if (!isCurrent()) return;
        } catch (e: unknown) {
          if (!isCurrent()) return;
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
          return recordMatchesAppCity(dataCity, ctprvn, addr1, addr2, addr3);
        });
      } else if (activeCategory === 'restrooms') {
        if (restroomIndexError) {
          throw new Error(restroomIndexError);
        }
        if (!restroomRequestDistrict || restroomRequestDistrict === '전체') {
          // 공중화장실의 경우 데이터가 방대하므로 구별 선택을 강제 또는 안내
          throw new Error('화장실 정보는 데이터가 방대하여 특정 구/군을 먼저 선택해야 합니다.');
        } else if (!cityIndexHasDistrict(activeRestroomIndex, restroomRequestDistrict)) {
          throw new Error(
            `관할 공개 데이터 없음: ${dataCityLabel} ${restroomRequestDistrict} 공중화장실 파일이 `
            + '현재 공개 데이터 인덱스에 포함되지 않아 임의 지역 파일을 대신 불러오지 않았습니다.',
          );
        } else {
          const rawItems = await fetchRestrooms(
            dataCity,
            restroomRequestDistrict,
            operationalPos?.lat,
            operationalPos?.lng,
          );
          if (!isCurrent()) return;
          const parsed: FacilityItem[] = rawItems.map(it => ({
            id: it.id,
            name: it.nm,
            address: it.addr,
            type: it.type,
            lat: it.lat,
            lng: it.lng,
            category: activeCategory,
            district: restroomRequestDistrict,
            hasBell: it.hasBell,
            maleToilet: it.male,
            femaleToilet: it.female,
            distanceKm: it.distance,
            coordinateKind: it.coordinateKind ?? 'unknown',
          }));
          
          // 위치 기반일 경우 가까운 50개만 잘라서 렉 방지
          const finalFacilities = operationalPos ? parsed.slice(0, 50) : parsed;
          
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

            const rawAddress = fieldText(it, 'LCTN_WHOL_ADDR') || fieldText(it, 'rdnmadr') || fieldText(it, 'SHNT_PLACE_DTL_POSITION') || fieldText(it, 'RN_DTL_ADRES') || fieldText(it, 'RDNMADR') || fieldText(it, 'lnmadr') || fieldText(it, 'LNMADR') || fieldText(it, 'dtlAdres') || fieldText(it, 'ronAdres') || fieldText(it, 'adres') || '주소 미상';
            const addressStr = dataCity === 'gwangju'
              ? normalizeGwangjuDisplayText(rawAddress, true)
              : rawAddress;
            
            const district = districtFromAddress(addressStr, dataCity);

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

        if (operationalPos) {
          parsed.sort((a, b) => {
            const dA = Math.sqrt((a.lat - operationalPos.lat) ** 2 + (a.lng - operationalPos.lng) ** 2);
            const dB = Math.sqrt((b.lat - operationalPos.lat) ** 2 + (b.lng - operationalPos.lng) ** 2);
            return dA - dB;
          });
        }

        setFacilities(parsed);
      } else {
        setFacilities([]);
      }
    } catch (e: unknown) {
      if (!isCurrent()) return;
      setApiError(e instanceof Error ? e.message : '시설 데이터를 불러올 수 없습니다.');
    }
    if (isCurrent()) setLoading(false);
  }, [
    activeCategory,
    activeRestroomIndex,
    dataCity,
    dataCityLabel,
    incidentDistrict,
    isBuilding,
    isFireWater,
    operationalPos,
    restroomIndexCity,
    restroomIndexError,
    restroomIndexLoading,
    restroomRequestDistrict,
  ]);

  useEffect(() => {
    void loadShelterData();
    return () => {
      facilityRequestSeqRef.current += 1;
    };
  }, [loadShelterData]);
  const refreshFacilityData = () => {
    if (activeCategory === 'restrooms') {
      setRestroomIndexRefreshKey(value => value + 1);
      return;
    }
    void loadShelterData();
  };

  // 카카오맵 초기화 — 대피소 카테고리에서만 사용
  useEffect(() => {
    if (isFireWater || isBuilding || loading || hasBlockingApiError) return;
    
    // SDK가 아직 준비되지 않았다면 로드
    if (!window.kakao || !window.kakao.maps) {
      loadKakaoMapSDK().then(() => setSdkReady(true)).catch(console.error);
      return; // 다시 렌더링될 때까지 대기
    }
    
    const mapContainer = mapRef.current;
    if (!mapContainer) return;
    
    window.kakao.maps.load(() => {
      const fallbackCenter = cityCenters[dataCity] || cityCenters.seoul;
      const centerPosition = operationalPos || fallbackCenter;
      const center = new window.kakao.maps.LatLng(centerPosition.lat, centerPosition.lng);

      if (kakaoMap && mapContainer.hasChildNodes()) {
        kakaoMap.panTo(center);
        return;
      }

      mapContainer.innerHTML = ''; // 기존 맵 초기화
      
      const map = new window.kakao.maps.Map(mapContainer, { center, level: 8 });
      setKakaoMap(map);

      if (operationalPos) {
        new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(operationalPos.lat, operationalPos.lng),
          map,
          title: incidentLocation ? '출동 현장' : '현재 위치',
        });
      }
    });
  }, [
    dataCity,
    operationalPos,
    incidentLocation,
    isFireWater,
    isBuilding,
    loading,
    hasBlockingApiError,
    kakaoMap,
    sdkReady,
  ]);

  const selectFacility = useCallback((facility: FacilityItem) => {
    onViewStateChange({ selectedKey: facilityItemKey(facility) });
  }, [onViewStateChange]);

  // 마커 업데이트 (대피소용)
  useEffect(() => {
    if (isFireWater || isBuilding || !kakaoMap || !window.kakao) return;
    
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const visible = facilities.filter(f =>
      (effectiveFilterDistrict === '전체' || f.district === effectiveFilterDistrict) &&
      (!filter || f.name.includes(filter) || f.address.includes(filter))
    ).slice(0, 200);

    visible.forEach(fac => {
      const pos = new window.kakao.maps.LatLng(fac.lat, fac.lng);
      const isAddressPoint = fac.category === 'restrooms' && fac.coordinateKind === 'address_point';
      const hasUnknownCoordinateKind = fac.category === 'restrooms' && fac.coordinateKind === 'unknown';
      
      // 마커 아이콘 설정 (기본은 파란색, 타입에 따라 다르게)
      let imageSrc = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png"; // 기본 별 마커 설정
      let imageSize = new window.kakao.maps.Size(24, 35);
      
      if (fac.category === 'restrooms') {
        const markerSvg = isAddressPoint
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path fill="#f59e0b" d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"/><path fill="#fff" d="M8 9h12v10H8z"/><path fill="#f59e0b" d="M10 11h3v3h-3zm5 0h3v3h-3zm-5 5h8v2h-8z"/></svg>`
          : hasUnknownCoordinateKind
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path fill="#6b7280" d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"/><text x="14" y="20" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff">?</text></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1e88e5"><path d="M12 2c-3.3 0-6 2.7-6 6v3h2V8c0-2.2 1.8-4 4-4s4 1.8 4 4v3h2V8c0-3.3-2.7-6-6-6zm-1 14h2v6h-2zM8 12c-1.1 0-2 .9-2 2v6h2v-6h4v6h2v-6c0-1.1-.9-2-2-2H8z"/></svg>`;
        imageSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markerSvg);
        if (isAddressPoint || hasUnknownCoordinateKind) {
          imageSize = new window.kakao.maps.Size(28, 36);
        }
      } else if (fac.category === 'aed') {
        const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path fill="#d32f2f" d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"/><path fill="#fff" d="M12.2 7.2h4.6l-2 5.2h3.7l-7.1 9.1 1.9-6.2H9.5z"/></svg>`;
        imageSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markerSvg);
      } else if (fac.category === 'tsunami') {
         const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#00acc1"><path d="M14.54 11.23c-1.63-.5-2.7-1.46-3.8-2.65C9.72 7.45 8.5 6.5 6 6.5s-3.72.95-4.74 2.08L2.68 7.1C4 5.76 5.58 5 8 5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65V11.23zM8 11c-2.5 0-3.72.95-4.74 2.08l1.42 1.48C6 13.24 7.58 12.5 10 12.5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65v-1.47c-1.63-.5-2.7-1.46-3.8-2.65C13.22 11.95 12 11 8 11zM10 17c-2.5 0-3.72.95-4.74 2.08l1.42 1.48C8 19.24 9.58 18.5 12 18.5s4 .76 5.32 2.1c1.1 1.19 2.17 2.15 3.8 2.65v-1.47c-1.63-.5-2.7-1.46-3.8-2.65C15.22 17.95 14 17 10 17z"/></svg>`;
        imageSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markerSvg);
      }
      const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize);

      const markerTitle = isAddressPoint
        ? `${fac.name} · 주소 대표점`
        : hasUnknownCoordinateKind
          ? `${fac.name} · 좌표 유형 미확인`
          : fac.name;
      const marker = new window.kakao.maps.Marker({ position: pos, map: kakaoMap, title: markerTitle, image: markerImage });
      
      const safeName = escapeHtml(fac.name);
      const safeAddress = escapeHtml(fac.address);
      const safeCapacity = escapeHtml(fac.capacity?.toLocaleString());
      const safeMaleToilet = escapeHtml(fac.maleToilet || 0);
      const safeFemaleToilet = escapeHtml(fac.femaleToilet || 0);
      const safeDistance = escapeHtml(formatDistance(fac.distanceKm));
      const safeHours = escapeHtml(fac.todayHours);
      const capacityInfo = fac.capacity && fac.capacity > 0 ? `<br/><span style="color:#333;">👥 수용 ${safeCapacity}명</span>` : '';
      const restroomInfo = fac.category === 'restrooms' ? `<br/><span style="color:#333;">🚻 남 ${safeMaleToilet} / 여 ${safeFemaleToilet} ${fac.hasBell === 'Y' ? ' (비상벨🚨)' : ''}</span>` : '';
      const coordinateInfo = isAddressPoint
        ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#fff7ed;color:#9a3412;"><strong>주소 대표점(근사)</strong><br/>${ADDRESS_POINT_WARNING}</div>`
        : hasUnknownCoordinateKind
          ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#f3f4f6;color:#4b5563;"><strong>좌표 유형 미확인</strong><br/>${UNKNOWN_COORDINATE_WARNING}</div>`
          : '';
      const aedInfo = fac.category === 'aed'
        ? `<br/><span style="color:#b71c1c;">⚡ ${safeDistance || '거리 미상'} · 오늘 ${safeHours || '운영시간 확인 필요'}</span>`
        : '';
      
      const info = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;max-width:220px;line-height:1.4;">
          <strong style="color:#1a73e8;">${safeName}</strong><br/>
          <span style="color:#666;">${safeAddress}</span>
          ${capacityInfo}${restroomInfo}${coordinateInfo}${aedInfo}
        </div>`
      });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        selectFacility(fac);
        info.open(kakaoMap, marker);
        kakaoMap.panTo(pos);
      });
      markersRef.current.push(marker);
    });
  }, [effectiveFilterDistrict, facilities, filter, isFireWater, isBuilding, kakaoMap, selectFacility]);

  const handleSelectFacility = (fac: FacilityItem) => {
    selectFacility(fac);
    if (kakaoMap && window.kakao) {
      kakaoMap.panTo(new window.kakao.maps.LatLng(fac.lat, fac.lng));
      kakaoMap.setLevel(4);
    }
  };

  const filtered = facilities.filter(f =>
    (effectiveFilterDistrict === '전체' || f.district === effectiveFilterDistrict) &&
    (!filter || f.name.includes(filter) || f.address.includes(filter))
  );
  const restroomAddressPointCount = activeCategory === 'restrooms'
    ? filtered.filter(facility => facility.coordinateKind === 'address_point').length
    : 0;
  const restroomUnknownCoordinateCount = activeCategory === 'restrooms'
    ? filtered.filter(facility => facility.coordinateKind === 'unknown').length
    : 0;
  const selectedFacility = facilities.find(facility => facilityItemKey(facility) === viewState.selectedKey) ?? null;
  const hasQuery = filter.trim().length > 0;
  const hasDistrictFilter = incidentFilterContextKey
    ? effectiveFilterDistrict !== incidentDefaultDistrict
    : effectiveFilterDistrict !== '전체';
  const hasActiveFilters = hasQuery || hasDistrictFilter;
  const resetFilters = () => {
    setIncidentDistrictSelection(null);
    onFilterStateChange(
      incidentFilterContextKey
        ? { query: '' }
        : { query: '', district: '전체' },
    );
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
  }, [activeCategory, dataCity, effectiveFilterDistrict, facilities.length, filter, viewState.listScrollTop]);

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
              <h2 className="ui-page-title">시설 조회</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                <span className="text-primary font-bold">{dataCityLabel}</span>
                {incidentCity ? ' 출동 관할' : ' 지역'}
                {isFireWater
                  ? ` | ${currentCat.desc}`
                  : isBuilding
                    ? ` | ${currentCat.desc}`
                    : !loading && !hasBlockingApiError ? ` | ${currentCat.label} ${filtered.length}개소` : ''
                }
                {!isFireWater && !isBuilding && operationalPos && (
                  incidentLocation
                    ? ' | 출동 현장 기준 거리순'
                    : activeCategory === 'restrooms'
                      ? ' | 표시 좌표 기준 거리순'
                      : ' | GPS 거리순'
                )}
              </p>
              {freshness && (
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-on-surface-variant">
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
                  <DatasetCompletenessNotice meta={freshness} collapsible />
                </div>
              )}
            </div>
          </div>
          {!isFireWater && !isBuilding && (
            <button
              onClick={refreshFacilityData}
              disabled={loading || restroomIndexLoading}
              className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
              <span className={`material-symbols-outlined text-lg ${
                loading || restroomIndexLoading ? 'animate-spin' : ''
              }`}>refresh</span>
              새로고침
            </button>
          )}
        </div>

        {incidentJurisdictionOverride && usesRegionalDataPool && (
          <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-primary">my_location</span>
            <p className="text-xs leading-5 text-on-surface-variant">
              관심 지역 <strong className="text-on-surface">{cityShort[city] || city}</strong> 대신 출동 현장
              {' '}<strong className="text-on-surface">{dataPoolLabel}</strong> 관할 데이터 풀을 우선 조회합니다.
              거리와 시설 목록 모두 현장 기준입니다.
            </p>
          </div>
        )}

        {incidentRegionUnsupported && usesRegionalDataPool && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-error">wrong_location</span>
            <p className="text-xs leading-5 text-on-surface-variant">
              출동 현장 <strong className="text-on-surface">{incidentLocation?.regionName}{incidentLocation?.districtName ? ` ${incidentLocation.districtName}` : ''}</strong>은 현재 시설 데이터 지원 범위 밖입니다.
              AED와 거리는 현장 좌표로 조회하지만, 지역별 목록은 관심 지역
              {' '}<strong className="text-on-surface">{cityShort[city] || city}</strong> 데이터를 대체 표시합니다.
            </p>
          </div>
        )}

        {incidentRegionUnavailable && usesRegionalDataPool && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-error">wrong_location</span>
            <p className="text-xs leading-5 text-on-surface-variant">
              GPS 좌표의 행정구역을 확인하지 못했습니다. AED와 거리는 현장 좌표로 조회하지만, 지역별 목록은 관심 지역
              {' '}<strong className="text-on-surface">{cityShort[city] || city}</strong> 데이터를 대체 표시합니다.
            </p>
          </div>
        )}

        <ResponsiveTabs
          items={CATEGORIES}
          activeId={activeCategory}
          ariaLabel="시설 분류"
          className="mt-4"
          onChange={onCategoryChange}
        />
      </div>

      {/* ═══ 소방용수 카테고리: FacilityList 임베드 ═══ */}
      {isFireWater && (
        <div className="space-y-3">
          {activeFireWaterError && (
            <div role="alert" className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-on-surface">
              <p className="font-extrabold text-error">소방용수 등록 데이터 조회 불가</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                {activeFireWaterError}
                {activeFireFacilities.length > 0
                  ? ' 화면에는 직전 성공 목록을 유지합니다.'
                  : ' 빈 목록을 시설 없음으로 판단하지 말고 관할 자료와 현장을 확인하세요.'}
              </p>
            </div>
          )}
          <FacilityList
            data={filteredFireWater}
            title={activeCategory === 'hydrants' ? '소화전 위치' : '급수탑 · 저수조 위치'}
            icon={activeCategory === 'hydrants' ? '🚒' : '💧'}
            typeLabel={currentCat.desc}
            city={dataCity}
            isLoading={activeFireWaterLoading}
            cityIndex={useIncidentFireWater ? null : cityIndex}
            selectedDistrict={useIncidentFireWater ? incidentDistrict || null : selectedDistrict}
            onDistrictChange={useIncidentFireWater ? undefined : onDistrictChange}
            filterState={incidentFilterContextKey
              ? { ...filterState, district: effectiveFilterDistrict }
              : filterState}
            onFilterStateChange={handleContextFilterStateChange}
            viewState={viewState}
            onViewStateChange={onViewStateChange}
            origin={incidentLocation ? operationalPos : null}
          />
        </div>
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
          {activeCategory === 'aed' && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4">
              <span aria-hidden="true" className="material-symbols-outlined text-red-600 dark:text-red-300">cardiology</span>
              <div>
                <p className="text-sm font-bold text-on-surface">
                  {incidentLocation
                    ? '출동 현장 기준 가까운 AED입니다.'
                    : userPos
                      ? '현재 GPS 위치 기준 가까운 AED입니다.'
                      : `${dataCityLabel} 중심 좌표 기준입니다.`}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  설치 위치와 운영시간은 기관 제공 참고정보입니다. 사용 전 현장 접근 가능 여부를 확인하고, 심정지 상황에서는 즉시 119에 신고하세요.
                </p>
              </div>
            </div>
          )}

          {/* 구/군 필터 UI (대피소/화장실용) 항상 표시되도록 밖으로 뺌 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-lg">location_city</span>
              <h3 className="text-sm font-bold text-on-surface">지역구 구분</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={effectiveFilterDistrict === incidentDefaultDistrict}
                onClick={() => setFilterDistrict(incidentDefaultDistrict)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  effectiveFilterDistrict === incidentDefaultDistrict
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {activeCategory === 'restrooms' && incidentDistrict
                  ? `현장 ${incidentDistrict}${
                    activeRestroomIndex?.districts[incidentDistrict] !== undefined
                      ? ` (${activeRestroomIndex.districts[incidentDistrict]})`
                      : ''
                  }`
                  : '전체'}
              </button>

              {/* 동적 구/군 렌더링: 화장실은 현재 도시 인덱스, 나머지는 로드된 데이터에서 추출 */}
              {(activeCategory === 'restrooms' && activeRestroomIndex
                  ? Object.keys(activeRestroomIndex.districts).sort()
                  : Array.from(new Set(facilities.map(f => f.district).filter(d => Boolean(d) && d !== '전체'))).sort()
                )
                .filter(d => !(
                  activeCategory === 'restrooms'
                  && incidentCity
                  && incidentDistrict
                  && d === incidentDistrict
                ))
                .map(d => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={effectiveFilterDistrict === d}
                  onClick={() => setFilterDistrict(d as string)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    effectiveFilterDistrict === d
                      ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {d} {activeCategory === 'restrooms' && activeRestroomIndex?.districts && d
                    ? `(${activeRestroomIndex.districts[d as string]})`
                    : ''}
                </button>
              ))}
            </div>
          </div>

          {/* API 에러 */}
          {!loading && apiError && (
            <DataStatePanel
              tone={hasRetainedFacilityData || isGuidanceApiError ? 'guidance' : 'error'}
              icon={hasRetainedFacilityData
                ? 'history'
                : apiError.startsWith('관할 공개 데이터 없음:')
                  ? 'location_off'
                  : isGuidanceApiError
                    ? 'touch_app'
                    : 'cloud_off'}
              title={hasRetainedFacilityData
                ? `${currentCat.label} 최신 갱신 실패`
                : apiError.startsWith('관할 공개 데이터 없음:')
                  ? `${currentCat.label} 관할 공개 데이터가 없습니다`
                  : isGuidanceApiError
                    ? `${currentCat.label} 구역을 선택해 주세요`
                    : `${currentCat.label} 정보를 불러오지 못했습니다`}
              description={hasRetainedFacilityData
                ? `${apiError} 화면에는 직전 성공 목록을 유지합니다.`
                : apiError}
              action={isGuidanceApiError ? undefined : {
                label: '다시 시도',
                icon: 'refresh',
                onClick: refreshFacilityData,
              }}
              className="mt-4"
            />
          )}

          {/* Warning */}
          {!loading && warning && (
            <DataStatePanel
              tone="guidance"
              icon="history"
              title="최신 데이터 갱신 실패"
              description={`${warning} 마지막으로 성공한 데이터를 표시 중입니다.`}
              className="mt-4"
            />
          )}

          {/* 로딩 오버레이 (지도 위에 띄움) */}
          {loading && (
            <DataStatePanel
              tone="loading"
              icon="progress_activity"
              title={`${currentCat.label} 데이터 확인 중`}
              description="공개 데이터와 저장된 최신 정보를 함께 확인하고 있습니다."
              className="mt-4"
            />
          )}

          {/* 같은 컨텍스트의 갱신 실패는 직전 성공 목록을 유지한다. */}
          {!hasBlockingApiError && (
            <div className={`space-y-4 ${loading ? 'opacity-50 mt-4 pointer-events-none' : 'mt-4'}`}>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* 지도 */}
              <div className="lg:col-span-7">
                <div className="relative bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
                  <div ref={mapRef} className="w-full h-[400px] lg:h-[500px]" />
                  {activeCategory === 'restrooms' && facilities.length > 0 && (
                    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/95 px-2.5 py-2 text-[10px] font-bold shadow-sm backdrop-blur-sm">
                      <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        시설 좌표
                      </span>
                      {restroomAddressPointCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                          <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-amber-500" />
                          주소 대표점 {restroomAddressPointCount}
                        </span>
                      )}
                      {restroomUnknownCoordinateCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-gray-500" />
                          유형 미확인 {restroomUnknownCoordinateCount}
                        </span>
                      )}
                    </div>
                  )}
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
                      {operationalPos && (
                        <span className="text-[10px] text-primary">
                          📍 {incidentLocation
                            ? '출동 현장 기준 거리순'
                            : activeCategory === 'restrooms'
                              ? '표시 좌표 기준 거리순'
                              : '거리순 정렬'}
                        </span>
                      )}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <DataStatePanel
                      icon={hasActiveFilters ? 'search_off' : 'location_off'}
                      title={hasActiveFilters ? '검색·필터 결과가 없습니다' : '표시할 시설 데이터가 없습니다'}
                      description={hasActiveFilters
                        ? <>{hasQuery && <><strong className="text-on-surface">‘{filter.trim()}’</strong> 검색어</>}{hasQuery && hasDistrictFilter ? '와 ' : ''}{hasDistrictFilter && <><strong className="text-on-surface">{effectiveFilterDistrict}</strong> 지역 필터</>}에 맞는 시설이 없습니다.</>
                        : activeCategory === 'aed' && incidentLocation
                          ? '출동 현장 좌표 주변에서 표시할 공개 AED를 확인하지 못했습니다. 시설 없음과 조회 실패는 구분해 관할 자료와 현장을 함께 확인하세요.'
                          : incidentCity
                          ? `출동 현장 ${dataPoolLabel} 데이터 풀에서 표시할 공개 시설을 확인하지 못했습니다. 시설 없음과 조회 실패는 구분해 관할 자료와 현장을 함께 확인하세요.`
                          : `${dataCityLabel} 데이터 풀에서 표시할 공개 시설을 확인하지 못했습니다. 다른 지역이나 시설 종류를 선택해 확인해 주세요.`}
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
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {fac.type && (
                                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                                    {fac.type}
                                  </span>
                                )}
                                {fac.category === 'restrooms' && fac.coordinateKind === 'address_point' && (
                                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                    주소 대표점
                                  </span>
                                )}
                                {fac.category === 'restrooms' && fac.coordinateKind === 'unknown' && (
                                  <span className="rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 dark:text-gray-300">
                                    좌표 유형 미확인
                                  </span>
                                )}
                                {fac.category === 'restrooms' && fac.distanceKm !== undefined && fac.distanceKm !== null && (
                                  <span className="rounded bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                                    {fac.coordinateKind === 'address_point' ? '대표점 기준 약 ' : '좌표 기준 '}
                                    {formatDistance(fac.distanceKm)}
                                  </span>
                                )}
                                {fac.capacity !== undefined && fac.capacity > 0 && (
                                  <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                                    👥 {fac.capacity.toLocaleString()}명
                                  </span>
                                )}
                                {fac.category === 'aed' && fac.distanceKm !== undefined && fac.distanceKm !== null && (
                                  <span className="text-[10px] bg-red-500/10 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                                    ⚡ {formatDistance(fac.distanceKm)}
                                  </span>
                                )}
                                {fac.category === 'aed' && fac.todayHours && (
                                  <span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                                    오늘 {fac.todayHours}
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
                  {selectedFacility.category === 'restrooms' && selectedFacility.coordinateKind === 'address_point' && (
                    <div role="note" className="mt-3 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                      <p className="font-bold">주소 대표점(근사)</p>
                      <p className="mt-0.5">{ADDRESS_POINT_WARNING}</p>
                    </div>
                  )}
                  {selectedFacility.category === 'restrooms' && selectedFacility.coordinateKind === 'unknown' && (
                    <div role="note" className="mt-3 max-w-2xl rounded-lg border border-gray-500/30 bg-gray-500/10 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
                      <p className="font-bold">좌표 유형 미확인</p>
                      <p className="mt-0.5">{UNKNOWN_COORDINATE_WARNING}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    {selectedFacility.type && (
                      <div className="text-center">
                        <p className="text-sm font-bold text-primary">{selectedFacility.type}</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {selectedFacility.category === 'aed' ? '설치 위치' : '시설유형'}
                        </p>
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
                    {selectedFacility.category === 'restrooms'
                      && selectedFacility.distanceKm !== undefined
                      && selectedFacility.distanceKm !== null && (
                        <>
                          <div className="w-px h-10 bg-outline-variant/20" />
                          <div className="text-center">
                            <p className="text-sm font-bold text-primary">
                              {selectedFacility.coordinateKind === 'address_point' ? '약 ' : ''}
                              {formatDistance(selectedFacility.distanceKm)}
                            </p>
                            <p className="text-[10px] text-on-surface-variant">
                              {selectedFacility.coordinateKind === 'address_point' ? '주소 대표점 기준' : '표시 좌표 기준'}
                            </p>
                          </div>
                        </>
                      )}
                  </div>
                  {selectedFacility.category === 'aed' && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      {selectedFacility.distanceKm !== undefined && selectedFacility.distanceKm !== null && (
                        <span className="rounded-lg bg-red-500/10 px-3 py-2 font-bold text-red-700 dark:text-red-300">
                          현재 기준 {formatDistance(selectedFacility.distanceKm)}
                        </span>
                      )}
                      <span className="rounded-lg bg-surface-container px-3 py-2 text-on-surface">
                        오늘 {selectedFacility.todayHours || '운영시간 확인 필요'}
                      </span>
                      {(selectedFacility.phone || selectedFacility.managerPhone) && (
                        <a
                          href={`tel:${selectedFacility.phone || selectedFacility.managerPhone}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 font-bold text-on-primary hover:opacity-90"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-base">call</span>
                          {selectedFacility.phone || selectedFacility.managerPhone}
                        </a>
                      )}
                      {(selectedFacility.manufacturer || selectedFacility.model) && (
                        <span className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
                          {[selectedFacility.manufacturer, selectedFacility.model].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  )}
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
