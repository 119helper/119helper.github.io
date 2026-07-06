import { useState, useMemo } from 'react';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import {
  buildReportPackageText,
  formatDuration,
  totalDurationMs,
  type ReportTimerSummary,
  type StageStamp,
} from '../utils/activityReport';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useUserProfile, type DutyRole } from '../contexts/UserProfileContext';
import { useTimer } from '../contexts/TimerContext';

const ROLE_TO_PRESET: Record<DutyRole, string> = { fire: 'fire', ems: 'ems', rescue: 'rescue', '': 'fire' };

interface LoggedStamp {
  stageId: string;
  label: string;
  time: number;
  lat: number | null;
  lon: number | null;
}

interface ActiveSession {
  presetId: string;
  title: string;
  note: string;
  stamps: LoggedStamp[];
}

const EMPTY: ActiveSession = { presetId: 'fire', title: '', note: '', stamps: [] };
const INCIDENT_TYPE_LABELS: Record<string, string> = { fire: '화재', ems: '구급', rescue: '구조', support: '지원' };

interface StoredIncident {
  active?: boolean;
  type?: string;
  title?: string;
  address?: string;
  startedAt?: number;
}

interface StoredTriagePatient {
  color?: 'red' | 'yellow' | 'green' | 'black';
}

interface ActivityReportBundle {
  generatedAt: string;
  title: string;
  session: ActiveSession;
  report: string;
  timers: ReportTimerSummary[];
  triageCounts: Record<'red' | 'yellow' | 'green' | 'black', number>;
  incident: StoredIncident | null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export default function ActivityLog() {
  const { authorLine, profile } = useUserProfile();
  const { timers } = useTimer();
  const [session, setSession] = useLocalStorageState<ActiveSession>('119helper-activity-session', () => ({
    ...EMPTY,
    presetId: ROLE_TO_PRESET[profile.role],
  }));
  const [useGps, setUseGps] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [reportBundle, setReportBundle] = useState<ActivityReportBundle | null>(null);
  const [copied, setCopied] = useState(false);

  const preset = ACTIVITY_PRESETS.find(p => p.id === session.presetId) ?? ACTIVITY_PRESETS[0];
  const started = session.stamps.length > 0;

  const stampByStage = useMemo(() => {
    const m = new Map<string, LoggedStamp>();
    session.stamps.forEach(s => m.set(s.stageId, s));
    return m;
  }, [session.stamps]);

  const sortedStamps: StageStamp[] = useMemo(
    () => [...session.stamps].sort((a, b) => a.time - b.time),
    [session.stamps],
  );

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
      incident: incident?.active ? {
        title: incident.title || title,
        type: incident.type ? INCIDENT_TYPE_LABELS[incident.type] || incident.type : undefined,
        address: incident.address,
        startedAt: incident.startedAt,
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
      incident: incident?.active ? incident : null,
    });
  };

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 불가 환경 무시 */
    }
  };

  const reset = () => {
    setSession({ ...EMPTY, presetId: session.presetId });
    setReport(null);
    setReportBundle(null);
  };

  const downloadReportBundle = () => {
    if (!reportBundle) return;
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
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">⏱️ 현장활동 타임라인</h2>
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
          return (
            <button
              key={stage.id}
              onClick={() => recordStage(stage.id, stage.label)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 transition-all ${
                logged
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-surface-container-lowest border-outline-variant/10 text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <span className="material-symbols-outlined text-2xl" style={logged ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {logged ? 'check_circle' : stage.icon}
              </span>
              <span className="text-sm font-bold">{stage.label}</span>
              {logged ? (
                <span className="text-xs font-mono">
                  {new Date(logged.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  {logged.lat != null && <span className="material-symbols-outlined text-[14px] align-middle ml-0.5">place</span>}
                </span>
              ) : (
                <span className="text-[11px] text-on-surface-variant">탭하여 기록</span>
              )}
            </button>
          );
        })}
      </div>

      {started && (
        <div className="text-sm text-on-surface-variant text-center">
          총 활동시간 <span className="font-bold text-on-surface font-mono">{formatDuration(totalDurationMs(sortedStamps))}</span>
        </div>
      )}

      {/* 특이사항 + 액션 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
        <textarea
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
            readOnly
            value={report}
            rows={Math.min(20, report.split('\n').length + 1)}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface text-sm font-mono resize-none focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
