import { useState, useEffect } from 'react';
import { fetchOfficialWeatherAlerts, type OfficialWeatherAlertResponse } from '../services/weatherAlertApi';
import { getStaleAt } from '../services/apiClient';
import StaleBadge from './StaleBadge';

export default function WeatherAlertBanner({ city }: { city: string }) {
  const [result, setResult] = useState<OfficialWeatherAlertResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setIsVisible(true);

    fetchOfficialWeatherAlerts(city)
      .then(data => {
        if (!isMounted) return;
        setResult(data);
      })
      .catch(err => {
        console.warn('[WeatherAlertBanner] failed:', err);
        if (!isMounted) return;
        setResult(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [city]);

  if (loading || !result || result.alerts.length === 0 || !isVisible) return null;

  const primary = result.alerts[0];
  const warningLabels = [...new Set(result.alerts.map(alert => `${alert.warning} ${alert.level}`))];
  const regions = [...new Set(result.alerts.map(alert => alert.regionName))];
  const regionSummary = regions.length <= 3
    ? regions.join(', ')
    : `${regions.slice(0, 3).join(', ')} 외 ${regions.length - 3}곳`;
  const announcedAt = primary.announcedAt
    ? new Date(primary.announcedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '발표 시각 확인 중';
  const staleAt = getStaleAt(result);

  return (
    <div className="bg-gradient-to-r from-red-600 to-red-800 border border-red-500 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 text-white shadow-xl shadow-red-900/20 mb-6 animate-fade-in">
      <div className="flex items-start gap-4 flex-1">
        <span className="material-symbols-outlined text-red-200 text-3xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm">🚨 기상청 공식 특보 발효 중</p>
            <span className="bg-red-900/50 text-red-200 text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">{announcedAt}</span>
            <StaleBadge at={staleAt} />
          </div>
          <p className="text-white/90 text-sm mt-1 font-medium">
            {city} · {warningLabels.join(' · ')}
          </p>
          <p className="text-red-100/80 text-xs mt-1">{regionSummary} · {result.source}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a 
          href={result.sourceUrl}
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center text-xs bg-white text-red-700 font-bold px-4 h-8 rounded-lg hover:bg-red-50 transition-colors shadow-sm whitespace-nowrap"
        >
          기상청 특보 보기
        </a>
        <button 
          onClick={() => setIsVisible(false)} 
          aria-label="기상특보 배너 닫기"
          className="flex items-center justify-center bg-red-900/40 text-red-100 w-8 h-8 rounded-lg hover:bg-red-900/60 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}
