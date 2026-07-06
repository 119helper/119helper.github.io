import { classifyAviationSafety } from '../utils/aviationSafety';
import type { CurrentWeather } from '../services/weatherApi';

interface AviationSafetyCardProps {
  weather: CurrentWeather | null;
  loading?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export default function AviationSafetyCard({ weather, loading = false, compact = false, onClick }: AviationSafetyCardProps) {
  const result = classifyAviationSafety(weather?.windSpeed);
  const speedText = weather ? `${weather.windSpeed}m/s` : '--';
  const direction = weather?.windDirection ?? '풍향 미확인';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full text-left border rounded-xl transition-colors ${result.colorClass} ${compact ? 'p-3' : 'p-5'} ${onClick ? 'hover:bg-surface-container-high/40 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{result.icon}</span>
            <span className="text-xs font-bold uppercase tracking-wider">항공/드론</span>
          </div>
          <div className={`${compact ? 'text-lg' : 'text-2xl'} font-extrabold mt-1 text-on-surface`}>
            {loading ? '풍속 확인 중' : result.label}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-black/10 px-2.5 py-1 text-xs font-bold">{result.badge}</span>
      </div>

      {!compact && (
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          {result.detail}
        </p>
      )}

      <div className={`grid grid-cols-2 gap-2 ${compact ? 'mt-2' : 'mt-4'}`}>
        <div className="rounded-lg bg-surface-container/60 px-3 py-2">
          <div className="text-[10px] text-on-surface-variant">현재 풍속</div>
          <div className="font-mono text-sm font-bold text-on-surface">{speedText}</div>
        </div>
        <div className="rounded-lg bg-surface-container/60 px-3 py-2">
          <div className="text-[10px] text-on-surface-variant">풍향</div>
          <div className="text-sm font-bold text-on-surface truncate">{direction}</div>
        </div>
      </div>
    </button>
  );
}
