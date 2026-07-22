import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import './index.css';
import GlobalSearch from './components/GlobalSearch';
import SettingsModal from './components/SettingsModal';
import ErrorBoundary from './components/ErrorBoundary';
import AppLockGate from './components/AppLockGate';
import IncidentStatusStrip from './components/IncidentStatusStrip';
import SidebarQuickAccess from './components/SidebarQuickAccess';
import DataStatusSummary from './components/DataStatusSummary';
import { fetchFireWaterFacilities, fetchCityIndex, isSplitCity } from './services/fireWaterApi';
import type { CityIndex } from './services/fireWaterApi';
import { getUltraShortNow, parseCurrentWeather, CITY_GRIDS } from './services/weatherApi';
import { getRealtimeAirQuality } from './services/airQualityApi';
import type { FireFacility } from './data/mockData';
import { loadNotificationSettings } from './services/notificationSettings';
import { prefetchCriticalViews } from './utils/prefetchCriticalViews';
import { fetchDisasterMsgs } from './services/disasterMsgApi';
import { useNotifications, formatTimeAgo } from './hooks/useNotifications';

import { BOTTOM_TABS, INCIDENT_BOTTOM_TABS, NAV_ITEMS, cityNames, getTabLabel } from './app/navigation';
import { renderTabRoute, type RouteContext } from './app/routes';
import { buildTabHash, readTabLocation } from './app/tabHash';
import { isTabId } from './types/navigation';
import type { ShelterCategory, TabId, NavigateTarget } from './types/navigation';
import { useUserProfile } from './contexts/UserProfileContext';
import { useGeolocation } from './hooks/useGeolocation';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useIncidentSession } from './hooks/useIncidentSession';
import { useDialogAccessibility } from './hooks/useDialogAccessibility';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useUndoToast } from './contexts/UndoToastContext';
import { applyPrivacyRetention } from './services/privacySettings';
import { loadDisplaySettings, saveDisplaySettings } from './services/displaySettings';
import {
  loadNavigationPreferences,
  recordRecentNavigation,
  saveNavigationPreferences,
  setWorkPreset,
  toggleNavigationFavorite,
} from './services/navigationPreferences';

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
  const { gpsStatus, locationNotice, setGpsStatus, setLocationNotice } = useGeolocation(setCity);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['group-monitoring']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { displayName, subtitle } = useUserProfile();
  const [notiOpen, setNotiOpen] = useState(false);
  const { notifications, addNotification, markAllRead, clearAll } = useNotifications();
  const [incidentSession] = useIncidentSession();
  const [fieldReadabilityMode, setFieldReadabilityMode] = useState(() => loadDisplaySettings().fieldReadabilityMode);
  const [navPreferences, setNavPreferences] = useState(loadNavigationPreferences);
  const networkStatus = useNetworkStatus();
  const { finalizeAll: finalizeUndoActions } = useUndoToast();
  const lastRefreshRef = useRef<Date>(new Date());
  const refreshSeqRef = useRef(0);
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const fieldWakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const sidebarInteractive = isDesktopSidebar || sidebarOpen;
  const sidebarRef = useDialogAccessibility<HTMLElement>(sidebarOpen && !isDesktopSidebar, () => setSidebarOpen(false));
  const undoRouteRef = useRef(`${activeTab}:${activeSubId ?? ''}:${shelterCategory}`);

  useEffect(() => {
    const routeKey = `${activeTab}:${activeSubId ?? ''}:${shelterCategory}`;
    if (undoRouteRef.current !== routeKey) {
      finalizeUndoActions();
      undoRouteRef.current = routeKey;
    }
  }, [activeSubId, activeTab, finalizeUndoActions, shelterCategory]);

  // 오프라인 대비: 핵심 화면(계산기·매뉴얼·타이머 등) 청크 사전 로드
  useEffect(() => {
    prefetchCriticalViews();
  }, []);

  useEffect(() => {
    applyPrivacyRetention().catch(e => console.warn('[privacy retention] failed:', e));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncSidebarMode = (event: MediaQueryListEvent | MediaQueryList) => setIsDesktopSidebar(event.matches);
    syncSidebarMode(media);
    media.addEventListener('change', syncSidebarMode);
    return () => media.removeEventListener('change', syncSidebarMode);
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

  // 첫 진입 시에는 replaceState로 해시를 정규화해 불필요한 히스토리 엔트리를 만들지 않는다
  const hashInitializedRef = useRef(false);
  useEffect(() => {
    const nextHash = buildTabHash(activeTab, activeSubId, shelterCategory);
    const isFirstSync = !hashInitializedRef.current;
    hashInitializedRef.current = true;
    if (window.location.hash === nextHash) return;

    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    if (isFirstSync) {
      window.history.replaceState(null, '', nextUrl);
    } else {
      window.history.pushState(null, '', nextUrl);
    }
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

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const syncSystemTheme = () => {
      if (localStorage.getItem('119helper-theme') === 'system') {
        setTheme(media.matches ? 'light' : 'dark');
      }
    };
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-readability', fieldReadabilityMode ? 'field' : 'standard');
  }, [fieldReadabilityMode]);

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = () => {
      void fieldWakeLockRef.current?.release().catch(() => {});
      fieldWakeLockRef.current = null;
    };
    const syncWakeLock = async () => {
      if (!fieldReadabilityMode || !incidentSession.active || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) {
        releaseWakeLock();
        return;
      }
      if (fieldWakeLockRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        fieldWakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (fieldWakeLockRef.current === sentinel) fieldWakeLockRef.current = null;
        });
      } catch {
        fieldWakeLockRef.current = null;
      }
    };

    void syncWakeLock();
    document.addEventListener('visibilitychange', syncWakeLock);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', syncWakeLock);
      releaseWakeLock();
    };
  }, [fieldReadabilityMode, incidentSession.active]);

  useEffect(() => {
    saveNavigationPreferences(navPreferences);
  }, [navPreferences]);

  useEffect(() => {
    const syncDisplaySettings = () => setFieldReadabilityMode(loadDisplaySettings().fieldReadabilityMode);
    window.addEventListener('119helper-settings-updated', syncDisplaySettings);
    window.addEventListener('storage', syncDisplaySettings);
    return () => {
      window.removeEventListener('119helper-settings-updated', syncDisplaySettings);
      window.removeEventListener('storage', syncDisplaySettings);
    };
  }, []);

  const handleThemeChange = useCallback((t: string) => {
    setTheme(t);
    localStorage.setItem('119helper-theme', t);
  }, []);

  const handleFieldModeChange = useCallback((enabled: boolean) => {
    setFieldReadabilityMode(enabled);
    saveDisplaySettings({ fieldReadabilityMode: enabled });
    if (enabled) {
      setNavPreferences(previous => setWorkPreset(previous, 'incident'));
    }
    try {
      navigator.vibrate?.(enabled ? [60, 40, 60] : 40);
    } catch {
      // 진동 미지원 환경은 조용히 무시한다.
    }
    window.dispatchEvent(new Event('119helper-settings-updated'));
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

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    localStorage.setItem('119helper-city', newCity);
    setGpsStatus('idle');
    setLocationNotice(null);
    setSelectedDistrict(null);
    setCityIndex(null);
    setFireFacilities([]);
  };

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
      addNotification('system-data-refresh-failed', 'warning', 'text-amber-700 dark:text-amber-300', '데이터 갱신 실패', '일부 현장 데이터가 최신 상태가 아닐 수 있습니다.');
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
            addNotification(undefined, 'rainy', 'text-blue-700 dark:text-blue-300', `🌧️ ${cityNames[city]} 강수 감지`, `현재 ${w.precipType} 관측 중. 풍속 ${w.windSpeed}m/s (${w.windDirection})`);
          }
          if (ns.weather.snow && w.precipType === '눈') {
            addNotification(undefined, 'weather_snowy', 'text-cyan-700 dark:text-cyan-300', `❄️ ${cityNames[city]} 적설 감지`, `현재 눈 관측 중. 풍속 ${w.windSpeed}m/s`);
          }
          if (ns.weather.heatwave && w.temperature >= ns.weather.heatwaveThreshold) {
            addNotification(undefined, 'thermostat', 'text-red-700 dark:text-red-300', `🥵 ${cityNames[city]} 폭염 주의`, `현재 기온 ${w.temperature}°C. 현장 활동 시 열사병 주의!`);
          }
          if (ns.weather.coldwave && w.temperature <= ns.weather.coldwaveThreshold) {
            addNotification(undefined, 'ac_unit', 'text-cyan-700 dark:text-cyan-300', `🥶 ${cityNames[city]} 한파 주의`, `현재 기온 ${w.temperature}°C. 소화전 동파 점검 필요.`);
          }
          if (ns.weather.strongWind && parseFloat(String(w.windSpeed)) >= ns.weather.windThreshold) {
            addNotification(undefined, 'air', 'text-teal-700 dark:text-teal-300', `💨 ${cityNames[city]} 강풍 주의`, `풍속 ${w.windSpeed}m/s (${w.windDirection}). 사다리차 운행 주의!`);
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
            addNotification(undefined, 'masks', 'text-amber-700 dark:text-yellow-300', `⚠️ ${cityNames[city]} 미세먼지 나쁨`, `PM10: ${aq.pm10Value}μg/m³. 현장 활동 시 방진마스크 착용 권장.`);
          }
          if (ns.airQuality.pm25Bad && parseInt(aq.pm25Grade || '0') >= 3) {
            addNotification(undefined, 'blur_circular', 'text-orange-700 dark:text-orange-300', `⚠️ ${cityNames[city]} 초미세먼지 나쁨`, `PM2.5: ${aq.pm25Value}μg/m³. 호흡기 보호구 착용 필수.`);
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
                  addNotification(`${msg.md101_sn}-wildfire`, 'whatshot', 'text-orange-700 dark:text-orange-300', `🔥 ${kname} 산불 발생`, text);
                } else if (ns.wildfire.levelChange) {
                  addNotification(`${msg.md101_sn}-wildfire`, 'trending_up', 'text-red-700 dark:text-red-300', `🔥 ${kname} 산불 주의/경보`, text);
                }
              }

              // 재난 문자 로직
              if (ns.disaster.enabled) {
                const isEmergency = msg.msgType?.includes('긴급') || text.includes('지진') || text.includes('대피');
                if (isEmergency && ns.disaster.emergencyAll) {
                  addNotification(`${msg.md101_sn}-disaster`, 'emergency', 'text-red-700 dark:text-red-300', `🚨 ${kname} 긴급재난문자`, text);
                } else if (!isEmergency && ns.disaster.safetyAlert && !text.includes('산불')) {
                  addNotification(`${msg.md101_sn}-safety`, 'health_and_safety', 'text-amber-700 dark:text-amber-300', `📣 ${kname} 안전안내문자`, text);
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

  // 최초/도시변경 즉시 갱신 + 주기 갱신 + 설정 변경 감지 (훅이 캡슐화)
  useAutoRefresh(refreshData);

  const handleNavigate = (tab: NavigateTarget | string, subId?: string) => {
    let nextTab: TabId;
    // hydrants/waterTowers/building → shelter 탭으로 통합 매핑
    if (tab === 'hydrants' || tab === 'waterTowers' || tab === 'building') {
      setShelterCategory(tab as ShelterCategory);
      nextTab = 'shelter';
    } else if (tab === 'shelter' && subId) {
      setShelterCategory(subId as ShelterCategory);
      nextTab = 'shelter';
    } else if (isTabId(tab)) {
      nextTab = tab;
    } else {
      nextTab = 'dashboard';
    }
    setActiveTab(nextTab);
    setNavPreferences(previous => recordRecentNavigation(previous, nextTab));
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
    incidentSession,
  };
  const bottomTabs = incidentSession.active ? INCIDENT_BOTTOM_TABS : BOTTOM_TABS;

  return (
    <AppLockGate>
    <div className="flex h-[100dvh] overflow-hidden bg-background text-on-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        aria-label="전체 메뉴"
        aria-hidden={sidebarInteractive ? undefined : true}
        aria-modal={!isDesktopSidebar && sidebarOpen ? true : undefined}
        role={!isDesktopSidebar ? 'dialog' : undefined}
        inert={!sidebarInteractive}
        tabIndex={!isDesktopSidebar ? -1 : undefined}
        className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-surface-container-lowest flex flex-col shrink-0 border-r border-outline-variant/20 safe-area-top
        transform transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <span aria-hidden="true" className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-on-surface font-headline">119 Helper</h1>
              </div>
              <p className="text-xs text-on-surface-variant font-medium">소방관 도우미</p>
            </div>
            <button
              type="button"
              aria-label="전체 메뉴 닫기"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden w-11 h-11 -mr-3 -mt-3 rounded-lg text-on-surface-variant hover:bg-surface-container flex items-center justify-center"
            >
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto custom-scrollbar">
          <SidebarQuickAccess
            preferences={navPreferences}
            activeTab={activeTab}
            onNavigate={handleNavigate}
            onPresetChange={preset => setNavPreferences(previous => setWorkPreset(previous, preset))}
          />
          <p className="px-2 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-wider text-on-surface-variant">전체 메뉴</p>
          {NAV_ITEMS.map(item => {
            const hasSub = !!item.subItems;
            const isExpanded = expandedGroups.includes(item.id);
            const isGroupActive = hasSub && item.subItems?.some(sub => sub.id === activeTab);
            
            return (
              <div key={item.id} className="mb-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={hasSub ? isExpanded : undefined}
                    aria-current={!hasSub && activeTab === item.id ? 'page' : undefined}
                    onClick={() => {
                      if (hasSub) {
                        setExpandedGroups(prev =>
                          prev.includes(item.id) ? prev.filter(g => g !== item.id) : [...prev, item.id]
                        );
                      } else {
                        handleNavigate(item.id as TabId);
                      }
                    }}
                    className={`min-w-0 flex-1 flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left ${
                      !hasSub && activeTab === item.id
                        ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                        : isGroupActive && !isExpanded
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high/50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`material-symbols-outlined text-xl transition-colors`}
                        style={(!hasSub && activeTab === item.id) || isGroupActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {item.icon}
                      </span>
                      <span className={`truncate font-medium ${hasSub ? 'text-sm font-bold' : 'text-sm'}`}>{item.label}</span>
                    </div>
                    {hasSub && (
                      <span aria-hidden="true" className={`material-symbols-outlined text-xl transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    )}
                  </button>
                  {!hasSub && isTabId(item.id) && (
                    <button
                      type="button"
                      aria-label={`${item.label} ${navPreferences.favorites.includes(item.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}`}
                      aria-pressed={navPreferences.favorites.includes(item.id)}
                      onClick={() => setNavPreferences(previous => toggleNavigationFavorite(previous, item.id as TabId))}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-container-high ${
                        navPreferences.favorites.includes(item.id) ? 'text-amber-600 dark:text-amber-300' : 'text-on-surface-variant'
                      }`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-lg" style={navPreferences.favorites.includes(item.id) ? { fontVariationSettings: "'FILL' 1" } : undefined}>star</span>
                    </button>
                  )}
                </div>
                
                {hasSub && (
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pl-4 pr-0 space-y-0.5">
                      {item.subItems!.map(sub => {
                        const isSubActive = activeTab === sub.id;
                        const isFavorite = navPreferences.favorites.includes(sub.id);
                        return (
                          <div key={sub.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-current={isSubActive ? 'page' : undefined}
                              onClick={() => handleNavigate(sub.id as TabId)}
                              className={`min-w-0 flex-1 flex items-center px-4 py-2.5 rounded-lg transition-all text-sm ${
                                isSubActive
                                  ? 'bg-primary/15 text-primary font-bold'
                                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <div aria-hidden="true" className={`w-1.5 h-1.5 shrink-0 rounded-full transition-colors ${isSubActive ? 'bg-primary' : 'bg-transparent border border-on-surface-variant/40'}`} />
                                <span className="truncate">{sub.label}</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              aria-label={`${sub.label} ${isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}`}
                              aria-pressed={isFavorite}
                              onClick={() => setNavPreferences(previous => toggleNavigationFavorite(previous, sub.id))}
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-container-high ${
                                isFavorite ? 'text-amber-600 dark:text-amber-300' : 'text-on-surface-variant'
                              }`}
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-lg" style={isFavorite ? { fontVariationSettings: "'FILL' 1" } : undefined}>star</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => {
            settingsReturnFocusRef.current = menuButtonRef.current;
            setSidebarOpen(false);
            setSettingsOpen(true);
          }}
          className="w-full p-4 border-t border-outline-variant/20 flex items-center gap-3 hover:bg-surface-container/50 transition-colors text-left"
          title="내 정보 편집"
        >
          <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">person</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{displayName}</p>
            <p className="text-[10px] text-on-surface-variant truncate">{subtitle}</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-base ml-auto shrink-0">edit</span>
        </button>
      </aside>

      {/* Main */}
      <main
        aria-hidden={!isDesktopSidebar && sidebarOpen ? true : undefined}
        inert={!isDesktopSidebar && sidebarOpen}
        className="flex-1 flex flex-col overflow-hidden min-w-0"
      >
        {/* Top Bar */}
        <header className="app-header bg-surface-container-lowest flex items-center justify-between px-2 min-[360px]:px-4 md:px-6 border-b border-outline-variant/20 shrink-0 gap-1 min-[360px]:gap-2">
          <div className="flex items-center gap-1 min-[360px]:gap-3 flex-1 min-w-0">
            {/* Mobile hamburger */}
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="전체 메뉴 열기"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-11 h-11 rounded-lg hover:bg-surface-container transition-colors shrink-0 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl">menu</span>
            </button>

            <h2 className="text-sm font-bold text-on-surface font-headline capitalize shrink-0 hidden sm:block">
              {getTabLabel(activeTab)}
            </h2>

            {/* Search */}
            <GlobalSearch onNavigate={handleNavigate} />
          </div>
          <div className="flex items-center gap-1 min-[360px]:gap-2 md:gap-3 shrink-0">
            {/* 📍 Global Location Selector (Custom Beautiful Dropdown) */}
            <div className="relative" ref={regionRef}>
              <button 
                type="button"
                aria-label={`지역 선택, 현재 ${cityNames[city]}`}
                aria-expanded={regionOpen}
                onClick={() => setRegionOpen(!regionOpen)}
                title={locationNotice?.message || `현재 지역: ${cityNames[city]}`}
                className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors rounded-full px-2 min-[360px]:px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <span className={`material-symbols-outlined text-sm ${gpsStatus === 'unsupported' || gpsStatus === 'denied' ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {gpsStatus === 'granted' ? 'my_location' : gpsStatus === 'loading' ? 'location_searching' : gpsStatus === 'unsupported' || gpsStatus === 'denied' ? 'location_disabled' : 'location_on'}
                </span>
                <span className="hidden min-[360px]:inline text-on-surface text-sm font-bold pr-1">{cityNames[city]}</span>
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
                        type="button"
                        aria-current={city === k ? 'true' : undefined}
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
                type="button"
                aria-label={`최근 알림${notifications.some(n => n.isNew) ? `, 새 알림 ${notifications.filter(n => n.isNew).length}개` : ''}${networkStatus.state !== 'online' ? `, 데이터 ${networkStatus.state === 'offline' ? '오프라인' : '연결 불안정'}` : ''}`}
                aria-expanded={notiOpen}
                onClick={() => setNotiOpen(!notiOpen)}
                className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${notiOpen ? 'bg-surface-container-high' : 'hover:bg-surface-container'}`}
              >
                <span className="material-symbols-outlined text-on-surface-variant text-xl">notifications</span>
                {(notifications.some(n => n.isNew) || networkStatus.state !== 'online') && (
                  <span className={`absolute top-1 right-1 w-2 h-2 rounded-full block animate-pulse ${networkStatus.state === 'online' ? 'bg-error' : 'bg-amber-500'}`}></span>
                )}
              </button>
              
              {notiOpen && (
                <div className="notification-popover z-50 p-2">
                  <div className="bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-xl w-full sm:w-[320px] overflow-hidden animate-slide-in-top">
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
                    <DataStatusSummary
                      status={networkStatus}
                      onOpenOfflineReadiness={() => {
                        setNotiOpen(false);
                        handleNavigate('offline-readiness');
                      }}
                    />
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
                        onClick={markAllRead}
                        className="flex-1 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        모두 읽음
                      </button>
                      <button
                        onClick={clearAll}
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
              type="button"
              aria-label={`${theme === 'dark' ? '라이트' : '다크'} 모드로 전환`}
              onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
              className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors"
              title={`현재: ${theme === 'dark' ? '다크' : '라이트'} 모드`}
            >
              <span className="material-symbols-outlined text-on-surface-variant text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >{theme === 'dark' ? 'dark_mode' : 'light_mode'}</span>
            </button>

            {/* Settings (기어는 데스크톱 전용, 모바일은 사이드바 '내 정보'에서 열림) */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                aria-label="설정 열기"
                aria-expanded={settingsOpen}
                onClick={event => {
                  settingsReturnFocusRef.current = event.currentTarget;
                  setSettingsOpen(!settingsOpen);
                }}
                className={`hidden sm:flex w-11 h-11 items-center justify-center rounded-lg transition-colors ${settingsOpen ? 'bg-surface-container-high' : 'hover:bg-surface-container'}`}
              >
                <span className="material-symbols-outlined text-on-surface-variant text-xl">settings</span>
              </button>
              <SettingsModal 
                isOpen={settingsOpen} 
                onClose={() => setSettingsOpen(false)} 
                city={city}
                onCityChange={handleCityChange}
                cityNames={cityNames}
                returnFocusRef={settingsReturnFocusRef}
              />
            </div>
          </div>
        </header>

        <IncidentStatusStrip
          session={incidentSession}
          activeTab={activeTab}
          onNavigate={handleNavigate}
          fieldModeActive={fieldReadabilityMode}
          onFieldModeChange={handleFieldModeChange}
        />

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
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-100'
                  : 'border-primary/20 bg-primary/10 text-on-surface'
              }`}>
                <span className={`material-symbols-outlined text-xl ${locationNotice.kind === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
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
        <nav aria-label="주요 기능" className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest/95 backdrop-blur-lg border-t border-outline-variant/20 safe-area-bottom">
          <div className="flex items-center justify-around h-16 px-1">
            {bottomTabs.map(tab => {
              const isActive = tab.id !== 'more' && activeTab === tab.id;
              return (
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tab.label}
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
    </AppLockGate>
  );
}
