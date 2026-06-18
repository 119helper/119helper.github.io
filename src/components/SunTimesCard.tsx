import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CITY_COORDS } from '../utils/locationResolver';
import {
  getSunTimes,
  getDayLengthMs,
  getDayProgress,
  isDaytime,
  formatDuration,
  type SunTimes,
} from '../utils/sunTimes';

interface SunTimesCardProps {
  /** 내부 도시키 (seoul, busan, ...) */
  city: string;
  /** 표시용 지역명 (예: 서울) */
  cityLabel?: string;
}

function fmtKst(date: Date | null): string {
  if (!date) return '–';
  return date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 태양 진행 아크 (반원). progress 0~1 위치에 태양을 그린다. */
function SunArc({ progress, daytime }: { progress: number; daytime: boolean }) {
  // 반원 경로: (10,60) → (150,60), 정점 (80,10)
  const angle = Math.PI * (1 - progress); // 좌(π)→우(0)
  const cx = 80 + 70 * Math.cos(angle);
  const cy = 60 - 50 * Math.sin(angle);
  return (
    <svg viewBox="0 0 160 70" className="w-full h-16" aria-hidden="true">
      <path d="M10 60 A 70 50 0 0 1 150 60" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" strokeDasharray="3 3" />
      <line x1="10" y1="60" x2="150" y2="60" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={daytime ? 7 : 5} fill={daytime ? '#fbbf24' : '#64748b'} className={daytime ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]' : ''} />
    </svg>
  );
}

export default function SunTimesCard({ city, cityLabel }: SunTimesCardProps) {
  // 1분마다 현재 시각 갱신 → 진행률·남은 시간 라이브
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const coords = SUPPORTED_CITY_COORDS[city] || SUPPORTED_CITY_COORDS.seoul;

  // 날짜가 바뀔 때만 재계산 (자정 경계). 분 단위 now 변화엔 재계산 불필요.
  const dayKey = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const times: SunTimes = useMemo(
    () => getSunTimes(now, coords.lat, coords.lng),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, coords.lat, coords.lng],
  );

  const daytime = isDaytime(times, now);
  const progress = getDayProgress(times, now);
  const dayLen = getDayLengthMs(times);

  // 현장 참고: 낮이면 일몰까지, 밤이면 다음 일출까지 남은 시간
  const remaining = useMemo(() => {
    if (daytime && times.sunset) {
      return { label: '일몰까지', ms: times.sunset.getTime() - now.getTime() };
    }
    if (!daytime && times.sunrise && now < times.sunrise) {
      return { label: '일출까지', ms: times.sunrise.getTime() - now.getTime() };
    }
    return null;
  }, [daytime, times, now]);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 flex-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
          {daytime ? '☀️' : '🌙'} 일출 · 일몰{cityLabel ? ` (${cityLabel})` : ''}
        </p>
        {remaining && remaining.ms > 0 && (
          <span className="text-[11px] font-bold text-amber-400">
            {remaining.label} {formatDuration(remaining.ms)}
          </span>
        )}
      </div>

      <div className="text-amber-400/90">
        <SunArc progress={progress} daytime={daytime} />
      </div>

      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="bg-surface-container/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-on-surface-variant mb-0.5">🌅 일출</p>
          <p className="text-lg font-bold text-on-surface font-headline">{fmtKst(times.sunrise)}</p>
        </div>
        <div className="bg-surface-container/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-on-surface-variant mb-0.5">🌇 일몰</p>
          <p className="text-lg font-bold text-on-surface font-headline">{fmtKst(times.sunset)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-on-surface-variant border-t border-outline-variant/10 pt-2 mt-2">
        <span>여명 {fmtKst(times.dawn)} · 땅거미 {fmtKst(times.dusk)}</span>
        {dayLen !== null && <span className="font-bold text-on-surface-variant">낮 {formatDuration(dayLen)}</span>}
      </div>
    </div>
  );
}
