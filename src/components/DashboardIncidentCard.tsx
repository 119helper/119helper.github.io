import type { IncidentSession } from '../services/incidentSession';

interface DashboardIncidentCardProps {
  session: IncidentSession;
  onOpen: () => void;
}

export default function DashboardIncidentCard({
  session,
  onOpen,
}: DashboardIncidentCardProps) {
  // 진행 중 출동은 앱 전역 상태띠가 주소·경과시간·상황판 진입을 계속 제공한다.
  // 평시 대시보드에서는 같은 정보를 다시 크게 노출하지 않는다.
  if (session.active) return null;

  const hasRecentIncident = !session.active
    && Boolean(session.title)
    && Boolean(session.endedAt);

  return (
    <section
      aria-label="출동 대응 바로가기"
      className="flex items-center gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-3 py-2.5 shadow-sm sm:px-4"
    >
      <span
        aria-hidden="true"
        className="material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error/10 text-lg text-error"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {hasRecentIncident ? 'history' : 'emergency_home'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
          현장 대응
        </p>
        <h3 className="truncate text-sm font-extrabold text-on-surface">
          {hasRecentIncident
            ? `최근 종료 · ${session.title}`
            : '출동이 생기면 전용 상황판으로 전환'}
        </h3>
        <p className="mt-0.5 hidden truncate text-xs text-on-surface-variant sm:block">
          {hasRecentIncident
            ? '최근 기록을 확인하거나 새 출동 대응을 시작할 수 있습니다.'
            : '출동 유형과 현장 위치를 입력하면 현장 기준 브리핑이 시작됩니다.'}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="ui-button ui-button--secondary ui-button--sm min-h-11 shrink-0"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-base">
          {hasRecentIncident ? 'history' : 'arrow_forward'}
        </span>
        {hasRecentIncident ? '최근 출동 확인' : '출동 대응 열기'}
      </button>
    </section>
  );
}
