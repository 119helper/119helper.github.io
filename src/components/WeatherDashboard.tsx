import { useState, useEffect, useCallback } from 'react';
import {
  getUltraShortNow, getShortTermFcst, getMidTermLand, getMidTermTemp, getWeatherBriefing,
  parseCurrentWeather, parseHourlyForecast,
  CITY_GRIDS,
  type CurrentWeather, type HourlyForecast, type MidTermForecast, type MidTermTemp,
} from '../services/weatherApi';
import { getRealtimeAirQuality, type AirQualityData } from '../services/airQualityApi';

// Fallback data when API fails
const FALLBACK_WEATHER: CurrentWeather = {
  temperature: 0, humidity: 0, windSpeed: 0, windDirection: '–',
  sky: '로딩 중...', skyIcon: '⏳', precipitation: '–',
  precipType: '–', precipIcon: '', lastUpdate: '–',
};

interface WeatherDashboardProps {
  city: string;
}

export default function WeatherDashboard({ city }: WeatherDashboardProps) {
  const [current, setCurrent] = useState<CurrentWeather>(FALLBACK_WEATHER);
  const [hourly, setHourly] = useState<HourlyForecast[]>([]);
  const [midLand, setMidLand] = useState<MidTermForecast | null>(null);
  const [midTemp, setMidTemp] = useState<MidTermTemp | null>(null);
  const [briefing, setBriefing] = useState('');
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');

  const grid = CITY_GRIDS[city] || CITY_GRIDS['seoul'];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nowItems, fcstItems, midL, midT, brief, aqRes] = await Promise.allSettled([
        getUltraShortNow(grid.nx, grid.ny),
        getShortTermFcst(grid.nx, grid.ny),
        getMidTermLand(),
        getMidTermTemp(),
        getWeatherBriefing(),
        getRealtimeAirQuality(city),
      ]);

      if (nowItems.status === 'fulfilled' && nowItems.value.length > 0) {
        setCurrent(parseCurrentWeather(nowItems.value));
      } else if (fcstItems.status === 'fulfilled' && fcstItems.value.length > 0) {
        setCurrent(parseCurrentWeather(fcstItems.value));
        setError('초단기실황 API 응답 없음 → 단기예보 데이터로 대체 중');
      } else {
        setError('날씨 데이터를 가져올 수 없습니다. API 키를 확인하세요.');
      }
      if (fcstItems.status === 'fulfilled') setHourly(parseHourlyForecast(fcstItems.value));
      if (midL.status === 'fulfilled') setMidLand(midL.value);
      if (midT.status === 'fulfilled') setMidTemp(midT.value);
      if (brief.status === 'fulfilled') setBriefing(brief.value);
      if (aqRes.status === 'fulfilled') setAirQuality(aqRes.value);

      setLastRefresh(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setError('API 호출 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [grid.nx, grid.ny, city]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const formatTime = (t: string) => `${t.slice(0, 2)}시`;
  const formatDate = (d: string) => `${d.slice(4, 6)}/${d.slice(6, 8)}`;

  const getBgGradient = () => {
    if (current.precipType.includes('비') || current.precipType.includes('소나기') || current.precipType === '빗방울') {
      return 'from-slate-900 via-blue-900/40 to-sky-900/20 border-blue-500/30 shadow-[inset_0_0_80px_rgba(30,58,138,0.2)]';
    }
    if (current.precipType.includes('눈')) {
      return 'from-slate-800 via-indigo-900/30 to-gray-800/20 border-indigo-400/30 shadow-[inset_0_0_80px_rgba(79,70,229,0.15)]';
    }
    if (current.sky === '맑음') {
      return 'from-amber-900/40 via-orange-900/20 to-yellow-900/10 border-amber-500/30 shadow-[inset_0_0_80px_rgba(217,119,6,0.15)]';
    }
    if (current.sky.includes('흐림') || current.sky.includes('구름')) {
      return 'from-slate-800 via-gray-800/50 to-slate-700/30 border-gray-500/30 shadow-[inset_0_0_80px_rgba(100,116,139,0.1)]';
    }
    return 'from-blue-900/30 via-indigo-900/20 to-cyan-900/10 border-blue-500/10';
  };

  const getAccentColor = () => {
    if (current.precipType.includes('비') || current.precipType.includes('소나기') || current.precipType === '빗방울') return 'text-blue-300/80';
    if (current.precipType.includes('눈')) return 'text-indigo-300/80';
    if (current.sky === '맑음') return 'text-amber-400/80';
    if (current.sky.includes('흐림') || current.sky.includes('구름')) return 'text-slate-400';
    return 'text-blue-300/60';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🌤️ 기상 정보</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            기상청 API Hub 실시간 연동 · <span className="text-primary font-bold">{grid.name}</span>
            {lastRefresh && <span className="ml-2 text-on-surface-variant">· 갱신 {lastRefresh}</span>}
          </p>
        </div>
        <button onClick={fetchAll} disabled={loading} className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          새로고침
        </button>
      </div>

      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-300 text-sm flex items-center gap-3">
          <span className="material-symbols-outlined">info</span>
          {error}
        </div>
      )}

      {/* Main Weather + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Big Current Weather */}
        <div className={`lg:col-span-8 bg-gradient-to-br ${getBgGradient()} border rounded-xl p-6 lg:p-10 relative overflow-hidden transition-all duration-1000`}>
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/5 rounded-full blur-3xl transition-opacity duration-1000"></div>
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold uppercase tracking-widest transition-colors duration-1000 ${getAccentColor()}`}>현재 날씨</p>
                <span className="text-xs bg-surface-container/50 px-2 py-0.5 rounded text-on-surface-variant">{grid.name}</span>
              </div>
              <div className="flex items-end gap-4 mt-4">
                <span className="text-6xl">{current.skyIcon}</span>
                <h3 className="text-8xl font-extrabold text-on-surface font-headline leading-none">
                  {current.temperature}<span className="text-3xl text-on-surface-variant">°C</span>
                </h3>
              </div>
              <p className="text-xl text-on-surface-variant mt-2">{current.sky} {current.precipType !== '없음' ? `· ${current.precipType}` : ''}</p>
            </div>
            <div className="space-y-3 text-right">
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-lg px-5 py-3">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">풍속 / 풍향</p>
                <p className="text-xl font-bold text-on-surface">{current.windSpeed}m/s <span className="text-on-surface-variant text-sm">{current.windDirection}</span></p>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-lg px-5 py-3">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">습도</p>
                <p className="text-xl font-bold text-on-surface">{current.humidity}%</p>
              </div>
              <div className="bg-surface-container/60 backdrop-blur-sm rounded-lg px-5 py-3">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">강수량</p>
                <p className="text-xl font-bold text-on-surface">{current.precipitation}mm</p>
              </div>
            </div>
          </div>
        </div>

        {/* Side Info Cards */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Fire Risk Assessment */}
          <div className={`rounded-xl p-5 border flex-1 ${
            current.humidity < 35 ? 'bg-red-900/30 border-red-500/30' :
            current.humidity < 50 ? 'bg-amber-900/20 border-amber-500/20' :
            'bg-green-900/20 border-green-500/20'
          }`}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">🔥 화재 위험도</p>
            <p className={`text-3xl font-extrabold mt-2 font-headline ${
              current.humidity < 35 ? 'text-red-400' :
              current.humidity < 50 ? 'text-amber-400' : 'text-green-400'
            }`}>
              {current.humidity < 35 ? '높음' : current.humidity < 50 ? '보통' : '낮음'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              습도 {current.humidity}% · 풍속 {current.windSpeed}m/s
            </p>
            {current.humidity < 35 && <p className="text-xs text-red-300 mt-2 font-bold">⚠️ 건조주의! 화재 확산 위험</p>}
            {current.windSpeed > 10 && <p className="text-xs text-amber-300 mt-1 font-bold">💨 강풍! 고층 화재 주의</p>}
          </div>

          {/* Air Quality (AirKorea) */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-3">😷 대기환경 (에어코리아)</p>
            {airQuality ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-on-surface-variant">종합 (KHAI)</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                    airQuality.khaiGrade === '1' ? 'bg-blue-500/20 text-blue-400' :
                    airQuality.khaiGrade === '2' ? 'bg-green-500/20 text-green-400' :
                    airQuality.khaiGrade === '3' ? 'bg-amber-500/20 text-amber-400' :
                    airQuality.khaiGrade === '4' ? 'bg-red-500/20 text-red-500' : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    {airQuality.khaiGrade === '1' ? '좋음' : airQuality.khaiGrade === '2' ? '보통' : airQuality.khaiGrade === '3' ? '나쁨' : airQuality.khaiGrade === '4' ? '매우나쁨' : (airQuality.khaiValue !== '-' ? airQuality.khaiValue : '조회 중')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-surface-container/50 rounded-lg p-2">
                    <p className="text-[10px] text-on-surface-variant mb-1">PM10 (미세먼지)</p>
                    <p className="text-sm font-bold text-on-surface">{airQuality.pm10Value} <span className="text-[9px] font-normal">㎍/㎥</span></p>
                  </div>
                  <div className="bg-surface-container/50 rounded-lg p-2">
                    <p className="text-[10px] text-on-surface-variant mb-1">PM2.5 (초미세먼지)</p>
                    <p className="text-sm font-bold text-on-surface">{airQuality.pm25Value} <span className="text-[9px] font-normal">㎍/㎥</span></p>
                  </div>
                </div>
                <p className="text-[10px] text-on-surface-variant text-right border-t border-outline-variant/10 pt-2 mt-2">{airQuality.stationName} 측정소 기준</p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">데이터 동기화 중...</p>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-3">🎯 현장 활동 참고</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">체감온도</span>
                <span className="font-bold text-on-surface">
                  {(13.12 + 0.6215 * current.temperature - 11.37 * Math.pow(Math.max(current.windSpeed * 3.6, 4.8), 0.16) + 0.3965 * current.temperature * Math.pow(Math.max(current.windSpeed * 3.6, 4.8), 0.16)).toFixed(1)}°C
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">동상 위험</span>
                <span className={`font-bold ${current.temperature < -10 ? 'text-red-400' : current.temperature < 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {current.temperature < -10 ? '높음' : current.temperature < 0 ? '주의' : '없음'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">열사병 위험</span>
                <span className={`font-bold ${current.temperature > 33 ? 'text-red-400' : current.temperature > 28 ? 'text-amber-400' : 'text-green-400'}`}>
                  {current.temperature > 33 ? '높음' : current.temperature > 28 ? '주의' : '없음'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Forecast Chart */}
      {hourly.length > 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-outline-variant/10 flex items-center justify-between">
            <h3 className="text-lg font-bold text-on-surface font-headline">⏰ 시간별 예보 (단기예보)</h3>
            <span className="text-xs text-on-surface-variant">{hourly.length}시간</span>
          </div>
          <div className="overflow-x-auto hidden-scrollbar">
            <div className="flex min-w-max">
              {hourly.slice(0, 24).map((h, i) => (
                <div key={i} className={`flex flex-col items-center px-4 pt-6 pb-4 min-w-[72px] border-r border-outline-variant/5 relative ${
                  h.time === '0000' ? 'bg-surface-container/30 border-l-2 border-l-primary/30' : ''
                }`}>
                  {h.time === '0000' && <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] text-primary font-bold bg-primary/10 px-2 py-1 rounded-b-md">{formatDate(h.date)}</span>}
                  <span className="text-xs text-on-surface-variant">{formatTime(h.time)}</span>
                  <span className="text-2xl my-2">{h.precipIcon || h.skyIcon}</span>
                  <span className="text-lg font-bold text-on-surface">{h.temp}°</span>
                  {h.pop > 0 && <span className="text-[10px] text-blue-400 font-bold mt-1">💧{h.pop}%</span>}
                  <span className="text-[10px] text-on-surface-variant mt-1">{h.windSpeed}m/s</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mid-Term + Briefing Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mid-term forecast */}
        <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-lg font-bold text-on-surface font-headline mb-4">📅 주간 예보 (중기예보)</h3>
          {midLand && midTemp ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[3, 4, 5, 6, 7].map(day => {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + day);
                const dayName = ['일', '월', '화', '수', '목', '금', '토'][futureDate.getDay()];
                const amWf = (midLand as any)[`wf${day}Am`] || '–';
                const pmWf = (midLand as any)[`wf${day}Pm`] || '–';
                const tMin = (midTemp as any)[`taMin${day}`] ?? '–';
                const tMax = (midTemp as any)[`taMax${day}`] ?? '–';
                const rain = (midLand as any)[`rnSt${day}Pm`] ?? 0;

                return (
                  <div key={day} className="bg-surface-container rounded-xl p-4 text-center">
                    <p className="text-xs text-on-surface-variant font-bold">
                      {futureDate.getMonth() + 1}/{futureDate.getDate()} ({dayName})
                    </p>
                    <p className="text-sm text-on-surface mt-2">{amWf}</p>
                    <p className="text-xs text-on-surface-variant">{pmWf}</p>
                    <div className="mt-2">
                      <span className="text-blue-400 text-sm font-bold">{tMin}°</span>
                      <span className="text-on-surface-variant mx-1">/</span>
                      <span className="text-red-400 text-sm font-bold">{tMax}°</span>
                    </div>
                    {rain > 0 && <p className="text-[10px] text-blue-400 mt-1">💧{rain}%</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">중기예보 데이터 로딩 중...</p>
          )}
        </div>

        {/* Briefing */}
        <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-lg font-bold text-on-surface font-headline mb-4">📋 기상 브리핑</h3>
          <div className="bg-surface-container rounded-lg p-4">
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">
              {briefing || '기상개황 데이터를 불러오는 중...'}
            </p>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-3 italic">기상청 기상개황 조회 API 제공</p>
        </div>
      </div>
    </div>
  );
}
