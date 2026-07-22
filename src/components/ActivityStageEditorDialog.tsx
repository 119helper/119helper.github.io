import { useEffect, useId, useState } from 'react';
import {
  removeActivityStage,
  updateActivityStageTime,
  type LoggedActivityStamp,
} from '../services/activitySession';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface ActivityStageEditorDialogProps {
  stamp: LoggedActivityStamp | null;
  minimumTime?: number;
  onClose: () => void;
  onComplete?: (message: string) => void;
}

function toLocalDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  const localTime = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 19);
}

export default function ActivityStageEditorDialog({
  stamp,
  minimumTime,
  onClose,
  onComplete,
}: ActivityStageEditorDialogProps) {
  const titleId = useId();
  const errorId = useId();
  const [timeValue, setTimeValue] = useState('');
  const [maximumTime, setMaximumTime] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(Boolean(stamp), onClose);

  useEffect(() => {
    if (!stamp) return;
    setTimeValue(toLocalDateTimeInput(stamp.time));
    setMaximumTime(Date.now());
    setError('');
    setConfirmDelete(false);
  }, [stamp]);

  if (!stamp) return null;
  const earliestTime = minimumTime ? Math.floor(minimumTime / 1000) * 1000 : undefined;

  const handleSave = () => {
    const time = new Date(timeValue).getTime();
    if (!Number.isFinite(time)) {
      setError('올바른 날짜와 시각을 입력하세요.');
      return;
    }
    if (earliestTime && time < earliestTime) {
      setError('출동 시작 시각 이후로 입력하세요.');
      return;
    }
    if (time > Date.now()) {
      setError('현재보다 미래 시각은 기록할 수 없습니다.');
      return;
    }

    const result = updateActivityStageTime(stamp.stageId, time);
    if (!result.changed) {
      setError('기록을 수정하지 못했습니다. 최신 상태를 확인하세요.');
      return;
    }
    onComplete?.(`${stamp.label} 시각을 수정했습니다`);
    onClose();
  };

  const handleDelete = () => {
    const result = removeActivityStage(stamp.stageId);
    if (!result.changed) {
      setError('이 기록은 삭제할 수 없습니다.');
      return;
    }
    onComplete?.(`${stamp.label} 기록을 삭제했습니다`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 text-on-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">활동 기록 수정</p>
            <h2 id={titleId} className="mt-1 text-xl font-extrabold">{stamp.label}</h2>
          </div>
          <button
            type="button"
            aria-label="활동 기록 수정 닫기"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        <label className="mt-5 block space-y-2 text-sm font-bold">
          <span>기록 날짜와 시각</span>
          <input
            data-dialog-initial-focus
            type="datetime-local"
            step="1"
            value={timeValue}
            min={earliestTime ? toLocalDateTimeInput(earliestTime) : undefined}
            max={maximumTime ? toLocalDateTimeInput(maximumTime) : undefined}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            onChange={event => {
              setTimeValue(event.target.value);
              setError('');
            }}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 font-mono text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            const currentTime = Date.now();
            setMaximumTime(currentTime);
            setTimeValue(toLocalDateTimeInput(currentTime));
            setError('');
          }}
          className="mt-2 flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary/10"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg">schedule</span>
          현재 시각으로 설정
        </button>

        {error && <p id={errorId} role="alert" className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-sm font-bold text-error">{error}</p>}

        {confirmDelete && (
          <div className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3" role="alert">
            <p className="text-sm font-bold text-error">이 기록을 보고서와 타임라인에서 삭제할까요?</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg bg-surface-container px-3 py-2.5 text-sm font-bold"
              >
                삭제 취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-error px-3 py-2.5 text-sm font-bold text-on-error"
              >
                정말 삭제
              </button>
            </div>
          </div>
        )}

        {!confirmDelete && (
          <div className="mt-5 flex items-center gap-2 border-t border-outline-variant/20 pt-4">
          {stamp.stageId !== 'dispatch' && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mr-auto rounded-lg px-3 py-2.5 text-sm font-bold text-error hover:bg-error/10"
            >
              기록 삭제
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary/90"
          >
            시각 저장
          </button>
          </div>
        )}
      </div>
    </div>
  );
}
