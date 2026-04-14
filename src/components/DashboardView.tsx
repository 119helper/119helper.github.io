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
import MiniTimerWidget from './MiniTimerWidget';

import hydrantBg from '../assets/hydrant_bg.jpg';
import waterTowerBg from '../assets/water_tower_bg.jpg';

type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar' | 'shelter' | 'emergency' | 'fire-analysis' | 'multiuse' | 'hazmat' | 'annual-fire' | 'statistics' | 'manual' | 'field-timer' | 'news' | 'policy' | 'wildfire' | 'checklist' | 'law';

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

interface QuickToolDef {
  id: string;
  tab: TabId;
  subId?: string;
  icon: string;
  label: string;
  color: string;
  category: string;
  bgImage?: string;
}

const ALL_QUICK_TOOLS: QuickToolDef[] = [
  // 소방시설 (기존 위젯을 빠른 도구로 편입)
  { id: 'facility_hydrants', tab: 'hydrants', icon: 'fire_hydrant', label: '소화전', color: 'text-blue-400', category: '소방시설', bgImage: hydrantBg },
  { id: 'facility_towers', tab: 'waterTowers', icon: 'water_pump', label: '급수탑', color: 'text-emerald-400', category: '소방시설', bgImage: waterTowerBg },
  // 소방 계산기
  { id: 'calc_hazmat', tab: 'calculator', subId: 'hazmat_calc', icon: 'science', label: '유해물질', color: 'text-orange-400', category: '계산기', bgImage: '/images/tools/Gemini_Generated_Image_5cq1b5cq1b5cq1b5.png' },
  { id: 'calc_water', tab: 'calculator', subId: 'water_pressure_calc', icon: 'water_drop', label: '수압 계산', color: 'text-blue-400', category: '계산기', bgImage: '/images/tools/Gemini_Generated_Image_1eyesc1eyesc1eye.png' },
  { id: 'calc_hose', tab: 'calculator', subId: 'hose_length_calc', icon: 'straighten', label: '호스 전개', color: 'text-green-400', category: '계산기', bgImage: '/images/tools/bg_water.png' },
  { id: 'calc_air', tab: 'calculator', subId: 'air_tank_timer', icon: 'timer', label: '공기호흡기', color: 'text-amber-400', category: '계산기', bgImage: '/images/tools/bg_checklist.png' },
  { id: 'calc_unit', tab: 'calculator', subId: 'unit_converter', icon: 'swap_horiz', label: '단위 변환', color: 'text-indigo-400', category: '계산기' },
  // 주요 탭
  { id: 'law_defense', tab: 'law', subId: 'DEFENSE', icon: 'gavel', label: '법률 방어망', color: 'text-rose-500', category: '법률 보호', bgImage: '/images/tools/Gemini_Generated_Image_5n8rd95n8rd95n8r.png' },
  { id: 'checklist', tab: 'checklist', icon: 'check_circle', label: '장비점검', color: 'text-orange-400', category: '현장 도구', bgImage: '/images/tools/bg_checklist.png' },
  { id: 'field_timer', tab: 'field-timer', icon: 'timer', label: '현장 타이머', color: 'text-red-500', category: '현장 도구', bgImage: '/images/tools/bg_timer.png' },
  { id: 'building', tab: 'shelter', subId: 'building', icon: 'apartment', label: '건축물대장', color: 'text-purple-400', category: '조회', bgImage: '/images/tools/bg_building.png' },
  { id: 'shelter', tab: 'shelter', icon: 'location_city', label: '시설 조회', color: 'text-yellow-400', category: '조회', bgImage: '/images/tools/bg_shelter.png' },
  { id: 'er', tab: 'er', icon: 'local_hospital', label: '응급실 현황', color: 'text-pink-400', category: '현장 도구', bgImage: '/images/tools/bg_er.png' },
  { id: 'weather', tab: 'weather', icon: 'cloud', label: '기상 정보', color: 'text-sky-400', category: '현장 도구' },
  { id: 'statistics', tab: 'statistics', icon: 'bar_chart', label: '통계 분석', color: 'text-orange-500', category: '행정/기타' },
  { id: 'news', tab: 'news', icon: 'newspaper', label: '소방 뉴스', color: 'text-teal-500', category: '행정/기타' },
  { id: 'wildfire', tab: 'wildfire', icon: 'local_fire_department', label: '산불 현황', color: 'text-red-500', category: '행정/기타', bgImage: '/images/tools/bg_wildfire.png' },
  { id: 'manual', tab: 'manual', icon: 'menu_book', label: '대응 매뉴얼', color: 'text-blue-500', category: '행정/기타' },
  { id: 'calendar', tab: 'calendar', icon: 'calendar_month', label: '달력/일정', color: 'text-red-400', category: '행정/기타' },
  { id: 'policy', tab: 'policy', icon: 'gavel', label: '법안/지침', color: 'text-green-500', category: '행정/기타' },
];

