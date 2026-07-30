import { useMemo } from 'react';
import { useIncidentChangeMonitor } from '../contexts/IncidentChangeMonitorContext';
import type { TabId } from '../types/navigation';

interface IncidentChangeGlobalBannerProps {
  incidentActive: boolean;
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
}

export default function IncidentChangeGlobalBanner({
  incidentActive,
  activeTab,
  onNavigate,
}: IncidentChangeGlobalBannerProps) {
  const { alerts } = useIncidentChangeMonitor();
  const criticalCount = useMemo(
    () => alerts.filter(alert => alert.severity === 'critical').length,
    [alerts],
  );

  if (!incidentActive || activeTab === 'incident' || alerts.length === 0) return null;

  const accessibleLabel =
    `현장 변화 ${alerts.length}건, 긴급 ${criticalCount}건. 출동 상황판에서 확인`;

  return (
    <aside
      aria-live={criticalCount > 0 ? 'assertive' : 'polite'}
      className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 sm:px-5"
    >
      <div className="mx-auto max-w-[1600px]">
        <button
          type="button"
          aria-label={accessibleLabel}
          onClick={() => onNavigate('incident')}
          className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-amber-500/25 bg-surface-container-lowest px-3 py-2 text-left text-amber-950 shadow-sm transition-colors hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:text-amber-100"
        >
          <span
            aria-hidden="true"
            className={`material-symbols-outlined shrink-0 text-xl ${
              criticalCount > 0 ? 'text-error' : 'text-amber-700 dark:text-amber-300'
            }`}
          >
            {criticalCount > 0 ? 'notification_important' : 'notifications_active'}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
            현장 변화 {alerts.length}건
            <span className="ml-2 rounded-full bg-error/10 px-2 py-0.5 text-[11px] text-error">
              긴급 {criticalCount}건
            </span>
          </span>
          <span className="hidden shrink-0 text-xs font-extrabold sm:inline">
            상황판에서 확인
          </span>
          <span className="shrink-0 text-xs font-extrabold sm:hidden">확인</span>
          <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-lg">
            arrow_forward
          </span>
        </button>
      </div>
    </aside>
  );
}
