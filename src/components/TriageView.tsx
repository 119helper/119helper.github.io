import { useState, useMemo } from 'react';
import MedicalDisclaimer from './common/MedicalDisclaimer';
import {
  classifyStart,
  classifyJumpStart,
  TRIAGE_META,
  type TriageColor,
  type StartAnswers,
  type JumpStartAnswers,
} from '../utils/triage';
import { START_STEPS, JUMPSTART_STEPS, type TriageStep } from '../data/triageFlow';
import { matchHospitals, type MatchedHospital } from '../utils/hospitalMatch';
import { getERRealTimeBeds, CITY_TO_SIDO } from '../services/erApi';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useAppFeedback } from '../contexts/FeedbackContext';

type Mode = 'adult' | 'child';
type Answers = Record<string, boolean | undefined>;
type PatientStatus = 'triaged' | 'treating' | 'waiting' | 'transferred';

interface TriagePatient {
  id: string;
  mode: Mode;
  color: TriageColor;
  label: string;
  createdAt: string;
  status?: PatientStatus;
  destination?: string;
  note?: string;
}

const COLOR_CLASSES: Record<TriageColor, string> = {
  red: 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200',
  yellow: 'bg-yellow-500/15 border-yellow-500/40 text-amber-800 dark:text-yellow-200',
  green: 'bg-green-500/15 border-green-500/40 text-green-800 dark:text-green-200',
  black: 'bg-gray-500/20 border-gray-500/40 text-gray-900 dark:text-gray-100',
};

const COLOR_ORDER: TriageColor[] = ['red', 'yellow', 'green', 'black'];
const STATUS_ORDER: PatientStatus[] = ['triaged', 'treating', 'waiting', 'transferred'];
const STATUS_LABEL: Record<PatientStatus, string> = {
  triaged: '분류',
  treating: '처치 중',
  waiting: '이송 대기',
  transferred: '인계 완료',
};

