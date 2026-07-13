import { useEffect, useMemo, useState } from 'react';
import { useTimer } from '../contexts/TimerContext';
import type { IncidentSession, IncidentType } from '../services/incidentSession';
import type { TabId } from '../types/navigation';
import { formatDuration } from '../utils/activityReport';

const TYPE_META: Record<IncidentType, { icon: string; label: string }> = {
  fire: { icon: 'local_fire_department', label: '화재' },
  ems: { icon: 'ambulance', label: '구급' },
  rescue: { icon: 'emergency', label: '구조' },
  support: { icon: 'support_agent', label: '지원' },
};

interface IncidentStatusStripProps {
  session: IncidentSession;
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
}

export default function IncidentStatusStrip({ session, activeTab, onNavigate }: IncidentStatusStripProps) {
  const [now, setNow] = useState(() => Date.now());
  const { timers, formatTime } = useTimer();

  useEffect(() => {
    if (!session.active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.active]);

  const nearestTimer = useMemo(() => (
    timers
      .filter(timer => timer.isRunning)
      .sort((a, b) => a.remaining - b.remaining)[0]
  ), [timers]);

  if (!session.active) return null;
  const type = TYPE_META[session.type];

  return (
    <section
      aria-label="진행 중인 출동"
      className="shrink-0 border-b border-error/30 bg-error-container/95 px-3 py-2 text-on-error-container shadow-sm backdrop-blur-md sm:px-5"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-2">
        <button
          type="button"
          aria-current={activeTab === 'incident' ? 'page' : undefined}
          aria-label={`진행 중인 ${type.label} 출동 상황판 열기`}
          onClick={() => onNavigate('incident')}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-error/10 focus:outline-none focus:ring-2 focus:ring-error/30"
        >
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-error" />
          </span>
          <span aria-hidden="true" className="material-symbols-outlined text-xl text-error">{type.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-sm font-extrabold text-on-surface">{session.title}</span>
              <span className="hidden shrink-0 text-[11px] font-bold text-on-surface-variant sm:inline">{type.label} 출동</span>
            </span>
            {session.address && <span className="hidden truncate text-[11px] text-on-surface-variant md:block">{session.address}</span>}
          </span>
          <span className="shrink-0 font-mono text-base font-black tabular-nums text-error">
            {formatDuration(Math.max(0, now - session.startedAt))}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'field-timer' ? 'page' : undefined}
          aria-label={nearestTimer ? `${nearestTimer.label} ${formatTime(nearestTimer.remaining)} 남음, 현장 타이머 열기` : '현장 타이머 열기'}
          onClick={() => onNavigate('field-timer')}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-error/20 bg-surface-container-lowest/80 px-2.5 py-2 text-xs font-bold text-on-surface shadow-sm hover:bg-surface-container"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base text-error">timer</span>
          <span className="hidden sm:inline">{nearestTimer?.label ?? '타이머'}</span>
          {nearestTimer && <span className="font-mono tabular-nums">{formatTime(nearestTimer.remaining)}</span>}
        </button>
      </div>
    </section>
  );
}
