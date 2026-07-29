import { useEffect, useMemo, useState } from 'react';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import ActivityStageEditorDialog from './ActivityStageEditorDialog';
import {
  buildReportPackageText,
  formatDuration,
  totalDurationMs,
  type ReportTimerSummary,
  type StageStamp,
} from '../utils/activityReport';
import { useActivitySession } from '../hooks/useActivitySession';
import { useUserProfile, type DutyRole } from '../contexts/UserProfileContext';
import { useTimer } from '../contexts/TimerContext';
import { loadStoredJson } from '../services/privacySettings';
import { buildSensitiveExportMessage } from '../utils/sensitiveExport';
import { useAppFeedback } from '../contexts/FeedbackContext';
import { findActivityOrderIssues } from '../utils/activityOrder';
import {
  EMPTY_ACTIVITY_SESSION,
  type ActivitySessionState,
  type LoggedActivityStamp,
} from '../services/activitySession';

const ROLE_TO_PRESET: Record<DutyRole, string> = { fire: 'fire', ems: 'ems', rescue: 'rescue', '': 'fire' };
const ACTIVITY_REPORT_SENSITIVE_DETAILS = [
  '현장 활동 타임라인과 특이사항',
  'GPS 위치 기록',
  '출동 제목, 주소, 사건 정보',
  '환자 분류 집계와 타이머 상태',
];

const INCIDENT_TYPE_LABELS: Record<string, string> = { fire: '화재', ems: '구급', rescue: '구조', support: '지원' };

interface StoredIncident {
  active?: boolean;
  type?: string;
  title?: string;
  address?: string;
  startedAt?: number;
  endedAt?: number;
}

interface StoredTriagePatient {
  color?: 'red' | 'yellow' | 'green' | 'black';
}

interface ActivityReportBundle {
  generatedAt: string;
  title: string;
  session: ActivitySessionState;
  report: string;
  timers: ReportTimerSummary[];
  triageCounts: Record<'red' | 'yellow' | 'green' | 'black', number>;
  incident: StoredIncident | null;
}

function readJson<T>(key: string, fallback: T): T {
  return loadStoredJson<T>(key, fallback);
}

