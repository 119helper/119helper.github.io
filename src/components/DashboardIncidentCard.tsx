import { useEffect, useMemo, useState } from 'react';
import type { IncidentSession } from '../services/incidentSession';
import { formatDuration } from '../utils/activityReport';

interface DashboardIncidentCardProps {
  session: IncidentSession;
  routineCityLabel: string;
  onOpen: () => void;
}

export default function DashboardIncidentCard({
  session,
  routineCityLabel,
  onOpen,
}: DashboardIncidentCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session.active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.active]);

  const selectedActionCount = useMemo(
    () => Object.values(session.selections ?? {}).filter(Boolean).length,
    [session.selections],
  );
  const hasRecentIncident = !session.active
    && Boolean(session.title)
    && Boolean(session.endedAt);

  return (
    <section
      aria-labelledby="dashboard-incident-title"
      className={`group relative overflow-hidden rounded-2xl border shadow-sm ${
        session.active
          ? 'border-error/45 bg-error-container'
          : 'border-outline-variant/15 bg-surface-container-lowest'
      }`}
    >
      <img
        src="/images/tools/quick_incident.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
      />
      <div className={`absolute inset-0 ${
        session.active
          ? 'bg-gradient-to-r from-red-950/95 via-red-950/85 to-red-900/45'
          : 'bg-gradient-to-r from-slate-950/95 via-slate-950/82 to-slate-900/45'
      }`} />

      <div className="relative z-10 flex flex-col gap-4 p-5 text-white sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-xl ${
                session.active ? 'text-red-300' : 'text-blue-300'
              }`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {session.active ? 'emergency' : 'emergency_home'}
            </span>
            <p className={`text-xs font-extrabold uppercase tracking-[0.18em] ${
              session.active ? 'text-red-200' : 'text-blue-200'
            }`}>
              {session.active ? '출동 대응 진행 중' : '출동 대응 워크스페이스'}
            </p>
          </div>

          <h3 id="dashboard-incident-title" className="mt-2 truncate text-xl font-black sm:text-2xl">
            {session.active
              ? session.title || '진행 중인 출동'
              : '현장 대응이 필요할 때 한 번에 전환'}
          </h3>

          <p className="mt-1 max-w-3xl text-xs leading-5 text-white/75 sm:text-sm">
            {session.active
              ? session.address || '현장 주소를 확인해 상황판 브리핑을 이어가세요.'
              : '출동 유형과 주소를 연결하면 현장 기준 기상·진입로·소방용수·이송 정보를 한 흐름으로 확인합니다.'}
          </p>

          {session.active ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1 font-mono">
                경과 {formatDuration(Math.max(0, now - session.startedAt))}
              </span>
              <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1">
                선택한 조치 {selectedActionCount}건
              </span>
              <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1">
                평시 화면에서도 상태 유지
              </span>
              <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1">
                아래 정보는 {routineCityLabel} 관심 지역 기준
              </span>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-white/80">
              <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">상황판</span>
              <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">현장 기준 조회</span>
              <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">활동 기록</span>
              {hasRecentIncident && (
                <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
                  최근 종료 · {session.title}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpen}
          className={`flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 ${
            session.active
              ? 'bg-white text-red-900 hover:bg-red-50'
              : 'bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed/90'
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg">
            {session.active ? 'arrow_forward' : hasRecentIncident ? 'history' : 'play_arrow'}
          </span>
          {session.active
            ? '상황판 계속하기'
            : hasRecentIncident
              ? '최근 출동 확인'
              : '출동 대응 열기'}
        </button>
      </div>
    </section>
  );
}
