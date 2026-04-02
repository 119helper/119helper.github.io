import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import StickyNotes from './components/StickyNotes';
import Calculators from './components/Calculators';
import FacilityList from './components/FacilityList';
import Calendar from './components/Calendar';
import WeatherDashboard from './components/WeatherDashboard';
import ERDashboard from './components/ERDashboard';
import DashboardView from './components/DashboardView';
import BuildingView from './components/BuildingView';
import ShelterView from './components/ShelterView';
import EmergencyAnalysis from './components/EmergencyAnalysis';
import FireAnalysis from './components/FireAnalysis';
import GlobalSearch from './components/GlobalSearch';
import SettingsModal from './components/SettingsModal';
import { fetchFireWaterFacilities } from './services/fireWaterApi';
import { getUltraShortNow, parseCurrentWeather, CITY_GRIDS } from './services/weatherApi';
import { getRealtimeAirQuality } from './services/airQualityApi';
import type { FireFacility } from './data/mockData';
type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar' | 'shelter' | 'emergency' | 'fire-analysis';

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

interface NavItem {
  id: TabId;
  icon: string;
  label: string;
  filled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: 'dashboard', label: '대시보드', filled: true },
  { id: 'weather', icon: 'cloud', label: '기상 정보' },
  { id: 'hydrants', icon: 'fire_hydrant', label: '소화전' },
  { id: 'waterTowers', icon: 'water_pump', label: '급수탑/저수조' },
  { id: 'er', icon: 'local_hospital', label: '응급실 현황' },
  { id: 'building', icon: 'apartment', label: '건축물대장' },
  { id: 'shelter', icon: 'emergency', label: '대피소' },
  { id: 'emergency', icon: 'ambulance', label: '구급 분석' },
  { id: 'fire-analysis', icon: 'local_fire_department', label: '화재 분석' },
  { id: 'calculator', icon: 'calculate', label: '계산기' },
  { id: 'calendar', icon: 'calendar_month', label: '달력/일정' },
  { id: 'memo', icon: 'sticky_note_2', label: '메모장' },
];

const cityNames: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

function formatTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

