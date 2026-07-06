import { useCallback, useEffect, useState } from 'react';
import AviationSafetyCard from './AviationSafetyCard';
import {
  CITY_GRIDS,
  getUltraShortNow,
  parseCurrentWeather,
  type CurrentWeather,
} from '../services/weatherApi';

interface AviationViewProps {
  city: string;
}

export default function AviationView({ city }: AviationViewProps) {
  const grid = CITY_GRIDS[city] || CITY_GRIDS.seoul;
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await getUltraShortNow(grid.nx, grid.ny);
      if (items.length === 0) {
        setWeather(null);
        setError('풍속 데이터를 불러오지 못했습니다.');
        return;
      }
      setWeather(parseCurrentWeather(items));
      setLastRefresh(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.warn('[AviationView] weather failed:', e);
      setWeather(null);
      setError('기상 API 호출 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [grid.nx, grid.ny]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">항공/드론 비행 안전</h2>
          <p className="text-sm text-on-surface-variant mt-1">풍속 기준으로 정찰 드론·항공 운용 전 1차 판단을 돕습니다.</p>
        </div>
        <button
          type="button"
          onClick={fetchWeather}
          disabled={loading}
          className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          {lastRefresh ? `${lastRefresh} 갱신` : '새로고침'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AviationSafetyCard weather={weather} loading={loading} />
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
          <h3 className="text-lg font-bold text-on-surface">판정 기준</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-green-500/10 px-3 py-2 text-green-400">
              <span className="font-bold">7m/s 미만</span>
              <span>비행 양호</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
              <span className="font-bold">7~10m/s 미만</span>
              <span>돌풍 감시</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-red-400">
              <span className="font-bold">10m/s 이상</span>
              <span>비행 자제</span>
            </div>
          </div>
          <p className="text-xs leading-5 text-on-surface-variant">
            지형풍, 고층 건물 주변 난류, 강수, 시정, 조종자 숙련도, 기관 SOP는 별도로 확인하세요.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300">
          {error}
        </div>
      )}
    </div>
  );
}
