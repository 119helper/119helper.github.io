import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import './index.css';
import GlobalSearch from './components/GlobalSearch';
import SettingsModal from './components/SettingsModal';
import ErrorBoundary from './components/ErrorBoundary';
import { fetchFireWaterFacilities, fetchCityIndex, isSplitCity } from './services/fireWaterApi';
import type { CityIndex } from './services/fireWaterApi';
import { getUltraShortNow, parseCurrentWeather, CITY_GRIDS } from './services/weatherApi';
import { getRealtimeAirQuality } from './services/airQualityApi';
import type { FireFacility } from './data/mockData';
import { loadNotificationSettings } from './services/notificationSettings';
import { prefetchCriticalViews } from './utils/prefetchCriticalViews';
import { fetchDisasterMsgs } from './services/disasterMsgApi';
import { loadKakaoMapSDK } from './utils/kakaoLoader';

import { BOTTOM_TABS, NAV_ITEMS, cityNames, getTabLabel } from './app/navigation';
import { renderTabRoute, type RouteContext } from './app/routes';
import { buildTabHash, readTabLocation } from './app/tabHash';
import { isTabId } from './types/navigation';
import type { ShelterCategory, TabId, NavigateTarget } from './types/navigation';
type GpsStatus = 'loading' | 'granted' | 'denied' | 'idle' | 'unsupported';
type LocationNoticeKind = 'info' | 'warning';
interface KakaoRegionResult {
  region_type?: string;
  region_1depth_name: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
}

// 알림 시스템 타입
interface Notification {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  message: string;
  timestamp: Date;
  isNew: boolean;
}