const DEFAULT_TOOLS = ['facility_hydrants', 'facility_towers', 'checklist', 'calc_water', 'calc_hazmat', 'law_defense'];

const WeatherParticles = React.memo(({ type }: { type: string }) => {
  if (!type || type === '없음') return null;
  
  const isRain = type.includes('비') || type.includes('소나기') || type.includes('빗방울');
  const isSnow = type.includes('눈');
  
  if (!isRain && !isSnow) return null;

  const count = isRain ? 20 : 30; // 비는 20줄기, 눈은 30송이 정도
  const particleStyles = React.useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      left: Math.random() * 100 + '%',
      delay: Math.random() * 2 + 's',
      duration: isRain ? (0.5 + Math.random() * 0.3) + 's' : (2 + Math.random() * 3) + 's',
      size: isSnow ? (3 + Math.random() * 4) + 'px' : undefined,
      opacity: 0.3 + Math.random() * 0.5
    }));
  }, [count, isRain, isSnow]);

  const particles = particleStyles.map((style, i) => {
    return (
      <div 
        key={i} 
        className={isRain ? 'weather-particle-rain' : 'weather-particle-snow'} 
        style={{
          left: style.left,
          animationDelay: style.delay,
          animationDuration: style.duration,
          opacity: style.opacity,
          width: style.size,
          height: style.size
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
  // 개인안전장비 점검 진행률
  const [checklistProgress, setChecklistProgress] = useState(0);
  // 빠른 도구 상태
  const [customTools, setCustomTools] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('119helper-custom-tools');
      if (saved) {
        let parsed = JSON.parse(saved) as string[];
        // 자동 마이그레이션: 'building'(건축물대장) 대신 'law_defense'(법률방어망)를 기본으로 노출
        if (parsed.includes('building') && !parsed.includes('law_defense')) {
          parsed = parsed.map(t => t === 'building' ? 'law_defense' : t);
          localStorage.setItem('119helper-custom-tools', JSON.stringify(parsed));
        }
        return parsed;
      }
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

    // 개인안전장비 점검 진행률 로드
    try {
      const saved = localStorage.getItem('119helper-equipment-checklist');
      if (saved && isMounted) {
        const parsed = JSON.parse(saved);
        const checkedCount = Object.values(parsed).filter(Boolean).length;
        const totalItemsCount = 13; // SCBA 4 + PPE 5 + 통신 4 = 13개 항목
        setChecklistProgress(Math.round((checkedCount / totalItemsCount) * 100));
      }
    } catch { /* parse error fallback */ }

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

      {/* 산불 실시간 지역 티커 */}
      <WildfireTicker cityName={cityLabel} />

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



        {/* ER + Info Column */}
        <div className="lg:col-span-5 flex flex-col gap-4 md:gap-6 mt-4 lg:mt-0">
          
          {/* 현장 타이머 미니 위젯 */}
          <MiniTimerWidget onNavigate={onNavigate} />

          {/* 개인안전장비 점검 미니 위젯 */}
          <div 
            className="bg-surface-container border border-outline-variant/10 rounded-xl p-5 flex items-center justify-between cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] shadow-sm relative overflow-hidden group"
            onClick={() => onNavigate('checklist')}
            style={{ minHeight: '120px' }}
          >
            {/* Background Image Layer */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(/images/safety_equipment.png)` }}
            />
            {/* Dark overlay for text readability & mood */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/30 transition-colors duration-1000" />
            
            <div className="relative z-10 flex items-center gap-4 w-full">
              <div className="p-3 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 backdrop-blur-sm">
                <span className="material-symbols-outlined text-3xl">fact_check</span>
              </div>
              <div className="flex-1">
                <h4 className="text-white font-extrabold text-lg">개인안전장비 점검</h4>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div 
                      className={`h-full transition-all duration-500 ease-out ${checklistProgress === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                      style={{ width: `${checklistProgress}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-9 text-right ${checklistProgress === 100 ? 'text-green-400' : 'text-orange-400'}`}>
                    {checklistProgress}%
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] mt-1">출근 직후 필수 점검 사항</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-white/50 relative z-10">chevron_right</span>
          </div>

          {/* ER Summary */}
          <div className="flex-1 relative overflow-hidden rounded-xl p-6 cursor-pointer hover:shadow-2xl transition-shadow group border border-outline-variant/10" onClick={() => onNavigate('er')}>
            {/* Background Image Layer */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(/images/Gemini_Generated_Image_swyu86swyu86swyu.png)` }}
            />
            {/* Dark overlay for text readability & mood */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30 transition-colors duration-1000" />
            
            {/* Content Container with z-index to appear above the background */}
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-white/70">응급실 가용 병상</p>
                    <span className="text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded text-white">{cityLabel}</span>
                  </div>
                  <h4 className="text-4xl font-extrabold mt-1 font-headline text-white drop-shadow-lg">
                    {erList.length > 0 ? erList.reduce((s, e) => s + (parseInt(e.hvec) || 0), 0) : '...'}
                  </h4>
                </div>
                <div className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
                  <span className="material-symbols-outlined text-white text-2xl">emergency</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-white/80 mt-3 drop-shadow">{cityLabel} 관내 {erList.length > 0 ? erList.length : '...'}개 병원 기준</p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {erList.slice(0, 3).map(er => {
                    const available = parseInt(er.hvec) || 0;
                    return (
                      <span 
                        key={er.dutyName} 
                        title={available < 0 ? "대기 중인 환자 수" : "잔여 병상 수"}
                        className={`text-[10px] px-2 py-1 rounded-full border cursor-help backdrop-blur-sm ${available > 0 ? 'bg-green-500/30 border-green-400/40 text-green-100' : 'bg-red-500/30 border-red-400/40 text-red-100'}`}
                      >
                        {er.dutyName.replace(/병원|대학교|서울/g, '').trim()} 
                        {available < 0 ? ` 대기 ${Math.abs(available)}석` : ` 잔여 ${available}석`}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {/* Removed Quick Stats Row for quick tools compactness */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 p-3 md:p-4 animate-in slide-in-from-top-4 fade-in duration-300">
            {customTools.map(toolId => {
              const tool = ALL_QUICK_TOOLS.find(t => t.id === toolId);
              if (!tool) return null;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.tab, tool.subId)}
                  className="relative flex flex-col items-center justify-center gap-2 p-4 md:p-6 rounded-2xl overflow-hidden transition-all group shadow-sm hover:shadow-xl border border-outline-variant/10 min-h-[100px] md:min-h-[120px] bg-surface-container"
                >
                  {/* Background Image Layer */}
                  {tool.bgImage && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${tool.bgImage})` }}
                    />
                  )}
                  {/* Dark overlay for readability */}
                  <div className={`absolute inset-0 transition-colors duration-500 ${tool.bgImage ? 'bg-slate-900/60 backdrop-blur-[1px] group-hover:bg-slate-900/40' : 'bg-transparent group-hover:bg-surface-container-highest'}`} />
                  
                  <div className="relative z-10 flex flex-col items-center gap-1.5">
                    <span className={`material-symbols-outlined text-3xl md:text-4xl ${tool.color} group-hover:-translate-y-1 transition-transform drop-shadow-md`}>{tool.icon}</span>
                    <span className={`text-xs md:text-sm font-extrabold whitespace-nowrap drop-shadow-md ${tool.bgImage ? 'text-white' : 'text-on-surface'}`}>{tool.label}</span>
                  </div>

                  {/* Optional Badges for Hydrants/Towers */}
                  {tool.id === 'facility_hydrants' && !isLoadingFacilities && (
                    <span className="absolute top-2 right-2 flex items-center justify-center bg-blue-500/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-blue-400 backdrop-blur-sm z-20">
                      {hydrantsCount.toLocaleString()}
                    </span>
                  )}
                  {tool.id === 'facility_towers' && !isLoadingFacilities && (
                    <span className="absolute top-2 right-2 flex items-center justify-center bg-emerald-500/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-emerald-400 backdrop-blur-sm z-20">
                      {towersCount.toLocaleString()}
                    </span>
                  )}
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
      <StickyNotes embedMode />

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
