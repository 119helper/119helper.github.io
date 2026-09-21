import { formatTimeAgo } from '../hooks/useNotifications';
import type { NetworkStatusState } from '../hooks/useNetworkStatus';

interface DataStatusSummaryProps {
  status: NetworkStatusState;
  onOpenOfflineReadiness: () => void;
}

const STATUS_META = {
  online: {
    icon: 'cloud_done',
    label: '온라인',
    detail: '인터넷 연결이 감지되었습니다. 정보별 조회 상태를 확인하세요.',
    tone: 'border-green-500/25 bg-green-500/10 text-green-800 dark:text-green-200',
    iconTone: 'text-green-700 dark:text-green-300',
  },
  unstable: {
    icon: 'signal_disconnected',
    label: '연결 불안정',
    detail: '일부 화면에서 마지막 저장값을 표시할 수 있습니다.',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    iconTone: 'text-amber-700 dark:text-amber-300',
  },
  offline: {
    icon: 'cloud_off',
    label: '오프라인',
    detail: '실시간 정보가 제한됩니다. 화면별 데이터 시각을 확인하세요.',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    iconTone: 'text-amber-700 dark:text-amber-300',
  },
} as const;

export default function DataStatusSummary({ status, onOpenOfflineReadiness }: DataStatusSummaryProps) {
  const meta = STATUS_META[status.state];
  const groups = [
    { label: '날씨', prefix: '/api/weather' },
    { label: '응급실', prefix: '/api/er/' },
    { label: '도로', prefix: '/api/road-disasters' },
  ].map(group => ({ ...group, entries: Object.entries(status.services ?? {}).filter(([path]) => path.startsWith(group.prefix)).map(([, value]) => value) }));
  return (
    <section aria-label="데이터 상태" className={`m-2 rounded-xl border p-3 ${meta.tone}`}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={`material-symbols-outlined mt-0.5 text-xl ${meta.iconTone}`}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">데이터 상태 · {meta.label}</h3>
            {status.lastSuccessAt && (
              <span className="shrink-0 text-[10px] font-bold opacity-75">정상 응답 {formatTimeAgo(new Date(status.lastSuccessAt))}</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 opacity-90">{meta.detail}</p>
          <ul className="mt-2 space-y-1 text-xs" aria-label="정보별 조회 상태">
            {groups.map(group => {
              const ok = group.entries.length > 0 && group.entries.every(entry => entry.ok);
              const times = group.entries.map(entry => entry.lastSuccessAt);
              const last = times.length && times.every(time => time !== null) ? Math.min(...times as number[]) : null;
              return <li key={group.label}>{group.label} · {group.entries.length === 0 ? '아직 조회하지 않음' : ok ? '조회 성공' : '조회 실패 / 저장값 확인 필요'}{last ? ` · 마지막 성공 ${formatTimeAgo(new Date(last))}` : ''}</li>;
            })}
          </ul>
          <p className="mt-1 text-[10px] leading-4 opacity-75">캐시 사용 시 각 화면에 ‘몇 분 전 데이터’ 배지가 표시됩니다.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenOfflineReadiness}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-surface-container-lowest/75 px-3 py-2 text-xs font-extrabold text-on-surface hover:bg-surface-container-high"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-base">offline_bolt</span>
        오프라인 준비 상태 확인
      </button>
    </section>
  );
}
