import { useCallback, useEffect, useState } from 'react';
import { getStaleAt } from '../services/apiClient';
import {
  getDamDischargeStatus,
  type DamDischargeEvent,
  type DamDischargeStatus,
} from '../services/damDischargeApi';
import DataStatePanel from './DataStatePanel';
import StaleBadge from './StaleBadge';

function formatDateTime(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) return value || '-';
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return digits.length >= 12 ? `${date} ${digits.slice(8, 10)}:${digits.slice(10, 12)}` : date;
}
function isActive(event: DamDischargeEvent): boolean {
  if (!event.endedAt) return true;
  const digits = event.endedAt.replace(/\D/g, '').padEnd(14, '0').slice(0, 14);
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+09:00`;
  const endedAt = Date.parse(iso);
  return Number.isFinite(endedAt) && endedAt > Date.now();
}

export default function DamDischargeView() {
  const [status, setStatus] = useState<DamDischargeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staleAt, setStaleAt] = useState<number | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const next = await getDamDischargeStatus(forceRefresh);
      setStatus(next);
      setStaleAt(getStaleAt(next));
    } catch (loadError) {
      setStatus(null);
      setStaleAt(null);
      setError(loadError instanceof Error ? loadError.message : '댐 방류정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const activeCount = status?.items.filter(isActive).length || 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2.5">
              <span aria-hidden="true" className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-300">water</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">댐 방류 현황</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                한국수자원공사 방류 시작·종료 시각과 하류 영향지역
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StaleBadge at={staleAt} />
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || status?.status === 'pending-approval'}
              className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
              새로고침
            </button>
          </div>
        </div>
      </div>

      {loading && !status && (
        <div role="status" className="flex min-h-48 items-center justify-center gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest">
          <span aria-hidden="true" className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <span className="text-sm text-on-surface-variant">방류 연동 상태 확인 중...</span>
        </div>
      )}

      {!loading && error && (
        <DataStatePanel
          tone="error"
          icon="cloud_off"
          title="댐 방류정보를 불러오지 못했습니다"
          description={error}
          action={{ label: '다시 시도', icon: 'refresh', onClick: () => void load(true) }}
        />
      )}

      {!loading && status?.status === 'pending-approval' && (
        <DataStatePanel
          tone="guidance"
          icon="hourglass_top"
          title="API 활용신청 심의 대기 중"
          description={status.message || '승인 완료 후 방류 현황 연동을 활성화합니다.'}
        />
      )}

      {status?.status === 'active' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-4">
              <p className="text-xs font-bold text-on-surface-variant">진행 중</p>
              <p className="mt-1 text-3xl font-black text-blue-600 dark:text-blue-300">{activeCount}</p>
            </div>
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-4">
              <p className="text-xs font-bold text-on-surface-variant">최근 2일 기록</p>
              <p className="mt-1 text-3xl font-black text-on-surface">{status.items.length}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-4 sm:col-span-1">
              <p className="text-xs font-bold text-on-surface-variant">마지막 조회</p>
              <p className="mt-2 text-sm font-bold text-on-surface">{status.fetchedAt ? new Date(status.fetchedAt).toLocaleString() : '-'}</p>
            </div>
          </div>

          {status.items.length === 0 ? (
            <DataStatePanel
              icon="water_drop"
              title="최근 방류 기록이 없습니다"
              description="최근 2일 범위에서 제공된 댐 방류 기록이 없습니다."
            />
          ) : (
            <div className="space-y-3">
              {status.items.map(event => (
                <article key={event.id} className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-extrabold text-on-surface">{event.damName}</h3>
                      {event.damCode && <p className="mt-0.5 text-xs text-on-surface-variant">댐 코드 {event.damCode}</p>}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      isActive(event)
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      {isActive(event) ? '방류 중' : '종료'}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-on-surface-variant">방류 시작</dt>
                      <dd className="font-bold text-on-surface">{formatDateTime(event.startedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-on-surface-variant">방류 종료</dt>
                      <dd className="font-bold text-on-surface">{formatDateTime(event.endedAt)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-on-surface-variant">영향지역</dt>
                      <dd className="font-bold text-on-surface">{event.affectedArea || '제공 정보 없음'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs leading-relaxed text-on-surface-variant">
        방류정보는 현장 안전 판단을 돕는 참고자료입니다. 하류 접근 전 지자체 통제, 재난문자, 현장 지휘 정보를 함께 확인하세요.
        {status?.sourceUrl && (
          <> <a className="font-bold text-primary underline" href={status.sourceUrl} target="_blank" rel="noreferrer">{status.source} 원문</a></>
        )}
      </div>
    </div>
  );
}
