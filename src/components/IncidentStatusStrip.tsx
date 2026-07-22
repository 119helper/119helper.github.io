import { useEffect, useMemo, useState } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import { useActivitySession } from '../hooks/useActivitySession';
import { recordActivityStage } from '../services/activitySession';
import ActivityStageEditorDialog from './ActivityStageEditorDialog';
import type { IncidentSession, IncidentType } from '../services/incidentSession';
import type { TabId } from '../types/navigation';
import { findActivityOrderIssues } from '../utils/activityOrder';
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
  fieldModeActive: boolean;
  onFieldModeChange: (enabled: boolean) => void;
}

export default function IncidentStatusStrip({
  session,
  activeTab,
  onNavigate,
  fieldModeActive,
  onFieldModeChange,
}: IncidentStatusStripProps) {
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState('');
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const { timers, formatTime } = useTimer();
  const [activitySession] = useActivitySession(session.type);

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

  const activityPreset = useMemo(() => (
    ACTIVITY_PRESETS.find(preset => preset.id === session.type) ?? ACTIVITY_PRESETS[0]
  ), [session.type]);
  const quickStages = useMemo(() => (
    activityPreset.stages.filter(stage => stage.id !== 'dispatch')
  ), [activityPreset]);
  const stampByStage = useMemo(() => (
    new Map(activitySession.stamps.map(stamp => [stamp.stageId, stamp]))
  ), [activitySession.stamps]);
  const orderIssues = useMemo(() => (
    findActivityOrderIssues(activityPreset.stages, activitySession.stamps)
  ), [activityPreset, activitySession.stamps]);
  const issueStageIds = useMemo(() => new Set(
    orderIssues.flatMap(issue => [issue.expectedBefore.stageId, issue.expectedAfter.stageId]),
  ), [orderIssues]);
  const editingStamp = editingStageId ? stampByStage.get(editingStageId) ?? null : null;

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const recordStage = (stageId: string, label: string) => {
    const result = recordActivityStage(stageId, label);
    const nextIssues = findActivityOrderIssues(activityPreset.stages, result.session.stamps);
    setFeedback(result.recorded
      ? `${label} 기록 완료${nextIssues.length > 0 ? ' · 활동 시각 순서를 확인하세요' : ''}`
      : `${label}은 이미 기록되어 있습니다`);
  };

  if (!session.active) return null;
  const type = TYPE_META[session.type];

  return (
    <>
      <section
        aria-label="진행 중인 출동"
        className="shrink-0 border-b border-error/30 bg-error-container/95 px-3 py-2 text-on-error-container shadow-sm backdrop-blur-md sm:px-5"
      >
      <div className="mx-auto max-w-[1600px]">
        <div className="flex items-center gap-2">
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

          <button
            type="button"
            aria-label={`현장 모드 ${fieldModeActive ? '끄기' : '켜기'}`}
            aria-pressed={fieldModeActive}
            title="큰 글씨·큰 터치 영역·화면 켜짐 유지"
            onClick={() => onFieldModeChange(!fieldModeActive)}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-extrabold shadow-sm transition-colors ${
              fieldModeActive
                ? 'border-primary bg-primary text-on-primary'
                : 'border-error/20 bg-surface-container-lowest/80 text-on-surface hover:bg-surface-container'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">visibility</span>
            <span className="hidden lg:inline">현장 모드</span>
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-error/15 pt-2">
          <span className="hidden shrink-0 items-center gap-1 text-[11px] font-extrabold text-error sm:flex">
            <span aria-hidden="true" className="material-symbols-outlined text-base">history</span>
            빠른 기록
          </span>
          <div className="scrollbar-hide flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label={`${type.label} 출동 활동 빠른 기록`}>
            {quickStages.map(stage => {
              const stamp = stampByStage.get(stage.id);
              const hasOrderIssue = Boolean(stamp && issueStageIds.has(stage.id));
              const recordedTime = stamp
                ? new Date(stamp.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <button
                  key={stage.id}
                  type="button"
                  aria-label={stamp
                    ? `${stage.label} 기록됨 ${recordedTime}${hasOrderIssue ? ', 순서 확인 필요' : ''}, 수정`
                    : `${stage.label} 기록`}
                  onClick={() => stamp ? setEditingStageId(stage.id) : recordStage(stage.id, stage.label)}
                  className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-extrabold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                    hasOrderIssue
                      ? 'border-amber-600/40 bg-amber-400 text-amber-950'
                      : stamp
                      ? 'border-primary/20 bg-primary text-on-primary'
                      : 'border-error/20 bg-surface-container-lowest/80 text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">{hasOrderIssue ? 'warning' : stamp ? 'check' : stage.icon}</span>
                  <span>{stage.label}</span>
                  {stamp && <span className="font-mono text-[10px] tabular-nums opacity-85">{recordedTime}</span>}
                  {stamp && <span aria-hidden="true" className="material-symbols-outlined text-[14px] opacity-85">edit</span>}
                </button>
              );
            })}
          </div>
          {orderIssues.length > 0 && (
            <button
              type="button"
              aria-label={`활동 시각 순서 ${orderIssues.length}건 확인, 활동 타임라인 열기`}
              onClick={() => onNavigate('activity-log')}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-600/40 bg-amber-400 px-2.5 py-2 text-xs font-extrabold text-amber-950 shadow-sm hover:bg-amber-300"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">warning</span>
              <span>{orderIssues.length}</span>
              <span className="hidden sm:inline">순서 확인</span>
            </button>
          )}
          <span className="sr-only" role="status" aria-live="polite">{feedback}</span>
        </div>
      </div>
      </section>
      <ActivityStageEditorDialog
        stamp={editingStamp}
        minimumTime={session.startedAt}
        onClose={() => setEditingStageId(null)}
        onComplete={setFeedback}
      />
    </>
  );
}
