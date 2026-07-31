import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import ActivityStageEditorDialog from './ActivityStageEditorDialog';
import {
  formatDuration,
  totalDurationMs,
  type StageStamp,
} from '../utils/activityReport';
import { useActivitySession } from '../hooks/useActivitySession';
import { useUserProfile, type DutyRole } from '../contexts/UserProfileContext';
import { useTimer } from '../contexts/TimerContext';
import { buildSensitiveExportMessage } from '../utils/sensitiveExport';
import { useAppFeedback } from '../contexts/FeedbackContext';
import { findActivityOrderIssues } from '../utils/activityOrder';
import {
  EMPTY_ACTIVITY_SESSION,
  type LoggedActivityStamp,
} from '../services/activitySession';
import { useIncidentSession } from '../hooks/useIncidentSession';
import { loadPrivacySettings } from '../services/privacySettings';
import { loadTriagePatients } from '../services/triageSession';
import {
  getIncidentCaseSnapshot,
  INCIDENT_CASE_ARCHIVE_EVENT,
  listIncidentCaseSnapshots,
  type IncidentCaseSnapshot,
} from '../services/incidentCaseStore';
import {
  buildScopedActivityReport,
  resolveActivityReportSource,
  sourceFromArchivedIncident,
  type ActivityReportBundle,
} from '../utils/activityReportScope';

const ROLE_TO_PRESET: Record<DutyRole, string> = { fire: 'fire', ems: 'ems', rescue: 'rescue', '': 'fire' };
const ACTIVITY_REPORT_SENSITIVE_DETAILS = [
  '현장 활동 타임라인과 특이사항',
  'GPS 위치 기록',
  '출동 제목, 주소, 사건 정보',
  '환자 분류 집계와 타이머 상태',
];

export default function ActivityLog() {
  const { confirmAction } = useAppFeedback();
  const { authorLine, profile } = useUserProfile();
  const { allTimers } = useTimer();
  const [currentIncident] = useIncidentSession();
  const [session, setSession] = useActivitySession(ROLE_TO_PRESET[profile.role]);
  const [useGps, setUseGps] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [reportBundle, setReportBundle] = useState<ActivityReportBundle | null>(null);
  const [archivedCases, setArchivedCases] = useState<IncidentCaseSnapshot[]>(
    () => listIncidentCaseSnapshots(),
  );
  const [selectedArchivedIncidentId, setSelectedArchivedIncidentId] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const preset = ACTIVITY_PRESETS.find(p => p.id === session.presetId) ?? ACTIVITY_PRESETS[0];
  const started = session.stamps.length > 0;
  const hasActiveIncident = currentIncident.active && Boolean(currentIncident.incidentId);

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

  const refreshArchivedCases = useCallback(() => {
    const next = listIncidentCaseSnapshots();
    setArchivedCases(next);
    setSelectedArchivedIncidentId(previous => (
      previous && next.some(item => item.incidentId === previous)
        ? previous
        : next[0]?.incidentId ?? ''
    ));
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const refresh = () => {
      refreshArchivedCases();
      if (!loadPrivacySettings().publicDeviceMode) return;
      setReport(null);
      setReportBundle(null);
      setCopied(false);
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('119helper-settings-updated', refresh);
    window.addEventListener(INCIDENT_CASE_ARCHIVE_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('119helper-settings-updated', refresh);
      window.removeEventListener(INCIDENT_CASE_ARCHIVE_EVENT, refresh);
    };
  }, [refreshArchivedCases]);

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

  const showReportSource = (
    source: ReturnType<typeof resolveActivityReportSource>,
  ) => {
    const bundle = buildScopedActivityReport(source, authorLine);
    setReport(bundle.report);
    setReportBundle(bundle);
  };

  const generateReport = () => {
    const incidentId = session.incidentId?.trim() || null;
    const archivedIncident = incidentId
      ? getIncidentCaseSnapshot(incidentId)
      : null;
    showReportSource(resolveActivityReportSource({
      session,
      currentIncident,
      triagePatients: loadTriagePatients(),
      timers: allTimers,
      archivedIncident,
    }));
  };

  const loadArchivedReport = () => {
    if (!selectedArchivedIncidentId) return;
    const archived = getIncidentCaseSnapshot(selectedArchivedIncidentId);
    const source = archived ? sourceFromArchivedIncident(archived) : null;
    if (!source) {
      setFeedback('종료 출동 보관본을 찾을 수 없습니다.');
      refreshArchivedCases();
      return;
    }
    showReportSource(source);
    setFeedback('종료 출동 보고서를 읽기 전용으로 불러왔습니다.');
  };

  const archivedCaseLabel = (item: IncidentCaseSnapshot) => {
    const closedAt = new Date(item.closedAt).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${closedAt} · ${item.incident.title || item.incidentId}`;
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
    if (hasActiveIncident) {
      setFeedback('진행 중인 출동의 활동 기록은 상황판에서 종료한 뒤 새로 시작할 수 있습니다.');
      return;
    }
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

      {archivedCases.length > 0 && (
        <section
          aria-labelledby="archived-activity-report-title"
          className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined rounded-lg bg-secondary-container p-2 text-on-secondary-container"
            >
              inventory_2
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="archived-activity-report-title" className="font-extrabold text-on-surface">
                종료 출동 보고서
              </h3>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                종료 시점에 고정된 보관본입니다. 현재 출동 기록은 바뀌지 않습니다.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="종료 출동 선택"
                  value={selectedArchivedIncidentId}
                  onFocus={refreshArchivedCases}
                  onChange={event => setSelectedArchivedIncidentId(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2.5 text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {archivedCases.map(item => (
                    <option key={item.incidentId} value={item.incidentId}>
                      {archivedCaseLabel(item)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedArchivedIncidentId}
                  onClick={loadArchivedReport}
                  className="rounded-lg bg-secondary-container px-4 py-2.5 text-sm font-extrabold text-on-secondary-container disabled:opacity-40"
                >
                  읽기 전용으로 불러오기
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

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
            disabled={hasActiveIncident}
            aria-describedby={hasActiveIncident ? 'active-incident-activity-protection' : undefined}
            className="px-4 py-2.5 rounded-lg font-bold bg-surface-container text-on-surface-variant hover:text-error transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-on-surface-variant"
          >
            {hasActiveIncident ? '출동 기록 보호 중' : '새 출동'}
          </button>
        </div>
        {hasActiveIncident && (
          <p
            id="active-incident-activity-protection"
            role="status"
            className="text-xs font-bold leading-5 text-on-surface-variant"
          >
            {currentIncident.title || '진행 중인 출동'} 활동 기록은 상황판 종료 전까지 새 기록으로 덮어쓸 수 없습니다.
          </p>
        )}
      </div>

      {report && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-on-surface">
              {reportBundle?.readOnly ? '종료 출동 보고서' : '보고서 초안'}
            </h3>
            {reportBundle?.readOnly && (
              <p className="mt-0.5 text-xs font-bold text-on-surface-variant">
                읽기 전용 · 보관 시점 {new Date(reportBundle.snapshotAt).toLocaleString('ko-KR')}
              </p>
            )}
          </div>
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
          {reportBundle?.scopeWarning && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-bold text-amber-800 dark:text-amber-200"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">warning</span>
              <span>{reportBundle.scopeWarning}</span>
            </div>
          )}
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
