import { useState, useEffect } from 'react';
import MedicalDisclaimer from './common/MedicalDisclaimer';
import { EMS_PROTOCOLS, type ProtocolCategory } from '../data/emsProtocols';
import { EMS_DRUGS } from '../data/emsDrugs';
import { calculateDrugDose, calculateGCS, calculateAPGAR, type ApgarScores } from '../utils/emsCalculations';

type SubTab = 'protocol' | 'drug' | 'score';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'protocol', label: '응급처치 프로토콜', icon: 'list_alt' },
  { id: 'drug', label: '약물 용량', icon: 'medication' },
  { id: 'score', label: '평가 스코어', icon: 'calculate' },
];

const CATEGORY_ICON: Record<ProtocolCategory, string> = {
  심정지: 'cardiology',
  아나필락시스: 'allergy',
  경련: 'neurology',
  중독: 'science',
  분만: 'pregnancy',
  외상: 'personal_injury',
};

export default function EmsProtocol({ subId }: { subId?: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('protocol');

  useEffect(() => {
    if (subId === 'drug' || subId === 'score' || subId === 'protocol') setActiveSubTab(subId);
  }, [subId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-on-surface font-headline">🚑 응급처치 · 약물</h2>
        <p className="text-sm text-on-surface-variant mt-1">증상별 프로토콜 · 체중기반 약물 용량 · 평가 스코어</p>
      </div>

      <MedicalDisclaimer source="소방청 119구급대원 현장응급처치 표준지침 / KACPR" revisedYear={2023} />

      <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5 overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-high/50'
            }`}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={activeSubTab === tab.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeSubTab === 'protocol' && <ProtocolList />}
        {activeSubTab === 'drug' && <DrugCalculator />}
        {activeSubTab === 'score' && <ScoreCalculator />}
      </div>
    </div>
  );
}

// ── 프로토콜 ──────────────────────────────────────────────────
function ProtocolList() {
  const [openId, setOpenId] = useState<string | null>(EMS_PROTOCOLS[0]?.id ?? null);

  return (
    <div className="space-y-3">
      {EMS_PROTOCOLS.map(p => {
        const open = openId === p.id;
        return (
          <div key={p.id} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenId(open ? null : p.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-container-high/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-error/10 rounded-lg">
                  <span className="material-symbols-outlined text-error">{CATEGORY_ICON[p.category]}</span>
                </div>
                <div className="text-left">
                  <div className="font-bold text-on-surface">{p.title}</div>
                  <div className="text-xs text-on-surface-variant">{p.category}</div>
                </div>
              </div>
              <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>
            {open && (
              <div className="px-4 pb-4 space-y-4 animate-slide-in-top">
                <ol className="space-y-2">
                  {p.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-on-surface">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="text-xs font-bold text-amber-300 mb-1">주의</div>
                  <ul className="list-disc list-inside text-xs text-on-surface-variant space-y-1">
                    {p.cautions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-[11px] text-on-surface-variant">출처: {p.source} ({p.revisedYear})</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 약물 계산 ─────────────────────────────────────────────────
function DrugCalculator() {
  const [weight, setWeight] = useState('');
  const weightNum = Number(weight);
  const valid = weight !== '' && Number.isFinite(weightNum) && weightNum > 0;

  return (
    <div className="space-y-5">
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">monitor_weight</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">환자 체중 입력</h3>
            <p className="text-xs text-on-surface-variant">체중을 입력하면 약물별 용량·용적이 자동 계산됩니다</p>
          </div>
        </div>
        <input
          type="number"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          placeholder="체중 (kg)"
          min={1}
          max={300}
          className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EMS_DRUGS.map(drug => {
          const result = valid ? calculateDrugDose(drug, weightNum) : null;
          return (
            <div key={drug.id} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-on-surface">{drug.name}</h4>
                {drug.pediatric && (
                  <span className="text-[10px] font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded-full">소아 가능</span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">{drug.indication}</p>
              <div className="text-[11px] text-on-surface-variant mt-2">
                {drug.dosePerKg} {drug.unit}/kg · {drug.concentrationLabel} · {drug.route}
              </div>

              {result ? (
                <div className="mt-3 bg-surface-container rounded-lg p-3 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold font-mono text-primary">
                      {result.doseAmount} {drug.unit}
                    </span>
                    {result.volumeMl !== null && (
                      <span className="text-sm font-bold text-on-surface">≈ {result.volumeMl} mL</span>
                    )}
                  </div>
                  {result.cappedByMax && (
                    <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      최대용량({drug.maxDose} {drug.unit}) 상한 적용됨
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-on-surface-variant">체중 입력 시 계산됩니다</div>
              )}
              {drug.notes && <p className="text-[11px] text-on-surface-variant mt-2">{drug.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 평가 스코어 (GCS / APGAR) ─────────────────────────────────
function ScoreCalculator() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GcsCard />
      <ApgarCard />
    </div>
  );
}

const GCS_OPTIONS = {
  eye: [
    { v: 4, label: '자발적으로 눈뜸' },
    { v: 3, label: '소리에 눈뜸' },
    { v: 2, label: '통증에 눈뜸' },
    { v: 1, label: '없음' },
  ],
  verbal: [
    { v: 5, label: '지남력 있음' },
    { v: 4, label: '혼돈된 대화' },
    { v: 3, label: '부적절한 단어' },
    { v: 2, label: '이해불명 소리' },
    { v: 1, label: '없음' },
  ],
  motor: [
    { v: 6, label: '명령에 따름' },
    { v: 5, label: '통증부위 국재화' },
    { v: 4, label: '통증에 회피' },
    { v: 3, label: '이상굴곡' },
    { v: 2, label: '이상신전' },
    { v: 1, label: '없음' },
  ],
};

function GcsCard() {
  const [eye, setEye] = useState(4);
  const [verbal, setVerbal] = useState(5);
  const [motor, setMotor] = useState(6);
  const result = calculateGCS(eye, verbal, motor);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-bold text-on-surface">GCS (의식수준)</h3>
      <ScoreSelect label="눈뜸 반응 (E)" options={GCS_OPTIONS.eye} value={eye} onChange={setEye} />
      <ScoreSelect label="언어 반응 (V)" options={GCS_OPTIONS.verbal} value={verbal} onChange={setVerbal} />
      <ScoreSelect label="운동 반응 (M)" options={GCS_OPTIONS.motor} value={motor} onChange={setMotor} />
      {result && (
        <div className="bg-surface-container rounded-lg p-4 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold font-mono text-primary">{result.total}</span>
          <span className="text-sm text-on-surface-variant">/ 15 · {result.severity}</span>
        </div>
      )}
    </div>
  );
}

const APGAR_FIELDS: { key: keyof ApgarScores; label: string }[] = [
  { key: 'appearance', label: '피부색 (Appearance)' },
  { key: 'pulse', label: '심박수 (Pulse)' },
  { key: 'grimace', label: '반사 (Grimace)' },
  { key: 'activity', label: '근긴장도 (Activity)' },
  { key: 'respiration', label: '호흡 (Respiration)' },
];

function ApgarCard() {
  const [scores, setScores] = useState<ApgarScores>({
    appearance: 2,
    pulse: 2,
    grimace: 2,
    activity: 2,
    respiration: 2,
  });
  const result = calculateAPGAR(scores);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-bold text-on-surface">APGAR (신생아)</h3>
      {APGAR_FIELDS.map(f => (
        <div key={f.key} className="flex items-center justify-between gap-3">
          <span className="text-sm text-on-surface">{f.label}</span>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(v => (
              <button
                key={v}
                onClick={() => setScores(s => ({ ...s, [f.key]: v }))}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                  scores[f.key] === v
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      {result && (
        <div className="bg-surface-container rounded-lg p-4 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold font-mono text-primary">{result.total}</span>
          <span className="text-sm text-on-surface-variant">/ 10 · {result.status}</span>
        </div>
      )}
    </div>
  );
}

function ScoreSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-on-surface-variant">{label}</label>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-1 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {options.map(o => (
          <option key={o.v} value={o.v}>
            {o.v} — {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
