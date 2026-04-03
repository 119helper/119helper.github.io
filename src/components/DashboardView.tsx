import { useState, useEffect } from 'react';
import { getRealtimeAirQuality, type AirQualityData } from '../services/airQualityApi';
import { getERRealTimeBeds, CITY_TO_SIDO, type ERRealTimeData } from '../services/erApi';
import { getUltraShortNow, parseCurrentWeather, CITY_GRIDS, type CurrentWeather } from '../services/weatherApi';
import type { FireFacility } from '../data/mockData';
import type { CityIndex } from '../services/fireWaterApi';

type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar' | 'emergency' | 'fire-analysis' | 'annual-fire' | 'statistics';

const cityNames: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
  city: string;
  fireFacilities: FireFacility[];
  isLoadingFacilities: boolean;
  cityIndex?: CityIndex | null;
}

export default function DashboardView({ onNavigate, city, fireFacilities, isLoadingFacilities, cityIndex }: DashboardProps) {
  const cityLabel = cityNames[city] || '서울';
  
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [erList, setErList] = useState<ERRealTimeData[]>([]);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

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

  // 분할 도시: index 메타에서 총 건수 사용 (데이터 로드 없이 즉시 표시)
  // 비분할 도시: 로드된 데이터에서 카운트
  const hydrantsCount = cityIndex ? cityIndex.total : fireFacilities.filter(f => f.type === '소화전').length;
  const towersCount = cityIndex ? 0 : fireFacilities.filter(f => f.type !== '소화전').length;

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
      {/* Weather Alert Banner — 습도 30% 이하 or 풍속 10m/s 이상 시 자동 경고 */}
      {weather && (weather.humidity <= 30 || weather.windSpeed >= 10) && (
        <div className="bg-gradient-to-r from-red-900/40 to-orange-900/30 border border-red-500/30 rounded-xl p-4 flex items-center gap-4">
          <span className="material-symbols-outlined text-red-400 text-3xl">warning</span>
          <div className="flex-1">
            <p className="text-red-300 font-bold text-sm">⚠️ 현장 활동 주의</p>
            <p className="text-red-200/80 text-xs mt-0.5">
              {weather.humidity <= 30 ? `건조 주의 — 습도 ${weather.humidity}% ` : ''}
              {weather.windSpeed >= 10 ? `강풍 주의 — 풍속 ${weather.windSpeed}m/s` : ''}
              ({cityLabel} 기준, {weather.lastUpdate} 갱신)
            </p>
          </div>
          <button onClick={() => onNavigate('weather')} className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors">
            상세보기
          </button>
        </div>
      )}

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
          
          <div className="flex items-start justify-between relative z-10">
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
            <div className="text-right space-y-3 hidden md:block">
              <div className="bg-black/40 backdrop-blur-md rounded-lg px-4 py-2.5 border border-white/10">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">풍속 / 풍향</p>
                <p className="text-lg font-bold text-white">{weather?.windSpeed ?? '--'}m/s <span className="text-white/70">{weather?.windDirection ?? '--'}</span></p>
              </div>
              <div className="bg-black/40 backdrop-blur-md rounded-lg px-4 py-2.5 border border-white/10">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">습도</p>
                <p className={`text-lg font-bold ${weather && weather.humidity <= 30 ? 'text-red-400' : 'text-white'}`}>{weather?.humidity ?? '--'}%</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 md:gap-6 mt-4 md:mt-6 relative z-10 flex-wrap">
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
        <div className="lg:col-span-5 flex flex-col gap-4 md:gap-6">
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
                {isLoadingFacilities ? <span className="text-sm font-medium animate-pulse text-on-surface-variant">불러오는 중...</span> : towersCount}
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
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-outline-variant/10">
          <h3 className="text-lg font-extrabold text-on-surface font-headline">🛠️ 빠른 도구</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 p-4 md:p-6">
          {[
            { icon: 'science', label: '유해물질', tab: 'calculator' as TabId, color: 'text-orange-400' },
            { icon: 'water_drop', label: '수압 계산기', tab: 'calculator' as TabId, color: 'text-blue-400' },
            { icon: 'straighten', label: '호스 전개', tab: 'calculator' as TabId, color: 'text-green-400' },
            { icon: 'timer', label: '공기호흡기', tab: 'calculator' as TabId, color: 'text-amber-400' },
            { icon: 'apartment', label: '건축물대장', tab: 'building' as TabId, color: 'text-purple-400' },
            { icon: 'sticky_note_2', label: '메모장', tab: 'memo' as TabId, color: 'text-pink-400' },
          ].map(tool => (
            <button
              key={tool.label}
              onClick={() => onNavigate(tool.tab)}
              className="flex flex-col items-center gap-3 p-5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-all group"
            >
              <span className={`material-symbols-outlined text-3xl ${tool.color} group-hover:scale-110 transition-transform`}>{tool.icon}</span>
              <span className="text-sm font-medium text-on-surface">{tool.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
