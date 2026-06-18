import { useEffect, useState } from 'react';
import { getForestFireRisk, type ForestFireRiskData, type ForestFireRiskLevel } from '../services/forestFireRiskApi';

interface ForestFireRiskCardProps {
  cityLabel: string;
  humidity: number;
  windSpeed: number;
}

const LEVEL_CLASS: Record<ForestFireRiskLevel, { bg: string; border: string; text: string; badge: string }> = {
  낮음: {
    bg: 'bg-green-900/20',
    border: 'border-green-500/20',
    text: 'text-green-400',
    badge: 'bg-green-500/20 text-green-300',
  },
  보통: {
    bg: 'bg-amber-900/20',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300',
  },
  높음: {
    bg: 'bg-orange-900/25',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-300',
  },
  '매우 높음': {
    bg: 'bg-red-900/30',
    border: 'border-red-500/30',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300',
  },
};

function fallbackLevel(humidity: number, windSpeed: number): ForestFireRiskLevel {
  if (humidity < 35 || windSpeed >= 10) return '높음';
  if (humidity < 50 || windSpeed >= 7) return '보통';
  return '낮음';
}

function formatTime(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(4, 6)}/${digits.slice(6, 8)} ${digits.slice(8, 10)}시`;
  }
  if (digits.length === 8) {
    return `${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
  }
  return value;
}

function formatFetchedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function ForestFireRiskCard({ cityLabel, humidity, windSpeed }: ForestFireRiskCardProps) {
  const [risk, setRisk] = useState<ForestFireRiskData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getForestFireRisk(cityLabel)
      .then(data => {
        if (alive) setRisk(data);
      })
      .catch(() => {
        if (alive) setRisk(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [cityLabel]);

  const level = risk?.level || fallbackLevel(humidity, windSpeed);
  const tone = LEVEL_CLASS[level];

  return (
    <div className={`rounded-xl p-5 border flex-1 ${tone.bg} ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">🔥 산불위험지수</p>
          <p className="text-xs text-on-surface-variant mt-1">{cityLabel} · 산림청 예보</p>
        </div>
        <span className={`px-2 py-1 rounded text-[10px] font-black ${tone.badge}`}>
          {level}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-8 w-24 rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-40 rounded bg-white/10 animate-pulse" />
        </div>
      ) : risk ? (
        <>
          <div className="flex items-end gap-2 mt-3">
            <p className={`text-4xl font-extrabold font-headline tabular-nums ${tone.text}`}>
              {Math.round(risk.value)}
            </p>
            <p className="text-xs text-on-surface-variant mb-1">관내 최대</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="bg-black/10 rounded-lg p-2">
              <p className="text-[10px] text-on-surface-variant">최소</p>
              <p className="text-sm font-bold text-on-surface tabular-nums">{risk.min ?? '-'}</p>
            </div>
            <div className="bg-black/10 rounded-lg p-2">
              <p className="text-[10px] text-on-surface-variant">평균</p>
              <p className="text-sm font-bold text-on-surface tabular-nums">{risk.avg ?? '-'}</p>
            </div>
            <div className="bg-black/10 rounded-lg p-2">
              <p className="text-[10px] text-on-surface-variant">최대</p>
              <p className="text-sm font-bold text-on-surface tabular-nums">{risk.max ?? risk.value}</p>
            </div>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-3">
            {risk.forecastTime ? `예보 ${formatTime(risk.forecastTime)}` : `갱신 ${formatFetchedAt(risk.fetchedAt)}`}
            {risk.staleAt ? ' · 캐시 데이터' : ''}
          </p>
        </>
      ) : (
        <>
          <p className={`text-3xl font-extrabold mt-3 font-headline ${tone.text}`}>
            설정 대기
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            공식 API 키 등록 후 자동으로 표시됩니다.
          </p>
          <p className="text-xs text-on-surface-variant mt-2">
            임시 참고: 습도 {humidity}% · 풍속 {windSpeed}m/s
          </p>
        </>
      )}

      {!loading && windSpeed > 10 && (
        <p className="text-xs text-amber-300 mt-2 font-bold">💨 강풍 시 산불 확산 주의</p>
      )}
    </div>
  );
}