/* ─────────── Main App ─────────── */
export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [city, setCity] = useState<string>(() => localStorage.getItem('119helper-city') || 'seoul');
  const [fireFacilities, setFireFacilities] = useState<FireFacility[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'granted' | 'denied' | 'idle'>('idle');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(() => parseInt(localStorage.getItem('119helper-refresh') || '5'));
  const lastRefreshRef = useRef<Date>(new Date());
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);

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
    if (!navigator.geolocation) return;
    const saved = localStorage.getItem('119helper-city');
    if (saved) return;

    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const cityCoords: Record<string, [number, number]> = {
          seoul: [37.5665, 126.978], busan: [35.1796, 129.0756],
          daegu: [35.8714, 128.6014], incheon: [37.4563, 126.7052],
          gwangju: [35.1595, 126.8526], daejeon: [36.3504, 127.3845],
          ulsan: [35.5384, 129.3114], sejong: [36.48, 127.0],
          jeju: [33.4996, 126.5312],
        };
        let closest = 'seoul', minDist = Infinity;
        Object.entries(cityCoords).forEach(([key, [lat, lng]]) => {
          const dist = Math.sqrt((latitude - lat) ** 2 + (longitude - lng) ** 2);
          if (dist < minDist) { minDist = dist; closest = key; }
        });
        setCity(closest);
        setGpsStatus('granted');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    localStorage.setItem('119helper-city', newCity);
  };

  // 알림 추가 헬퍼
  const addNotification = useCallback((icon: string, iconColor: string, title: string, message: string) => {
    setNotifications(prev => {
      const newNoti: Notification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        icon, iconColor, title, message,
        timestamp: new Date(),
        isNew: true,
      };
      const updated = [newNoti, ...prev].slice(0, 20); // 최대 20개
      return updated;
    });
  }, []);

  // 데이터 갱신 함수
  const refreshData = useCallback(async () => {
    // 소방용수
    setIsLoadingFacilities(true);
    try {
      const items = await fetchFireWaterFacilities(city);
      const parsed: FireFacility[] = items.map((item, idx) => {
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
        };
      }).filter(i => i.lat > 0 && i.lng > 0);
      setFireFacilities(parsed);
    } catch (_) { /* silently fail */ }
    setIsLoadingFacilities(false);

    // 기상 알림 생성
    try {
      const grid = CITY_GRIDS[city] || CITY_GRIDS.seoul;
      const items = await getUltraShortNow(grid.nx, grid.ny);
      if (items.length > 0) {
        const w = parseCurrentWeather(items);
        if (w.precipType !== '없음') {
          addNotification('rainy', 'text-blue-400', `🌧️ ${cityNames[city]} 강수 감지`, `현재 ${w.precipType} 관측 중. 풍속 ${w.windSpeed}m/s (${w.windDirection})`);
        }
        if (w.temperature >= 35) {
          addNotification('thermostat', 'text-red-400', `🥵 ${cityNames[city]} 폭염 주의`, `현재 기온 ${w.temperature}°C. 현장 활동 시 열사병 주의!`);
        }
        if (w.temperature <= -10) {
          addNotification('ac_unit', 'text-cyan-400', `🥶 ${cityNames[city]} 한파 주의`, `현재 기온 ${w.temperature}°C. 소화전 동파 점검 필요.`);
        }
      }
    } catch (_) { /* silently fail */ }

    // 대기질 알림 생성
    try {
      const aq = await getRealtimeAirQuality(cityNames[city] || '서울');
      if (aq && parseInt(aq.pm10Grade) >= 3) {
        addNotification('masks', 'text-yellow-400', `⚠️ ${cityNames[city]} 미세먼지 나쁨`, `PM10: ${aq.pm10Value}μg/m³. 현장 활동 시 방진마스크 착용 권장.`);
      }
    } catch (_) { /* silently fail */ }

    lastRefreshRef.current = new Date();
  }, [city, addNotification]);

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
      const val = parseInt(localStorage.getItem('119helper-refresh') || '5');
      setRefreshInterval(val);
    };
    window.addEventListener('storage', handleStorage);
    // 같은 탭에서도 감지하기 위해 폴링
    const pollId = setInterval(() => {
      const val = parseInt(localStorage.getItem('119helper-refresh') || '5');
      setRefreshInterval(prev => prev !== val ? val : prev);
    }, 2000);
    return () => { window.removeEventListener('storage', handleStorage); clearInterval(pollId); };
  }, []);

  const handleNavigate = (tab: TabId) => {
    setActiveTab(tab);
    setSidebarOpen(false); // 모바일에서 탭 변경 시 사이드바 닫기
  };

  const renderContent = () => {
    const hydrants = fireFacilities.filter(f => f.type === '소화전');
    const waterTowers = fireFacilities.filter(f => f.type !== '소화전');

    switch (activeTab) {
      case 'dashboard': return <DashboardView onNavigate={handleNavigate} city={city} fireFacilities={fireFacilities} isLoadingFacilities={isLoadingFacilities} />;
      case 'weather': return <WeatherDashboard city={city} />;
      case 'hydrants': return <FacilityList data={hydrants} title="소화전 위치" icon="🚒" typeLabel="소화전" city={city} isLoading={isLoadingFacilities} />;
      case 'waterTowers': return <FacilityList data={waterTowers} title="급수탑 · 저수조 위치" icon="💧" typeLabel="급수탑/저수조/비상소화장치" city={city} isLoading={isLoadingFacilities} />;
      case 'er': return <ERDashboard city={city} />;
      case 'building': return <BuildingView />;
      case 'shelter': return <ShelterView city={city} />;
      case 'emergency': return <EmergencyAnalysis />;
      case 'fire-analysis': return <FireAnalysis />;
      case 'calculator': return <Calculators />;
      case 'calendar': return <Calendar />;
      case 'memo': return <StickyNotes />;
      default: return <DashboardView onNavigate={handleNavigate} city={city} fireFacilities={fireFacilities} isLoadingFacilities={isLoadingFacilities} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-on-background">
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
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                activeTab === item.id
                  ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                  : 'text-on-surface-variant hover:bg-surface-container-high/50'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={activeTab === item.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
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
              {NAV_ITEMS.find(n => n.id === activeTab)?.label || '대시보드'}
            </h2>

            {/* Search */}
            <GlobalSearch onNavigate={handleNavigate} />
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* 📍 Global Location Selector (Custom Beautiful Dropdown) */}
            <div className="relative" ref={regionRef}>
              <button 
                onClick={() => setRegionOpen(!regionOpen)}
                className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {gpsStatus === 'granted' ? 'my_location' : 'location_on'}
                </span>
                <span className="text-on-surface text-sm font-bold pr-1">{cityNames[city]}</span>
                <span className={`material-symbols-outlined text-on-surface-variant text-xs hidden sm:inline transition-transform duration-200 ${regionOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              
              {regionOpen && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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
                  <div className="bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-xl w-[320px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar relative">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
