import { useEffect, useMemo, useState } from 'react';
import type { ActivityPreset } from '../data/activityStages';
import type { LoggedActivityStamp } from '../services/activitySession';
import type { TimerState } from '../services/timerPersistence';
import { buildIncidentCloseReview } from '../utils/incidentCloseReview';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface IncidentCloseReviewDialogProps {
  open: boolean;
  preset: ActivityPreset;
  stamps: LoggedActivityStamp[];
  timers: TimerState[];
  stopwatchRunning: boolean;
  saving: boolean;
  saveError: string;
  onClose: () => void;
  onOpenActivity: () => void;
  onOpenTimers: () => void;
  onConfirm: () => void;
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

export default function IncidentCloseReviewDialog({
  open,
  preset,
  stamps,
  timers,
  stopwatchRunning,
  saving,
  saveError,
  onClose,
  onOpenActivity,
  onOpenTimers,
  onConfirm,
}: IncidentCloseReviewDialogProps) {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open, onClose);
  const [acknowledged, setAcknowledged] = useState(false);
  const review = useMemo(() => buildIncidentCloseReview({
    stages: preset.stages,
    stamps,
    timers,
    stopwatchRunning,
  }), [preset.stages, stamps, stopwatchRunning, timers]);

  useEffect(() => {
    if (!open) return;
    setAcknowledged(false);
  }, [open]);

  if (!open) return null;

  const recordedCount = review.reviewStages.length - review.missingStages.length;
  const progress = review.reviewStages.length === 0
    ? 100
    : Math.round((recordedCount / review.reviewStages.length) * 100);
  const activityNeedsReview = review.missingStages.length > 0 || review.orderIssues.length > 0;
  const timersNeedReview = review.unfinishedTimers.length > 0 || review.stopwatchRunning;
  const canConfirm = !review.hasWarnings || acknowledged;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={saving ? undefined : onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="출동 종료 점검"
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest text-on-surface shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-outline-variant/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-2xl text-primary">fact_check</span>
            <div>
              <p className="text-xs font-bold text-primary">종료 전 마지막 확인</p>
              <h2 className="mt-1 text-xl font-extrabold">출동 종료 점검</h2>
              <p className="mt-1 text-xs text-on-surface-variant">기록은 종료 후에도 활동 타임라인에 유지됩니다.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="출동 종료 점검 닫기"
            disabled={saving}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {saveError && (
            <div role="alert" className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm font-bold text-error">
              <p>출동 기록을 안전하게 보관하지 못해 종료하지 않았습니다.</p>
              <p className="mt-1 text-xs font-medium text-on-surface-variant">{saveError}</p>
            </div>
          )}

          {!review.hasWarnings && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
              <span aria-hidden="true" className="material-symbols-outlined">task_alt</span>
              <div>
                <h3 className="font-extrabold">종료 준비가 완료되었습니다</h3>
                <p className="mt-1 text-xs leading-5">미기록 단계, 시각 순서 경고, 사용 중인 타이머가 없습니다.</p>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-outline-variant/20 bg-surface-container p-4" aria-labelledby="close-activity-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="close-activity-heading" className="font-extrabold">활동 기록</h3>
                <p className="mt-1 text-xs text-on-surface-variant">귀소 단계는 출동 종료 후에도 기록할 수 있습니다.</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-black text-primary">{recordedCount}/{review.reviewStages.length}</span>
            </div>
            <div
              role="progressbar"
              aria-label="활동 단계 기록률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-3 h-2 overflow-hidden rounded-full bg-outline-variant/20"
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {review.reviewStages.map(stage => {
                const recorded = review.recordedStageIds.has(stage.id);
                return (
                  <span
                    key={stage.id}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-bold ${
                      recorded
                        ? 'border-primary/20 bg-primary/10 text-primary'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">{recorded ? 'check' : 'pending'}</span>
                    {stage.label}{!recorded && ' 미기록'}
                  </span>
                );
              })}
            </div>
            {review.orderIssues.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm font-bold text-amber-800 dark:text-amber-200">
                {review.orderIssues.map(issue => <p key={issue.id}>{issue.message}</p>)}
              </div>
            )}
            {activityNeedsReview && (
              <button
                type="button"
                onClick={onOpenActivity}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-surface-container-lowest px-3 py-2 text-sm font-extrabold text-primary hover:bg-primary/10"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">edit_note</span>
                활동 타임라인 확인
              </button>
            )}
          </section>

          {timersNeedReview && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200" aria-labelledby="close-timer-heading">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="material-symbols-outlined mt-0.5">timer</span>
                <div className="min-w-0 flex-1">
                  <h3 id="close-timer-heading" className="font-extrabold">미정리 타이머</h3>
                  <div className="mt-2 space-y-1 text-sm font-bold">
                    {review.unfinishedTimers.slice(0, 4).map(timer => (
                      <div key={timer.id} className="flex items-center justify-between gap-3">
                        <span className="truncate">{timer.label}{timer.isRunning ? ' · 실행 중' : ' · 일시정지'}</span>
                        <span className="shrink-0 font-mono">{formatTimer(timer.remaining)}</span>
                      </div>
                    ))}
                    {review.stopwatchRunning && <p>스톱워치 · 실행 중</p>}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenTimers}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-600/30 bg-surface-container-lowest px-3 py-2 text-sm font-extrabold text-on-surface hover:bg-surface-container"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">open_in_new</span>
                    현장 타이머 확인
                  </button>
                </div>
              </div>
            </section>
          )}

          {review.hasWarnings && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-error/25 bg-error/5 p-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={event => setAcknowledged(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 !min-h-0 accent-primary"
              />
              <span>미기록 단계와 경고 항목을 확인했으며, 현재 상태로 출동을 종료합니다.</span>
            </label>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-outline-variant/20 bg-surface-container-lowest px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
          >
            계속 기록
          </button>
          <button
            type="button"
            disabled={!canConfirm || saving}
            onClick={onConfirm}
            className="rounded-lg bg-error px-4 py-2.5 text-sm font-extrabold text-on-error hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? '기록 보관 중…' : review.hasWarnings ? '확인 후 출동 종료' : '출동 종료'}
          </button>
        </div>
      </div>
    </div>
  );
}
