import React, { useState, useEffect } from 'react';
import { getRealtimeAirQuality, type AirQualityData } from '../services/airQualityApi';
import { getERRealTimeBeds, CITY_TO_SIDO, type ERRealTimeData } from '../services/erApi';
import { getUltraShortNow, parseCurrentWeather, CITY_GRIDS, type CurrentWeather } from '../services/weatherApi';
import type { FireFacility } from '../data/mockData';
import type { CityIndex } from '../services/fireWaterApi';
import WeatherAlertBanner from './WeatherAlertBanner';
import StickyNotes from './StickyNotes';
import { WildfireTicker } from './WildfireTicker';
import { WindCompass } from './WindCompass';

type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar' | 'shelter' | 'emergency' | 'fire-analysis' | 'multiuse' | 'hazmat' | 'annual-fire' | 'statistics' | 'manual' | 'field-timer' | 'unit-converter' | 'news' | 'policy' | 'wildfire';

const cityNames: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

interface DashboardProps {
  onNavigate: (tab: TabId, subId?: string) => void;
  city: string;
  fireFacilities: FireFacility[];
  isLoadingFacilities: boolean;
  cityIndex?: CityIndex | null;
}

export interface QuickToolDef {
  id: string;
  tab: TabId;
  subId?: string;
  icon: string;
  label: string;
  color: string;
  category: string;
}

export const ALL_QUICK_TOOLS: QuickToolDef[] = [
  // 소방 계산기
  { id: 'calc_hazmat', tab: 'calculator', subId: 'hazmat_calc', icon: 'science', label: '유해물질', color: 'text-orange-400', category: '계산기' },
  { id: 'calc_water', tab: 'calculator', subId: 'water_pressure_calc', icon: 'water_drop', label: '수압 계산', color: 'text-blue-400', category: '계산기' },
  { id: 'calc_hose', tab: 'calculator', subId: 'hose_length_calc', icon: 'straighten', label: '호스 전개', color: 'text-green-400', category: '계산기' },
  { id: 'calc_air', tab: 'calculator', subId: 'air_tank_timer', icon: 'timer', label: '공기호흡기', color: 'text-amber-400', category: '계산기' },
  { id: 'calc_unit', tab: 'calculator', subId: 'unit_converter', icon: 'swap_horiz', label: '단위 변환', color: 'text-indigo-400', category: '계산기' },
  // 주요 탭
  { id: 'field_timer', tab: 'field-timer', icon: 'timer', label: '현장 타이머', color: 'text-red-500', category: '현장 도구' },
  { id: 'building', tab: 'building', icon: 'apartment', label: '건축물대장', color: 'text-purple-400', category: '조회' },
  { id: 'multiuse', tab: 'multiuse', icon: 'store', label: '다중이용업소', color: 'text-teal-400', category: '조회' },
  { id: 'shelter', tab: 'shelter', icon: 'location_city', label: '시설 조회', color: 'text-yellow-400', category: '조회' },
  { id: 'er', tab: 'er', icon: 'local_hospital', label: '응급실 현황', color: 'text-pink-400', category: '현장 도구' },
  { id: 'weather', tab: 'weather', icon: 'cloud', label: '기상 정보', color: 'text-sky-400', category: '현장 도구' },
  { id: 'statistics', tab: 'statistics', icon: 'bar_chart', label: '통계 분석', color: 'text-orange-500', category: '행정/기타' },
  { id: 'news', tab: 'news', icon: 'newspaper', label: '소방 뉴스', color: 'text-teal-500', category: '행정/기타' },
  { id: 'wildfire', tab: 'wildfire', icon: 'local_fire_department', label: '산불 현황', color: 'text-red-500', category: '행정/기타' },
  { id: 'manual', tab: 'manual', icon: 'menu_book', label: '대응 매뉴얼', color: 'text-blue-500', category: '행정/기타' },
  { id: 'calendar', tab: 'calendar', icon: 'calendar_month', label: '달력/일정', color: 'text-red-400', category: '행정/기타' },
  { id: 'policy', tab: 'policy', icon: 'gavel', label: '법안/지침', color: 'text-green-500', category: '행정/기타' },
];