export default function TriageView({ city = 'seoul' }: { city?: string }) {
  const { showUndo, confirmAction } = useAppFeedback();
  const [mode, setMode] = useState<Mode>('adult');
  const [patients, setPatients] = useLocalStorageState<TriagePatient[]>('119helper-triage-patients', []);

  const counts = useMemo(() => {
    const c: Record<TriageColor, number> = { red: 0, yellow: 0, green: 0, black: 0 };
    patients.forEach(p => (c[p.color] += 1));
    return c;
  }, [patients]);

  const statusCounts = useMemo(() => {
    const c: Record<PatientStatus, number> = { triaged: 0, treating: 0, waiting: 0, transferred: 0 };
    patients.forEach(p => {
      c[p.status ?? 'triaged'] += 1;
    });
    return c;
  }, [patients]);

  const addPatient = (color: TriageColor, label: string) => {
    const next: TriagePatient = {
      id: Date.now().toString(),
      mode,
      color,
      label: label.trim() || `환자 ${patients.length + 1}`,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      status: 'triaged',
      destination: '',
      note: '',
    };
    setPatients(prev => [next, ...prev]);
  };

  const removePatient = (id: string) => {
    const index = patients.findIndex(patient => patient.id === id);
    const removed = patients[index];
    if (!removed) return;

    setPatients(current => current.filter(patient => patient.id !== id));
    showUndo({
      message: '환자 기록을 삭제했습니다.',
      undo: () => setPatients(current => {
        if (current.some(patient => patient.id === removed.id)) return current;
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, removed);
        return restored;
      }),
    });
  };
  const updatePatient = (id: string, patch: Partial<TriagePatient>) =>
    setPatients(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const clearAll = async () => {
    const approved = await confirmAction({
      title: '환자 기록 전체 삭제',
      message: `현장 환자 ${patients.length}명의 기록을 모두 삭제할까요? 삭제 직후에는 실행 취소할 수 있습니다.`,
      confirmLabel: '전체 삭제',
      tone: 'danger',
    });
    if (!approved) return;
    const removed = patients;
    setPatients([]);
    showUndo({
      message: `환자 기록 ${removed.length}건을 모두 삭제했습니다.`,
      durationMs: 15_000,
      undo: () => setPatients(current => {
        const currentIds = new Set(current.map(patient => patient.id));
        return [...removed.filter(patient => !currentIds.has(patient.id)), ...current];
      }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">emergency</span>
            중증도 분류 (MCI)
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">START / JumpSTART 자동 분류 · 집계 · 수용병원 매칭</p>
        </div>
        <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5">
          <button
            onClick={() => setMode('adult')}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${mode === 'adult' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          >
            성인 START
          </button>
          <button
            onClick={() => setMode('child')}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${mode === 'child' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          >
            소아 JumpSTART
          </button>
        </div>
      </div>

      <MedicalDisclaimer source="START / JumpSTART Mass Casualty Triage" revisedYear="공개 알고리즘" />

      {/* 집계 보드 */}
      <div className="grid grid-cols-4 gap-3">
        {COLOR_ORDER.map(c => (
          <div key={c} className={`rounded-xl border p-4 text-center ${COLOR_CLASSES[c]}`}>
            <div className="text-3xl font-extrabold font-mono">{counts[c]}</div>
            <div className="text-xs font-bold mt-1">
              {TRIAGE_META[c].label} ({TRIAGE_META[c].tag})
            </div>
          </div>
        ))}
      </div>

      <TriageWizard mode={mode} onComplete={addPatient} />

      {/* 환자 목록 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-on-surface">현장 환자 보드 ({patients.length})</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {STATUS_ORDER.map(s => `${STATUS_LABEL[s]} ${statusCounts[s]}`).join(' · ')}
            </p>
          </div>
          {patients.length > 0 && (
            <button onClick={clearAll} className="text-xs text-on-surface-variant hover:text-error font-bold">
              전체 삭제
            </button>
          )}
        </div>
        {patients.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-6 text-center">아직 분류된 환자가 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {STATUS_ORDER.map(status => {
              const statusPatients = patients.filter(p => (p.status ?? 'triaged') === status);
              return (
                <div key={status} className="rounded-xl bg-surface-container p-3 min-h-[180px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-extrabold text-on-surface">{STATUS_LABEL[status]}</h4>
                    <span className="text-xs font-mono text-on-surface-variant">{statusPatients.length}</span>
                  </div>
                  {statusPatients.length === 0 ? (
                    <p className="text-xs text-on-surface-variant py-6 text-center">없음</p>
                  ) : (
                    <div className="space-y-2">
                      {statusPatients.map(p => (
                        <PatientCard
                          key={p.id}
                          patient={p}
                          onChange={patch => updatePatient(p.id, patch)}
                          onRemove={() => removePatient(p.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <HospitalMatch city={city} redCount={counts.red} yellowCount={counts.yellow} />
    </div>
  );
}

// ── 분류 위저드 ───────────────────────────────────────────────
function TriageWizard({ mode, onComplete }: { mode: Mode; onComplete: (color: TriageColor, label: string) => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [label, setLabel] = useState('');

  const steps = (mode === 'adult' ? START_STEPS : JUMPSTART_STEPS) as unknown as TriageStep<Answers>[];
  const classify = mode === 'adult'
    ? (a: Answers) => classifyStart(a as StartAnswers)
    : (a: Answers) => classifyJumpStart(a as JumpStartAnswers);

  const color = classify(answers);
  const nextStep = color === null ? steps.find(s => s.visible(answers) && answers[s.field as string] === undefined) : undefined;

  const answer = (field: string, value: boolean) => setAnswers(prev => ({ ...prev, [field]: value }));
  const restart = () => {
    setAnswers({});
    setLabel('');
  };

  const commit = () => {
    if (color) {
      onComplete(color, label);
      restart();
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface">환자 분류</h3>
        {Object.keys(answers).length > 0 && (
          <button onClick={restart} className="text-xs text-on-surface-variant hover:text-primary font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">restart_alt</span>다시 시작
          </button>
        )}
      </div>

      <input
        aria-label="환자 식별"
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="환자 식별 (위치/번호, 선택)"
        className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {nextStep ? (
        <div className="space-y-3">
          <p className="text-base font-bold text-on-surface">{nextStep.question}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => answer(nextStep.field as string, true)}
              className="bg-surface-container hover:bg-primary/20 border border-outline-variant/20 rounded-lg px-4 py-3 text-sm font-bold text-on-surface transition-colors"
            >
              {nextStep.yesLabel}
            </button>
            <button
              onClick={() => answer(nextStep.field as string, false)}
              className="bg-surface-container hover:bg-primary/20 border border-outline-variant/20 rounded-lg px-4 py-3 text-sm font-bold text-on-surface transition-colors"
            >
              {nextStep.noLabel}
            </button>
          </div>
        </div>
      ) : color ? (
        <div className={`rounded-xl border p-5 ${COLOR_CLASSES[color]}`}>
          <div className="text-sm font-bold">분류 결과</div>
          <div className="text-3xl font-extrabold mt-1">
            {TRIAGE_META[color].label} <span className="text-lg">({TRIAGE_META[color].tag})</span>
          </div>
          <button
            onClick={commit}
            className="mt-4 bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold hover:bg-primary/80 transition-colors"
          >
            환자 추가
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PatientCard({
  patient,
  onChange,
  onRemove,
}: {
  patient: TriagePatient;
  onChange: (patch: Partial<TriagePatient>) => void;
  onRemove: () => void;
}) {
  const status = patient.status ?? 'triaged';

  return (
    <div className={`rounded-xl border p-3 space-y-3 ${COLOR_CLASSES[patient.color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold">{TRIAGE_META[patient.color].label}</span>
            <span className="text-xs font-bold">{TRIAGE_META[patient.color].tag}</span>
          </div>
          <div className="text-sm font-bold text-on-surface truncate mt-0.5">{patient.label}</div>
          <div className="text-[11px] text-on-surface-variant">{patient.mode === 'adult' ? '성인' : '소아'} · {patient.createdAt}</div>
        </div>
        <button type="button" aria-label={`${patient.label} 환자 기록 삭제`} onClick={onRemove} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      <select
        aria-label="환자 상태"
        value={status}
        onChange={e => onChange({ status: e.target.value as PatientStatus })}
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-2 py-2 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {STATUS_ORDER.map(s => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>

      <input
        aria-label="이송 또는 인계처"
        type="text"
        value={patient.destination ?? ''}
        onChange={e => onChange({ destination: e.target.value })}
        placeholder="이송/인계처"
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-2 py-2 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <input
        aria-label="처치 및 특이사항"
        type="text"
        value={patient.note ?? ''}
        onChange={e => onChange({ note: e.target.value })}
        placeholder="처치·특이사항"
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-2 py-2 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

// ── 수용병원 매칭 ─────────────────────────────────────────────
function HospitalMatch({ city, redCount, yellowCount }: { city: string; redCount: number; yellowCount: number }) {
  const [hospitals, setHospitals] = useState<MatchedHospital[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const sido = CITY_TO_SIDO[city] ?? '서울특별시';
    getERRealTimeBeds(sido)
      .then(beds => setHospitals(matchHospitals(beds, { limit: 5 })))
      .catch(() => setHospitals([]))
      .finally(() => setLoading(false));
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-on-surface">수용 가능 병원</h3>
          <p className="text-xs text-on-surface-variant">긴급 {redCount}명 · 응급 {yellowCount}명 — 실시간 가용병상 기준</p>
        </div>
        <button
          onClick={load}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/80 transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-base">search</span>
          {hospitals ? '새로고침' : '병원 조회'}
        </button>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">조회 중…</p>}

      {hospitals && !loading && (
        hospitals.length === 0 ? (
          <p className="text-sm text-on-surface-variant">조회 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {hospitals.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border border-outline-variant/10 rounded-lg px-4 py-3 bg-surface-container/40">
                <div className="min-w-0">
                  <div className="font-bold text-on-surface text-sm truncate">{h.name}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{h.address}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-bold text-on-surface">응급 {h.erBeds ?? '-'}</div>
                    <div className="text-[11px] text-on-surface-variant">입원 {h.wardBeds ?? '-'}</div>
                  </div>
                  {h.tel && (
                    <a href={`tel:${h.tel}`} className="p-2 bg-primary/10 rounded-lg text-primary">
                      <span className="material-symbols-outlined text-lg">call</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