const KAKAO_REGION_TO_CITY: Record<string, string> = {
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

const SUPPORTED_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
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

const MAX_FALLBACK_DISTANCE_KM = 30;

function formatTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function getSafeRefreshInterval() {
  const raw = Number.parseInt(localStorage.getItem('119helper-refresh') || '5', 10);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return raw;
}

function getDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const toRad = (degree: number) => degree * Math.PI / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestSupportedCity(latitude: number, longitude: number) {
  const current = { lat: latitude, lng: longitude };
  return Object.entries(SUPPORTED_CITY_COORDS).reduce(
    (nearest, [key, coords]) => {
      const distanceKm = getDistanceKm(current, coords);
      return distanceKm < nearest.distanceKm ? { key, distanceKm } : nearest;
    },
    { key: 'seoul', distanceKm: Number.POSITIVE_INFINITY }
  );
}

async function resolveCityByKakao(latitude: number, longitude: number) {
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

function TabLoading({ label }: { label: string }) {
  return (
    <div className="min-h-[280px] flex items-center justify-center text-on-surface-variant">
      <div className="flex items-center gap-3 rounded-lg bg-surface-container px-4 py-3">
        <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
        <span className="text-sm font-bold">{label} 불러오는 중</span>
      </div>
    </div>
  );
}

/* ─────────── Main App ─────────── */
export default function App() {
  // #tab 해시 또는 ?tab= 파라미터로 시작 탭 지정 가능 (manifest 바로가기 '/?tab=wildfire' 등)
  const initialRoute = readTabLocation();
  const [activeTab, setActiveTab] = useState<TabId>(initialRoute.tab);
  const [activeSubId, setActiveSubId] = useState<string | undefined>(initialRoute.subId);
  const [city, setCity] = useState<string>(() => localStorage.getItem('119helper-city') || 'seoul');
  const [fireFacilities, setFireFacilities] = useState<FireFacility[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  const [cityIndex, setCityIndex] = useState<CityIndex | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [shelterCategory, setShelterCategory] = useState<ShelterCategory>(initialRoute.shelterCategory ?? 'building');
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [locationNotice, setLocationNotice] = useState<{ kind: LocationNoticeKind; message: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['group-monitoring']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(getSafeRefreshInterval);
  const lastRefreshRef = useRef<Date>(new Date());
  const refreshSeqRef = useRef(0);
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 오프라인 대비: 핵심 화면(계산기·매뉴얼·타이머 등) 청크 사전 로드
  useEffect(() => {
    prefetchCriticalViews();
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const next = readTabLocation();
      setActiveTab(next.tab);
      setActiveSubId(next.subId);
      if (next.tab === 'shelter') {
        setShelterCategory(next.shelterCategory ?? 'building');
      }
    };

    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  useEffect(() => {
    const nextHash = buildTabHash(activeTab, activeSubId, shelterCategory);
    if (window.location.hash === nextHash) return;

    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
  }, [activeTab, activeSubId, shelterCategory]);

  // ─── 테마 시스템 ───
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('119helper-theme');
    if (saved && saved !== 'system') return saved;
    // 시스템 설정 자동 감지 → dark/light로 즉시 결정
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleThemeChange = useCallback((t: string) => {
    setTheme(t);
    localStorage.setItem('119helper-theme', t);
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(event.target as Node)) {
        setRegionOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
      if (notiRef.current && !notiRef.current.contains(event.target as Node)) {
        setNotiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // GPS 자동 감지
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unsupported');
      setLocationNotice({ kind: 'warning', message: '이 브라우저에서는 위치 자동감지를 지원하지 않습니다. 상단 지역 선택에서 직접 지역을 지정하세요.' });
      return;
    }
    const saved = localStorage.getItem('119helper-city');
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
  }, []);

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    localStorage.setItem('119helper-city', newCity);
    setGpsStatus('idle');
    setLocationNotice(null);
    setSelectedDistrict(null);
    setCityIndex(null);
    setFireFacilities([]);
  };

  const addNotification = useCallback((id: string | undefined, icon: string, iconColor: string, title: string, message: string) => {
    setNotifications(prev => {
      // Deduplicate if custom ID is provided and already exists, or same title+msg exists recently
      if (id && prev.some(n => n.id === id)) return prev;
      if (!id && prev.some(n => n.title === title && n.message === message)) return prev;
      
      const newNoti: Notification = {
        id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        icon, iconColor, title, message,
        timestamp: new Date(),
        isNew: true,
      };
      const updated = [newNoti, ...prev].slice(0, 50); // Keep max 50
      return updated;
    });
  }, []);

  // 소방용수 원시 데이터 → FireFacility 파싱 헬퍼
  const parseItems = useCallback((items: Awaited<ReturnType<typeof fetchFireWaterFacilities>>) => {
    return items.map((item, idx) => {
      let status: '정상' | '점검필요' | '고장' = '정상';
      if (item.insptnSttusNm?.includes('고장')) status = '고장';
      else if (item.insptnSttusNm?.includes('점검')) status = '점검필요';

      const kindRaw = item.fcltyKndNm || item.fcltySeNm || item.fcltyTyNm || '';
      let type: '소화전' | '급수탑' | '저수조' | '비상소화장치' = '소화전';
      if (kindRaw.includes('급수탑')) type = '급수탑';
      else if (kindRaw.includes('저수조')) type = '저수조';
      else if (kindRaw.includes('비상소화장치')) type = '비상소화장치';

      return {
        id: item.fcltyNo || item.fcltyNm || `FW-${idx}`,
        type,
        address: item.rdnmadr || item.lnmadr || '주소 미상',
        lat: parseFloat(item.latitude || '0'),
        lng: parseFloat(item.longitude || '0'),
        district: item.signguNm || '알수없음',
        status
      } as FireFacility;
    }).filter(i => i.lat > 0 && i.lng > 0);
  }, []);

  // 구별 데이터 로드 (분할 도시 전용)
  const loadDistrict = useCallback((district: string) => {
    setSelectedDistrict(district);
  }, []);

  // 데이터 갱신 함수
  const refreshData = useCallback(async () => {
    const seq = ++refreshSeqRef.current;

    // 소방용수 — 분할 도시는 메타(index)만, 비분할 도시는 전체 로드
    setIsLoadingFacilities(true);
    try {
      if (isSplitCity(city)) {
        const idx = await fetchCityIndex(city);
        if (seq !== refreshSeqRef.current) return;
        setCityIndex(idx);
        if (selectedDistrict) {
          const items = await fetchFireWaterFacilities(city, selectedDistrict);
          if (seq !== refreshSeqRef.current) return;
          setFireFacilities(parseItems(items));
        } else {
          setFireFacilities([]);
        }
      } else {
        setCityIndex(null);
        setSelectedDistrict(null);
        const items = await fetchFireWaterFacilities(city);
        if (seq !== refreshSeqRef.current) return;
        setFireFacilities(parseItems(items));
      }
    } catch (e) {
      console.warn('[refreshData facilities] failed:', e);
      addNotification('system-data-refresh-failed', 'warning', 'text-amber-500', '데이터 갱신 실패', '일부 현장 데이터가 최신 상태가 아닐 수 있습니다.');
    } finally {
      if (seq === refreshSeqRef.current) {
        setIsLoadingFacilities(false);
      }
    }

    if (seq !== refreshSeqRef.current) return;

    // 기상 알림 생성
    const ns = loadNotificationSettings();

    if (ns.enabled && ns.weather.enabled) {
      try {
        const grid = CITY_GRIDS[city] || CITY_GRIDS.seoul;
        const items = await getUltraShortNow(grid.nx, grid.ny);
        if (seq !== refreshSeqRef.current) return;
        if (items.length > 0) {
          const w = parseCurrentWeather(items);
          if (ns.weather.rain && w.precipType !== '없음' && w.precipType !== '눈') {
            addNotification(undefined, 'rainy', 'text-blue-400', `🌧️ ${cityNames[city]} 강수 감지`, `현재 ${w.precipType} 관측 중. 풍속 ${w.windSpeed}m/s (${w.windDirection})`);
          }
          if (ns.weather.snow && w.precipType === '눈') {
            addNotification(undefined, 'weather_snowy', 'text-cyan-300', `❄️ ${cityNames[city]} 적설 감지`, `현재 눈 관측 중. 풍속 ${w.windSpeed}m/s`);
          }
          if (ns.weather.heatwave && w.temperature >= ns.weather.heatwaveThreshold) {
            addNotification(undefined, 'thermostat', 'text-red-400', `🥵 ${cityNames[city]} 폭염 주의`, `현재 기온 ${w.temperature}°C. 현장 활동 시 열사병 주의!`);
          }
          if (ns.weather.coldwave && w.temperature <= ns.weather.coldwaveThreshold) {
            addNotification(undefined, 'ac_unit', 'text-cyan-400', `🥶 ${cityNames[city]} 한파 주의`, `현재 기온 ${w.temperature}°C. 소화전 동파 점검 필요.`);
          }
          if (ns.weather.strongWind && parseFloat(String(w.windSpeed)) >= ns.weather.windThreshold) {
            addNotification(undefined, 'air', 'text-teal-400', `💨 ${cityNames[city]} 강풍 주의`, `풍속 ${w.windSpeed}m/s (${w.windDirection}). 사다리차 운행 주의!`);
          }
        }
      } catch (e) {
        console.warn('[weather notification] failed:', e);
      }
    }

    // 대기질 알림 생성
    if (ns.enabled && ns.airQuality.enabled) {
      try {
        const aq = await getRealtimeAirQuality(cityNames[city] || '서울');
        if (seq !== refreshSeqRef.current) return;
        if (aq) {
          if (ns.airQuality.pm10Bad && parseInt(aq.pm10Grade) >= 3) {
            addNotification(undefined, 'masks', 'text-yellow-400', `⚠️ ${cityNames[city]} 미세먼지 나쁨`, `PM10: ${aq.pm10Value}μg/m³. 현장 활동 시 방진마스크 착용 권장.`);
          }
          if (ns.airQuality.pm25Bad && parseInt(aq.pm25Grade || '0') >= 3) {
            addNotification(undefined, 'blur_circular', 'text-orange-400', `⚠️ ${cityNames[city]} 초미세먼지 나쁨`, `PM2.5: ${aq.pm25Value}μg/m³. 호흡기 보호구 착용 필수.`);
          }
        }
      } catch (e) {
        console.warn('[air quality notification] failed:', e);
      }
    }

    // 재난 문자 및 산불 알림 생성
    if (ns.enabled && (ns.disaster.enabled || ns.wildfire.enabled)) {
      try {
        const msgs = await fetchDisasterMsgs();
        if (seq !== refreshSeqRef.current) return;
        if (msgs && msgs.length > 0) {
          // 최신순으로 정렬된 데이터를 과거 데이터부터 처리하여 가장 최신이 마지막에 오도록 (상단에 위치하도록)
          [...msgs].reverse().forEach(msg => {
            const kname = cityNames[city];
            if (msg.location_name.includes(kname) || msg.location_name.includes('전국')) {
              const text = msg.msg || '';
              
              // 산불 로직
              if (ns.wildfire.enabled && text.includes('산불')) {
                if (ns.wildfire.newFire && text.includes('발생')) {
                  addNotification(`${msg.md101_sn}-wildfire`, 'whatshot', 'text-orange-500', `🔥 ${kname} 산불 발생`, text);
                } else if (ns.wildfire.levelChange) {
                  addNotification(`${msg.md101_sn}-wildfire`, 'trending_up', 'text-red-500', `🔥 ${kname} 산불 주의/경보`, text);
                }
              }

              // 재난 문자 로직
              if (ns.disaster.enabled) {
                const isEmergency = msg.msgType?.includes('긴급') || text.includes('지진') || text.includes('대피');
                if (isEmergency && ns.disaster.emergencyAll) {
                  addNotification(`${msg.md101_sn}-disaster`, 'emergency', 'text-red-600', `🚨 ${kname} 긴급재난문자`, text);
                } else if (!isEmergency && ns.disaster.safetyAlert && !text.includes('산불')) {
                  addNotification(`${msg.md101_sn}-safety`, 'health_and_safety', 'text-amber-500', `📣 ${kname} 안전안내문자`, text);
                }
              }
            }
          });
        }
      } catch (e) {
        console.warn('[disaster notification] failed:', e);
      }
    }

    if (seq === refreshSeqRef.current) {
      lastRefreshRef.current = new Date();
    }
  }, [city, selectedDistrict, parseItems, addNotification]);

  // 최초 + city 변경 시 데이터 로드
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // refreshInterval 자동 갱신
  useEffect(() => {
    if (refreshInterval <= 0) return; // 수동 갱신
    const id = setInterval(() => {
      refreshData();
    }, refreshInterval * 60 * 1000);
    return () => clearInterval(id);
  }, [refreshInterval, refreshData]);

  // localStorage 변경 감지 (설정 저장 시)
  useEffect(() => {
    const handleStorage = () => {
      const val = getSafeRefreshInterval();
      setRefreshInterval(val);
    };
    window.addEventListener('storage', handleStorage);
    // 같은 탭에서도 감지하기 위해 폴링
    const pollId = setInterval(() => {
      const val = getSafeRefreshInterval();
      setRefreshInterval(prev => prev !== val ? val : prev);
    }, 2000);
    return () => { window.removeEventListener('storage', handleStorage); clearInterval(pollId); };
  }, []);

  const handleNavigate = (tab: NavigateTarget | string, subId?: string) => {
    // hydrants/waterTowers/building → shelter 탭으로 통합 매핑
    if (tab === 'hydrants' || tab === 'waterTowers' || tab === 'building') {
      setShelterCategory(tab as ShelterCategory);
      setActiveTab('shelter');
    } else if (tab === 'shelter' && subId) {
      setShelterCategory(subId as ShelterCategory);
      setActiveTab('shelter');
    } else if (isTabId(tab)) {
      setActiveTab(tab);
    } else {
      setActiveTab('dashboard');
    }
    setActiveSubId(subId);
    setSidebarOpen(false);
    // 탭 이동 시 맨 위로 스크롤
    setTimeout(() => scrollToTop(false), 50);
  };

  const handleScroll = () => {
    if (mainScrollRef.current) {
      setShowScrollTop(mainScrollRef.current.scrollTop > 300);
    }
  };

  const scrollToTop = (smooth = true) => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  };

  const routeContext: RouteContext = {
    activeSubId,
    city,
    cityLabel: cityNames[city],
    fireFacilities,
    isLoadingFacilities,
    cityIndex,
    selectedDistrict,
    shelterCategory,
    onDistrictChange: loadDistrict,
    onNavigate: handleNavigate,
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-on-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-outline-variant/20
        transform transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-on-surface font-headline">119 Helper</h1>
          </div>
          <p className="text-xs text-on-surface-variant font-medium">소방관 도우미</p>
        </div>
        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map(item => {
            const hasSub = !!item.subItems;
            const isExpanded = expandedGroups.includes(item.id);
            const isGroupActive = hasSub && item.subItems?.some(sub => sub.id === activeTab);
            
            return (
              <div key={item.id} className="mb-1">
                <button
                  onClick={() => {
                    if (hasSub) {
                      setExpandedGroups(prev => 
                        prev.includes(item.id) ? prev.filter(g => g !== item.id) : [...prev, item.id]
                      );
                    } else {
                      handleNavigate(item.id as TabId);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left ${
                    !hasSub && activeTab === item.id
                      ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                      : isGroupActive && !isExpanded
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-high/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined text-xl transition-colors`}
                      style={(!hasSub && activeTab === item.id) || isGroupActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {item.icon}
                    </span>
                    <span className={`font-medium ${hasSub ? 'text-sm font-bold' : 'text-sm'}`}>{item.label}</span>
                  </div>
                  {hasSub && (
                    <span className={`material-symbols-outlined text-xl transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  )}
                </button>
                
                {hasSub && (
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pl-4 pr-0 space-y-0.5">
                      {item.subItems!.map(sub => {
                        const isSubActive = activeTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => handleNavigate(sub.id as TabId)}
                            className={`w-full flex items-center px-4 py-2.5 rounded-lg transition-all text-sm ${
                              isSubActive
                                ? 'bg-primary/15 text-primary font-bold'
                                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Sub item bullet point */}
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isSubActive ? 'bg-primary' : 'bg-transparent border border-on-surface-variant/40'}`} />
                              <span>{sub.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-4 border-t border-outline-variant/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">person</span>
          </div>
          <div>
            <p className="text-sm font-bold text-on-surface">소방관</p>
            <p className="text-[10px] text-on-surface-variant">사용자</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Bar */}
        <header className="h-14 bg-surface-container-lowest flex items-center justify-between px-4 md:px-6 border-b border-outline-variant/20 shrink-0 gap-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-surface-container transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl">menu</span>
            </button>

            <h2 className="text-sm font-bold text-on-surface font-headline capitalize shrink-0 hidden sm:block">
              {getTabLabel(activeTab)}
            </h2>

            {/* Search */}
            <GlobalSearch onNavigate={handleNavigate} />
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* 📍 Global Location Selector (Custom Beautiful Dropdown) */}
            <div className="relative" ref={regionRef}>
              <button 
                onClick={() => setRegionOpen(!regionOpen)}
                title={locationNotice?.message || `현재 지역: ${cityNames[city]}`}
                className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <span className={`material-symbols-outlined text-sm ${gpsStatus === 'unsupported' || gpsStatus === 'denied' ? 'text-amber-500' : 'text-primary'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {gpsStatus === 'granted' ? 'my_location' : gpsStatus === 'loading' ? 'location_searching' : gpsStatus === 'unsupported' || gpsStatus === 'denied' ? 'location_disabled' : 'location_on'}
                </span>
                <span className="text-on-surface text-sm font-bold pr-1">{cityNames[city]}</span>
                <span className={`material-symbols-outlined text-on-surface-variant text-xs hidden sm:inline transition-transform duration-200 ${regionOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              
              {regionOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden z-50 animate-slide-in-top">
                  {locationNotice && (
                    <div className={`m-1 rounded-lg px-3 py-2 text-[11px] leading-4 ${
                      locationNotice.kind === 'warning'
                        ? 'bg-amber-500/10 text-on-surface'
                        : 'bg-primary/10 text-on-surface'
                    }`}>
                      {locationNotice.message}
                    </div>
                  )}
                  <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col p-1">
                    {Object.entries(cityNames).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => { handleCityChange(k); setRegionOpen(false); }}
                        className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors rounded-lg ${
                          city === k 
                            ? 'bg-primary/20 text-primary font-bold' 
                            : 'text-on-surface hover:bg-surface-container-highest font-medium'
                        }`}
                      >
                        {v}
                        {city === k && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <div className="relative" ref={notiRef}>
              <button 
                onClick={() => setNotiOpen(!notiOpen)}
                className={`p-1.5 rounded-lg transition-colors ${notiOpen ? 'bg-surface-container-high' : 'hover:bg-surface-container'}`}
              >
                <span className="material-symbols-outlined text-on-surface-variant text-xl">notifications</span>
                {notifications.some(n => n.isNew) && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full block animate-pulse"></span>
                )}
              </button>
              
              {notiOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 p-2">
                  <div className="bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-xl w-[320px] overflow-hidden animate-slide-in-top">
                    <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container">
                      <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-[18px]">notifications_active</span>
                        최근 알림
                      </h2>
                      {notifications.filter(n => n.isNew).length > 0 && (
                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                          New {notifications.filter(n => n.isNew).length}
                        </span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar flex flex-col p-2 space-y-1">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center">
                          <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl">notifications_off</span>
                          <p className="text-xs text-on-surface-variant/60 mt-2">알림이 없습니다</p>
                          <p className="text-[10px] text-on-surface-variant/40 mt-1">기상 이변, 미세먼지 등 감지 시 자동 알림</p>
                        </div>
                      ) : (
                        notifications.map(noti => (
                          <div key={noti.id} className={`p-3 rounded-xl transition-colors ${noti.isNew ? 'bg-primary/5 border border-primary/10' : 'hover:bg-surface-container-highest'}`}>
                            <div className="flex items-start gap-3">
                              <span className={`material-symbols-outlined ${noti.iconColor} text-xl mt-0.5`}>{noti.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-on-surface">{noti.title}</p>
                                <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{noti.message}</p>
                                <p className="text-[10px] text-on-surface-variant/70 mt-2 font-mono">
                                  {formatTimeAgo(noti.timestamp)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="p-2 border-t border-outline-variant/20 bg-surface-container/50 flex gap-1">
                      <button 
                        onClick={() => setNotifications(prev => prev.map(n => ({ ...n, isNew: false })))}
                        className="flex-1 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        모두 읽음
                      </button>
                      <button 
                        onClick={() => setNotifications([])}
                        className="flex-1 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors"
                      >
                        전체 삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg hover:bg-surface-container transition-colors"
              title={`현재: ${theme === 'dark' ? '다크' : '라이트'} 모드`}
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >{theme === 'dark' ? 'dark_mode' : 'light_mode'}</span>
            </button>

            {/* Settings */}
            <div className="relative hidden sm:block" ref={settingsRef}>
              <button 
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'bg-surface-container-high' : 'hover:bg-surface-container'}`}
              >
                <span className="material-symbols-outlined text-on-surface-variant text-xl">settings</span>
              </button>
              <SettingsModal 
                isOpen={settingsOpen} 
                onClose={() => setSettingsOpen(false)} 
                city={city}
                onCityChange={handleCityChange}
                cityNames={cityNames}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto custom-scrollbar relative"
          ref={mainScrollRef}
          onScroll={handleScroll}
        >
          {locationNotice && (
            <div className="px-4 pt-4 md:px-6">
              <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                locationNotice.kind === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-primary/20 bg-primary/10 text-on-surface'
              }`}>
                <span className={`material-symbols-outlined text-xl ${locationNotice.kind === 'warning' ? 'text-amber-400' : 'text-primary'}`}>
                  {locationNotice.kind === 'warning' ? 'warning' : 'my_location'}
                </span>
                <p className="leading-6">{locationNotice.message}</p>
              </div>
            </div>
          )}
          <div className="p-4 md:p-6 lg:pb-6 min-h-full flex flex-col">
            <div className="flex-1">
              <ErrorBoundary
                resetKey={activeTab}
                fallbackTitle={`${getTabLabel(activeTab)} 화면 오류`}
                fallbackDescription="이 탭에서 오류가 발생했습니다. 왼쪽 메뉴나 하단 탭으로 다른 기능은 계속 사용할 수 있습니다."
              >
                <Suspense fallback={<TabLoading label={getTabLabel(activeTab)} />}>
                  {renderTabRoute(activeTab, routeContext)}
                </Suspense>
              </ErrorBoundary>
            </div>
            {/* Mobile Nav Spacer - Guaranteed to add scroll space at the bottom */}
            <div className="h-[72px] lg:hidden w-full shrink-0" />
            <div className="safe-area-bottom w-full shrink-0" />
          </div>
        </div>

        {/* Scroll To Top FAB */}
        <button
          onClick={() => scrollToTop()}
          className={`fixed right-5 bottom-24 lg:right-10 lg:bottom-12 z-[9999] p-4 rounded-full bg-primary text-on-primary shadow-2xl hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-300 transform flex items-center justify-center ${
            showScrollTop ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-16 opacity-0 scale-75 pointer-events-none'
          }`}
          aria-label="맨 위로 가기"
        >
          <span className="material-symbols-outlined text-[28px] font-black">arrow_upward</span>
        </button>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-lg border-t border-outline-variant/20 safe-area-bottom">
          <div className="flex items-center justify-around h-16 px-1">
            {BOTTOM_TABS.map(tab => {
              const isActive = tab.id !== 'more' && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'more') {
                      setSidebarOpen(true);
                    } else {
                      handleNavigate(tab.id as TabId);
                    }
                  }}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
                    isActive
                      ? 'text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-xl transition-all ${isActive ? 'scale-110' : ''}`}
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {tab.icon}
                  </span>
                  <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{tab.label}</span>
                  {isActive && <span className="w-4 h-0.5 bg-primary rounded-full mt-0.5" />}
                </button>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}
