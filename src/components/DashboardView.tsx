import { useState, useEffect } from 'react';
import { MOCK_WEATHER, MOCK_ER_DATA } from '../data/mockData';
import { getRealtimeAirQuality, type AirQualityData } from '../services/airQualityApi';
import type { FireFacility } from '../data/mockData';

type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar';

const cityNames: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
  city: string;
  fireFacilities: FireFacility[];
  isLoadingFacilities: boolean;
}

export default function DashboardView({ onNavigate, city, fireFacilities, isLoadingFacilities }: DashboardProps) {
  const w = MOCK_WEATHER;
  const cityLabel = cityNames[city] || '서울';
  
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);

  useEffect(() => {
    let isMounted = true;
    getRealtimeAirQuality(city).then(data => {
      if (isMounted && data) setAirQuality(data);
    });
    return () => { isMounted = false; };
  }, [city]);

  const hydrantsCount = fireFacilities.filter(f => f.type === '소화전').length;
  const towersCount = fireFacilities.filter(f => f.type !== '소화전').length;

  return (
    <div className="space-y-6">
      {/* Weather Alert Banner */}
      {w.alerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-900/40 to-orange-900/30 border border-red-500/30 rounded-xl p-4 flex items-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-red-400 text-3xl">warning</span>
          <div className="flex-1">
            <p className="text-red-300 font-bold text-sm">⚠️ 기상특보 발효 중</p>
            <p className="text-red-200/80 text-xs mt-0.5">
              {w.alerts.map(a => `${a.type} — ${a.region} (${a.issued})`).join(' | ')}
            </p>
          </div>
          <button onClick={() => onNavigate('weather')} className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors">
            상세보기
          </button>
        </div>
      )}

      {/* Large Weather + ER Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* BIG Weather Widget */}
        <div className="lg:col-span-7 bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-purple-900/20 border border-blue-500/10 rounded-xl p-5 md:p-8 relative overflow-hidden cursor-pointer hover:border-blue-500/30 transition-colors" onClick={() => onNavigate('weather')}>
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-300/60">현재 날씨</p>
                <span className="text-[10px] bg-surface-container/50 px-2 py-0.5 rounded text-on-surface-variant">{cityLabel}</span>
              </div>
              <h3 className="text-4xl md:text-7xl font-extrabold text-on-surface mt-2 font-headline">
                {w.temperature}<span className="text-3xl text-on-surface-variant ml-1">°C</span>
              </h3>
              <p className="text-lg text-on-surface-variant mt-1">{w.sky}</p>
            </div>
            <div className="text-right space-y-3 hidden md:block">
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-lg px-4 py-2.5">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">풍속 / 풍향</p>
                <p className="text-lg font-bold text-on-surface">{w.windSpeed}m/s <span className="text-on-surface-variant">{w.windDirection}</span></p>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-lg px-4 py-2.5">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">습도</p>
                <p className="text-lg font-bold text-on-surface">{w.humidity}%</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 md:gap-6 mt-4 md:mt-6 relative z-10 flex-wrap">
            <div className="flex items-center gap-2 bg-surface-container/40 rounded-lg px-3 py-2">
              <span className="text-xs text-on-surface-variant">미세먼지</span>
              <span className={`text-xs font-bold ${
                airQuality?.pm10Grade === '1' ? 'text-blue-400' :
                airQuality?.pm10Grade === '2' ? 'text-green-400' :
                airQuality?.pm10Grade === '3' ? 'text-amber-400' :
                airQuality?.pm10Grade === '4' ? 'text-red-400' : 'text-on-surface-variant'
              }`}>{airQuality ? airQuality.pm10Value : '로딩중'}{airQuality?.pm10Value !== '-' ? '㎍/㎥' : ''}</span>
            </div>
            <div className="flex items-center gap-2 bg-surface-container/40 rounded-lg px-3 py-2">
              <span className="text-xs text-on-surface-variant">초미세먼지</span>
              <span className={`text-xs font-bold ${
                airQuality?.pm25Grade === '1' ? 'text-blue-400' :
                airQuality?.pm25Grade === '2' ? 'text-green-400' :
                airQuality?.pm25Grade === '3' ? 'text-amber-400' :
                airQuality?.pm25Grade === '4' ? 'text-red-400' : 'text-on-surface-variant'
              }`}>{airQuality ? airQuality.pm25Value : '로딩중'}{airQuality?.pm25Value !== '-' ? '㎍/㎥' : ''}</span>
            </div>
            <div className="flex items-center gap-2 bg-surface-container/40 rounded-lg px-3 py-2">
              <span className="text-xs text-on-surface-variant">강수량</span>
              <span className="text-xs font-bold text-on-surface">{w.precipitation}mm</span>
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
                  <span className="text-secondary">{MOCK_ER_DATA.reduce((s, e) => s + e.available, 0)}</span>
                  <span className="text-lg text-on-surface-variant ml-1">/ {MOCK_ER_DATA.reduce((s, e) => s + e.total, 0)}</span>
                </h4>
              </div>
              <div className="p-2 bg-secondary/10 rounded-lg">
                <span className="material-symbols-outlined text-secondary text-2xl">emergency</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mt-3">반경 10km 내 {MOCK_ER_DATA.length}개 병원 기준</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              {MOCK_ER_DATA.slice(0, 3).map(er => (
                <span 
                  key={er.name} 
                  title={er.available < 0 ? "대기 중인 환자 수" : "잔여 병상 수"}
                  className={`text-[10px] px-2 py-1 rounded-full border cursor-help ${er.available > 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}
                >
                  {er.name.replace(/병원|대학교|서울/g, '').trim()} 
                  {er.available < 0 ? ` 대기 ${Math.abs(er.available)}명` : ` 잔여 ${er.available}석`}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => onNavigate('hydrants')} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-left hover:border-primary/30 transition-colors group relative overflow-hidden">
              <span className="material-symbols-outlined text-primary text-xl group-hover:scale-110 transition-transform">fire_hydrant</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1 font-headline">
                {isLoadingFacilities ? <span className="text-sm font-medium animate-pulse text-on-surface-variant">불러오는 중...</span> : hydrantsCount}
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