export default function ActivityLog() {
  const { confirmAction } = useAppFeedback();
  const { authorLine, profile } = useUserProfile();
  const { timers } = useTimer();
  const [session, setSession] = useActivitySession(ROLE_TO_PRESET[profile.role]);
  const [useGps, setUseGps] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [reportBundle, setReportBundle] = useState<ActivityReportBundle | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const preset = ACTIVITY_PRESETS.find(p => p.id === session.presetId) ?? ACTIVITY_PRESETS[0];
  const started = session.stamps.length > 0;

  const stampByStage = useMemo(() => {
    const m = new Map<string, LoggedActivityStamp>();
    session.stamps.forEach(s => m.set(s.stageId, s));
    return m;
  }, [session.stamps]);
  const orderIssues = useMemo(
    () => findActivityOrderIssues(preset.stages, session.stamps),
    [preset.stages, session.stamps],
  );
  const issueStageIds = useMemo(() => new Set(
    orderIssues.flatMap(issue => [issue.expectedBefore.stageId, issue.expectedAfter.stageId]),
  ), [orderIssues]);
  const issueStages = useMemo(
    () => preset.stages.filter(stage => issueStageIds.has(stage.id)),
    [issueStageIds, preset.stages],
  );

  const sortedStamps: StageStamp[] = useMemo(
    () => [...session.stamps].sort((a, b) => a.time - b.time),
    [session.stamps],
  );
  const editingStamp = editingStageId ? stampByStage.get(editingStageId) ?? null : null;

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const recordStage = (stageId: string, label: string) => {
    const commit = (lat: number | null, lon: number | null) => {
      setSession(prev => {
        const others = prev.stamps.filter(s => s.stageId !== stageId);
        return { ...prev, stamps: [...others, { stageId, label, time: Date.now(), lat, lon }] };
      });
    };
    if (useGps && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => commit(pos.coords.latitude, pos.coords.longitude),
        () => commit(null, null),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } else {
      commit(null, null);
    }
  };

  const generateReport = () => {
    const title = session.title.trim() || `${preset.label} 출동`;
    const incident = readJson<StoredIncident | null>('119helper-incident-session', null);
    const triagePatients = readJson<StoredTriagePatient[]>('119helper-triage-patients', []);
    const triageCounts: Record<'red' | 'yellow' | 'green' | 'black', number> = { red: 0, yellow: 0, green: 0, black: 0 };
    triagePatients.forEach(patient => {
      if (patient.color && patient.color in triageCounts) triageCounts[patient.color] += 1;
    });
    const timerSummaries: ReportTimerSummary[] = timers.map(t => ({
      label: t.label,
      remainingSeconds: t.remaining,
      totalSeconds: t.totalSeconds,
      running: t.isRunning,
    }));

    const nextReport = buildReportPackageText({
      title,
      stamps: sortedStamps,
      note: session.note,
      author: authorLine,
      incident: incident?.title ? {
        title: incident.title || title,
        type: incident.type ? INCIDENT_TYPE_LABELS[incident.type] || incident.type : undefined,
        address: incident.address,
        startedAt: incident.startedAt,
        endedAt: incident.endedAt,
      } : null,
      timers: timerSummaries,
      triageCounts,
    });
    setReport(nextReport);
    setReportBundle({
      generatedAt: new Date().toISOString(),
      title,
      session,
      report: nextReport,
      timers: timerSummaries,
      triageCounts,
      incident: incident?.title ? incident : null,
    });
  };

  const copyReport = async () => {
    if (!report) return;
    const approved = await confirmAction({
      title: '민감정보 복사',
      message: buildSensitiveExportMessage('보고서 복사', ACTIVITY_REPORT_SENSITIVE_DETAILS),
      confirmLabel: '복사 계속',
      tone: 'warning',
    });
    if (!approved) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 불가 환경 무시 */
    }
  };

  const reset = () => {
    setSession({ ...EMPTY_ACTIVITY_SESSION, presetId: session.presetId });
    setReport(null);
    setReportBundle(null);
  };

  const downloadReportBundle = async () => {
    if (!reportBundle) return;
    const approved = await confirmAction({
      title: '민감정보 내보내기',
      message: buildSensitiveExportMessage('활동보고서 JSON 내보내기 파일', ACTIVITY_REPORT_SENSITIVE_DETAILS),
      confirmLabel: '내보내기 계속',
      tone: 'warning',
    });
    if (!approved) return;
    const blob = new Blob([JSON.stringify(reportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">history</span>
            현장활동 타임라인
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">단계별 원터치 기록 → 표준 보고서 초안 자동 생성</p>
        </div>
        <button
          onClick={() => setUseGps(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border ${
            useGps ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-container border-outline-variant/20 text-on-surface-variant'
          }`}
        >
          <span className="material-symbols-outlined text-base">my_location</span>
          GPS {useGps ? '기록' : '끔'}
        </button>
      </div>

      {/* 출동 유형 + 제목 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
        <div className="flex gap-2">
          {ACTIVITY_PRESETS.map(p => (
            <button
              key={p.id}
              disabled={started}
              onClick={() => setSession(prev => ({ ...prev, presetId: p.id }))}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                session.presetId === p.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          aria-label="출동 제목"
          type="text"
          value={session.title}
          onChange={e => setSession(prev => ({ ...prev, title: e.target.value }))}
          placeholder="출동 제목 (예: ○○동 상가 화재)"
          className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 단계 버튼 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {preset.stages.map(stage => {
          const logged = stampByStage.get(stage.id);
          const hasOrderIssue = Boolean(logged && issueStageIds.has(stage.id));
          return (
            <button
              key={stage.id}
              aria-label={logged
                ? `${stage.label} 기록됨 ${new Date(logged.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}${hasOrderIssue ? ', 순서 확인 필요' : ''}, 수정`
                : `${stage.label} 기록`}
              onClick={() => logged ? setEditingStageId(stage.id) : recordStage(stage.id, stage.label)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 transition-all ${
                hasOrderIssue
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : logged
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-surface-container-lowest border-outline-variant/10 text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <span className="material-symbols-outlined text-2xl" style={logged ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {hasOrderIssue ? 'warning' : logged ? 'check_circle' : stage.icon}
              </span>
              <span className="text-sm font-bold">{stage.label}</span>
              {logged ? (
                <span className="text-xs font-mono">
                  {new Date(logged.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  {logged.lat != null && <span className="material-symbols-outlined text-[14px] align-middle ml-0.5">place</span>}
                  <span className="material-symbols-outlined ml-1 align-middle text-[14px]">edit</span>
                </span>
              ) : (
                <span className="text-[11px] text-on-surface-variant">탭하여 기록</span>
              )}
            </button>
          );
        })}
      </div>

      {orderIssues.length > 0 && (
        <section
          role="alert"
          aria-label="활동 시각 순서 확인"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-amber-600">warning</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold">활동 시각 순서 확인</h3>
              <p className="mt-1 text-xs leading-5 opacity-90">현장 상황상 순서가 달라질 수 있습니다. 오입력인 경우 관련 단계의 시각을 수정하세요.</p>
              <ul className="mt-2 space-y-1 text-sm font-bold">
                {orderIssues.map(issue => <li key={issue.id}>{issue.message}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {issueStages.map(stage => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setEditingStageId(stage.id)}
                    className="rounded-lg border border-amber-600/30 bg-surface-container-lowest px-3 py-2 text-xs font-extrabold text-on-surface hover:bg-surface-container"
                  >
                    {stage.label} 시각 수정
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
      <span className="sr-only" role="status" aria-live="polite">{feedback}</span>

      {started && (
        <div className="text-sm text-on-surface-variant text-center">
          총 활동시간 <span className="font-bold text-on-surface font-mono">{formatDuration(totalDurationMs(sortedStamps))}</span>
        </div>
      )}

      {/* 특이사항 + 액션 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
        <textarea
          aria-label="출동 특이사항"
          value={session.note}
          onChange={e => setSession(prev => ({ ...prev, note: e.target.value }))}
          placeholder="특이사항 (인명피해, 동원자원, 조치 등)"
          rows={3}
          className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-2">
          <button
            onClick={generateReport}
            disabled={!started}
            className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-lg font-bold hover:bg-primary/80 transition-colors disabled:opacity-40"
          >
            보고서 초안 생성
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-lg font-bold bg-surface-container text-on-surface-variant hover:text-error transition-colors"
          >
            새 출동
          </button>
        </div>
      </div>

      {report && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">보고서 초안</h3>
          <div className="flex gap-2">
              <button
                onClick={downloadReportBundle}
                disabled={!reportBundle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-base">download</span>
                JSON
              </button>
              <button
                onClick={copyReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20"
              >
                <span className="material-symbols-outlined text-base">{copied ? 'check' : 'content_copy'}</span>
                {copied ? '복사됨' : '복사'}
              </button>
          </div>
        </div>
          <textarea
            aria-label="생성된 보고서 초안"
            readOnly
            value={report}
            rows={Math.min(20, report.split('\n').length + 1)}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface text-sm font-mono resize-none focus:outline-none"
          />
        </div>
      )}

      <ActivityStageEditorDialog
        stamp={editingStamp}
        minimumTime={editingStamp?.stageId === 'dispatch' ? undefined : stampByStage.get('dispatch')?.time}
        onClose={() => setEditingStageId(null)}
        onComplete={setFeedback}
      />
    </div>
  );
}