const DEFAULT_TOOLS = ['calc_water', 'field_timer', 'building', 'er'];

const WeatherParticles = React.memo(({ type }: { type: string }) => {
  if (!type || type === '없음') return null;
  
  const isRain = type.includes('비') || type.includes('소나기') || type.includes('빗방울');
  const isSnow = type.includes('눈');
  
  if (!isRain && !isSnow) return null;

  const count = isRain ? 20 : 30; // 비는 20줄기, 눈은 30송이 정도
  const particles = Array.from({ length: count }).map((_, i) => {
    const left = Math.random() * 100 + '%';
    const delay = Math.random() * 2 + 's';
    const duration = isRain ? (0.5 + Math.random() * 0.3) + 's' : (2 + Math.random() * 3) + 's';
    const size = isSnow ? (3 + Math.random() * 4) + 'px' : undefined;
    const opacity = 0.3 + Math.random() * 0.5;

    return (
      <div 
        key={i} 
        className={isRain ? 'weather-particle-rain' : 'weather-particle-snow'} 
        style={{
          left,
          animationDelay: delay,
          animationDuration: duration,
          opacity,
          width: size,
          height: size
        }}
      />
    );
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {particles}
    </div>
  );
});

export default function DashboardView({ onNavigate, city, fireFacilities, isLoadingFacilities, cityIndex }: DashboardProps) {
  const cityLabel = cityNames[city] || '서울';
  
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [erList, setErList] = useState<ERRealTimeData[]>([]);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  
  // 섹션 접기/펴기 상태
  const [showQuickTools, setShowQuickTools] = useState(true);
  const [showMemo, setShowMemo] = useState(true);

  // 빠른 도구 상태
  const [customTools, setCustomTools] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('119helper-custom-tools');
      if (saved) return JSON.parse(saved);
    } catch { /* parse error fallback */ }
    return DEFAULT_TOOLS;
  });
  const [isEditingTools, setIsEditingTools] = useState(false);

  const saveTools = (newTools: string[]) => {
    setCustomTools(newTools);
    localStorage.setItem('119helper-custom-tools', JSON.stringify(newTools));
  };

  useEffect(() => {
    let isMounted = true;

    // 실시간 날씨
    const grid = CITY_GRIDS[city] || CITY_GRIDS.seoul;
    setWeatherLoading(true);
    getUltraShortNow(grid.nx, grid.ny).then(items => {
      if (isMounted && items.length > 0) {
        setWeather(parseCurrentWeather(items));
      }
      setWeatherLoading(false);
    }).catch(() => setWeatherLoading(false));

    // 대기질
    getRealtimeAirQuality(city).then(data => {
      if (isMounted && data) setAirQuality(data);
    });
    
    // 응급실
    const sido = CITY_TO_SIDO[city] || '서울특별시';
    getERRealTimeBeds(sido).then(data => {
      if (isMounted && data) setErList(data);
    });
    return () => { isMounted = false; };
  }, [city]);

  // 분할 도시: index.json의 타입별 합계 사용
  // 비분할 도시: 로드된 데이터에서 카운트
  const hydrantsCount = cityIndex
    ? (cityIndex.hydrants ?? cityIndex.total)
    : fireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치').length;
  const towersCount = cityIndex
    ? (cityIndex.waterTowers ?? 0)
    : fireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조').length;

  const regionImageUrl = `/images/regions/${city}.png`;

  const getBgOverlay = () => {
    if (!weather) return 'from-black/80 via-black/50 to-black/30';
    if (weather.precipType.includes('비') || weather.precipType.includes('소나기') || weather.precipType === '빗방울') {
      return 'from-slate-900/90 via-blue-900/60 to-sky-900/40';
    }
    if (weather.precipType.includes('눈')) {
      return 'from-slate-900/80 via-indigo-900/50 to-gray-500/40';
    }
    if (weather.sky === '맑음') {
      return 'from-black/80 via-amber-900/40 to-yellow-900/20';
    }
    if (weather.sky.includes('흐림') || weather.sky.includes('구름')) {
      return 'from-gray-900/90 via-gray-800/60 to-slate-700/50';
    }
    return 'from-black/80 via-black/50 to-black/30';
  };

  return (
    <div className="space-y-6">
      {/* 실시간 기상청 특보 배너 */}
      <WeatherAlertBanner city={cityLabel} />

      {/* 산불 실시간 티커 */}
      <WildfireTicker />

      {/* Large Weather + ER Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* BIG Weather Widget with Region Background Image */}
        <div 
          className="lg:col-span-7 rounded-xl p-5 md:p-8 relative overflow-hidden cursor-pointer hover:shadow-2xl transition-shadow group"
          onClick={() => onNavigate('weather')}
          style={{ minHeight: '280px' }}
        >
          {/* Background Image Layer */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url(${regionImageUrl})` }}
          />
          {/* Dark/Colored overlay for text readability & weather mood */}
          <div className={`absolute inset-0 bg-gradient-to-t transition-colors duration-1000 ${getBgOverlay()}`} />

          <WeatherParticles type={weather?.precipType || '없음'} />
          
          <div className="flex items-start justify-between relative z-30">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">현재 날씨</p>
                <span className="text-xs bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-white font-bold">{cityLabel}</span>
                {weather && <span className="text-[10px] text-white/50">{weather.lastUpdate} 기준</span>}
              </div>
              <h3 className="text-4xl md:text-7xl font-extrabold text-white mt-2 font-headline drop-shadow-lg">
                {weatherLoading ? (
                  <span className="text-2xl animate-pulse text-white/60">조회 중...</span>
                ) : (
                  <>{weather?.temperature ?? '--'}<span className="text-3xl text-white/70 ml-1">°C</span></>
                )}
              </h3>
              <p className="text-lg text-white/80 mt-1 drop-shadow">
                {weather ? `${weather.skyIcon} ${weather.sky}` : '--'}
                {weather?.precipType !== '없음' && weather?.precipIcon && ` ${weather.precipIcon} ${weather.precipType}`}
              </p>
            </div>
            <div className="text-right space-y-3 hidden md:flex md:flex-col md:items-end">
              {weather && (
                <WindCompass 
                  windSpeed={weather.windSpeed} 
                  windDirectionDegree={weather.windDirectionDegree || 0} 
                  windDirectionText={weather.windDirection} 
                  variant="glass"
                />
              )}
              <div className="bg-black/40 backdrop-blur-md rounded-lg px-4 py-2.5 border border-white/10 flex flex-col items-center min-w-[5rem]">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">습도</p>
                <p className={`text-lg font-bold ${weather && weather.humidity <= 30 ? 'text-red-400' : 'text-white'}`}>{weather?.humidity ?? '--'}%</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 md:gap-6 mt-4 md:mt-6 relative z-30 flex-wrap">
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
              <span className="text-xs text-white/70">미세먼지</span>
              <span className={`text-xs font-bold ${
                airQuality?.pm10Grade === '1' ? 'text-blue-300' :
                airQuality?.pm10Grade === '2' ? 'text-green-300' :
                airQuality?.pm10Grade === '3' ? 'text-amber-300' :
                airQuality?.pm10Grade === '4' ? 'text-red-400' : 'text-white/60'
              }`}>{airQuality ? airQuality.pm10Value : '조회 중'}{airQuality?.pm10Value !== '-' ? '㎍/㎥' : ''}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
              <span className="text-xs text-white/70">초미세먼지</span>
              <span className={`text-xs font-bold ${
                airQuality?.pm25Grade === '1' ? 'text-blue-300' :
                airQuality?.pm25Grade === '2' ? 'text-green-300' :
                airQuality?.pm25Grade === '3' ? 'text-amber-300' :
                airQuality?.pm25Grade === '4' ? 'text-red-400' : 'text-white/60'
              }`}>{airQuality ? airQuality.pm25Value : '조회 중'}{airQuality?.pm25Value !== '-' ? '㎍/㎥' : ''}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
              <span className="text-xs text-white/70">강수</span>
              <span className="text-xs font-bold text-white">{weather?.precipitation ?? '--'}mm</span>
            </div>
          </div>
        </div>



        {/* ER Summary */}
        <div className="lg:col-span-5 flex flex-col gap-4 md:gap-6 mt-4 lg:mt-0">
          <div className="flex-1 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('er')}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">응급실 가용 병상</p>
                  <span className="text-[10px] bg-surface-container/50 px-2 py-0.5 rounded text-on-surface-variant">{cityLabel}</span>
                </div>
                <h4 className="text-4xl font-extrabold mt-1 font-headline">
                  <span className="text-secondary">{erList.length > 0 ? erList.reduce((s, e) => s + (parseInt(e.hvec) || 0), 0) : '...'}</span>
                </h4>
              </div>
              <div className="p-2 bg-secondary/10 rounded-lg">
                <span className="material-symbols-outlined text-secondary text-2xl">emergency</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mt-3">{cityLabel} 관내 {erList.length > 0 ? erList.length : '...'}개 병원 기준</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              {erList.slice(0, 3).map(er => {
                const available = parseInt(er.hvec) || 0;
                return (
                  <span 
                    key={er.dutyName} 
                    title={available < 0 ? "대기 중인 환자 수" : "잔여 병상 수"}
                    className={`text-[10px] px-2 py-1 rounded-full border cursor-help ${available > 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}
                  >
                    {er.dutyName.replace(/병원|대학교|서울/g, '').trim()} 
                    {available < 0 ? ` 대기 ${Math.abs(available)}석` : ` 잔여 ${available}석`}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => onNavigate('hydrants')} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-left hover:border-primary/30 transition-colors group relative overflow-hidden">
              <span className="material-symbols-outlined text-primary text-xl group-hover:scale-110 transition-transform">fire_hydrant</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1 font-headline">
                {isLoadingFacilities ? <span className="text-sm font-medium animate-pulse text-on-surface-variant">불러오는 중...</span> : hydrantsCount.toLocaleString()}
              </p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">소화전</p>
            </button>
            <button onClick={() => onNavigate('waterTowers')} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-left hover:border-primary/30 transition-colors group relative overflow-hidden">
              <span className="material-symbols-outlined text-secondary text-xl group-hover:scale-110 transition-transform">water_pump</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1 font-headline">
                {isLoadingFacilities
                  ? <span className="text-sm font-medium animate-pulse text-on-surface-variant">불러오는 중...</span>
                  : towersCount.toLocaleString()
                }
              </p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">급수탑/저수조</p>
            </button>
            <button onClick={() => onNavigate('statistics' as TabId)} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-left hover:border-orange-500/30 transition-colors group relative overflow-hidden col-span-2">
              <span className="material-symbols-outlined text-orange-400 text-xl group-hover:scale-110 transition-transform">bar_chart</span>
              <p className="text-lg font-extrabold text-on-surface mt-1 font-headline">통계 · 분석</p>
              <p className="text-[10px] text-on-surface-variant">연간화재통계 · 화재분석 · 구급출동분석</p>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Tools */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden shadow-sm transition-all">
        <div className="flex items-center justify-between border-b border-outline-variant/10 p-3 md:p-4">
          <button 
            onClick={() => setShowQuickTools(!showQuickTools)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none"
          >
            <span className="material-symbols-outlined text-primary text-xl">build_circle</span>
            <h3 className="text-lg font-extrabold text-on-surface font-headline">빠른 도구</h3>
            <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${showQuickTools ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>
          
          <button
            onClick={() => setIsEditingTools(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-xs font-bold text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            도구 편집
          </button>
        </div>
        {showQuickTools && customTools.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 p-3 md:p-4 animate-in slide-in-from-top-4 fade-in duration-300">
            {customTools.map(toolId => {
              const tool = ALL_QUICK_TOOLS.find(t => t.id === toolId);
              if (!tool) return null;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.tab, tool.subId)}
                  className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-all group border border-transparent hover:border-outline-variant/20"
                >
                  <span className={`material-symbols-outlined text-2xl md:text-3xl ${tool.color} group-hover:scale-110 transition-transform`}>{tool.icon}</span>
                  <span className="text-xs md:text-sm font-medium text-on-surface whitespace-nowrap">{tool.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {showQuickTools && customTools.length === 0 && (
          <div className="p-6 text-center text-on-surface-variant/60 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-3xl opacity-50">category</span>
            <p className="text-sm font-medium">선택된 도구가 없습니다.</p>
            <p className="text-xs">우측 상단의 '도구 편집'을 눌러 기능을 추가해보세요.</p>
          </div>
        )}
      </section>

      {/* Embedded Sticky Notes */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden shadow-sm transition-all">
        <button 
          onClick={() => setShowMemo(!showMemo)}
          className="w-full p-3 md:p-4 border-b border-outline-variant/10 flex items-center justify-between hover:bg-surface-container/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-pink-400 text-xl">sticky_note_2</span>
            <h3 className="text-lg font-extrabold text-on-surface font-headline">메모장</h3>
          </div>
          <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${showMemo ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
        {showMemo && (
          <div className="p-3 md:p-4 animate-in slide-in-from-top-4 fade-in duration-300 bg-surface/30">
            <StickyNotes embedMode />
          </div>
        )}
      </section>

      {/* Editor Modal */}
      {isEditingTools && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest w-full max-w-2xl max-h-[85vh] rounded-2xl flex flex-col shadow-2xl relative">
            <div className="p-5 border-b border-outline-variant/20 flex items-center justify-between sticky top-0 bg-surface-container-lowest/95 backdrop-blur-md rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">category</span>
                <h3 className="text-xl font-extrabold text-on-surface">빠른 도구 편집</h3>
              </div>
              <button 
                onClick={() => setIsEditingTools(false)}
                className="p-2 rounded-full hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              {Object.entries(
                ALL_QUICK_TOOLS.reduce((acc, tool) => {
                  if (!acc[tool.category]) acc[tool.category] = [];
                  acc[tool.category].push(tool);
                  return acc;
                }, {} as Record<string, QuickToolDef[]>)
              ).map(([cat, tools]) => (
                <div key={cat} className="space-y-3">
                  <h4 className="text-sm font-bold text-on-surface-variant capitalize tracking-widest">{cat}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {tools.map(tool => {
                      const isSelected = customTools.includes(tool.id);
                      return (
                        <button
                          key={tool.id}
                          onClick={() => {
                            if (isSelected) {
                              saveTools(customTools.filter(id => id !== tool.id));
                            } else {
                              saveTools([...customTools, tool.id]);
                            }
                          }}
                          className={`flex items-center gap-3 p-3 text-left border rounded-xl transition-all ${
                            isSelected 
                              ? 'bg-primary/10 border-primary/40 shadow-inner' 
                              : 'bg-surface-container border-outline-variant/10 hover:border-outline-variant/30'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-2xl ${isSelected ? tool.color : 'text-on-surface-variant'} transition-colors`}>
                            {tool.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                              {tool.label}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-primary text-sm font-bold absolute right-3 opacity-80 pointer-events-none">check_circle</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-outline-variant/20 bg-surface-container-lowest rounded-b-2xl flex justify-end gap-3 sticky bottom-0 z-10">
              <button
                onClick={() => saveTools(DEFAULT_TOOLS)}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => setIsEditingTools(false)}
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-on-primary bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
