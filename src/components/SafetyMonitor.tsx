import { useState, useEffect, useMemo } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { calculateAirTankSeconds, formatTimerSeconds } from '../utils/fieldCalculations';
import { estimateWbgt, classifyHeatStress, type HeatStressResult } from '../utils/heatStress';
import { CITY_GRIDS, getUltraShortNow, parseCurrentWeather, type CurrentWeather } from '../services/weatherApi';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import {
  WELLNESS_RESOURCES,
  STRESS_CHECK_QUESTIONS,
  evaluateStressCheck,
} from '../data/wellnessResources';

type SubTab = 'reentry' | 'heat' | 'wellness';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'reentry', label: '재진입 타이머', icon: 'timer' },
  { id: 'heat', label: '열압박 경고', icon: 'thermostat' },
  { id: 'wellness', label: '심신건강', icon: 'self_improvement' },
];

const REENTRY_PREFIX = '재진입';

const HEAT_COLOR: Record<string, string> = {
  green: 'text-green-400 bg-green-500/10 border-green-500/30',
  yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  red: 'text-red-400 bg-red-500/10 border-red-500/30',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

export default function SafetyMonitor({ city = 'seoul' }: { city?: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('reentry');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-on-surface font-headline">🦺 대원 안전 모니터</h2>
        <p className="text-sm text-on-surface-variant mt-1">재진입 관리 · 열압박 경고 · 심신건강 자가관리</p>
      </div>

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
        {activeSubTab === 'reentry' && <ReentryTimer />}
        {activeSubTab === 'heat' && <HeatStress city={city} />}
        {activeSubTab === 'wellness' && <Wellness />}
      </div>
    </div>
  );
}

// ── 재진입 타이머 ─────────────────────────────────────────────
function ReentryTimer() {
  const { timers, addTimer, toggleTimer, resetTimer, removeTimer, WARN_THRESHOLD, DANGER_THRESHOLD } = useTimer();
  const [pressure, setPressure] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reentryTimers = timers.filter(t => t.label.startsWith(REENTRY_PREFIX));

  const handleStart = () => {
    const seconds = calculateAirTankSeconds(Number(pressure));
    if (seconds === null) {
      setError('잔압은 1~300 bar 사이로 입력하세요.');
      return;
    }
    setError(null);
    const label = `${REENTRY_PREFIX}: ${team.trim() || '진입조'} (${pressure}bar)`;
    addTimer(seconds, label);
    setPressure('');
    setTeam('');
  };

  return (
    <div className="space-y-5">
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">timer</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">진입조 재진입 관리</h3>
            <p className="text-xs text-on-surface-variant">SCBA 잔압으로 가용시간을 산출해 복귀 타이머를 시작합니다 (300bar=30분 기준)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={team}
            onChange={e => setTeam(e.target.value)}
            placeholder="진입조 이름 (선택)"
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="number"
            value={pressure}
            onChange={e => setPressure(e.target.value)}
            placeholder="SCBA 잔압 (bar)"
            min={1}
            max={300}
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleStart}
            className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold hover:bg-primary/80 transition-colors"
          >
            타이머 시작
          </button>
        </div>
        {error && <p className="text-error text-sm font-medium">{error}</p>}
        <p className="text-xs text-on-surface-variant">
          1/3 지점(교대 경고)·10% 지점(위험 경고)에서 진동·알림이 울립니다. 화면 켜짐(WakeLock)이 유지됩니다.
        </p>
      </div>

      {reentryTimers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl opacity-30">timer_off</span>
          <p className="mt-3 text-sm">진행 중인 재진입 타이머가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reentryTimers.map(t => {
            const ratio = t.totalSeconds > 0 ? t.remaining / t.totalSeconds : 0;
            const danger = ratio <= DANGER_THRESHOLD;
            const warn = !danger && ratio <= WARN_THRESHOLD;
            const barColor = danger ? 'bg-error' : warn ? 'bg-amber-400' : 'bg-primary';
            return (
              <div
                key={t.id}
                className={`border rounded-xl p-5 bg-surface-container-lowest ${
                  danger ? 'border-error/50 animate-pulse' : warn ? 'border-amber-400/40' : 'border-outline-variant/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-on-surface text-sm truncate">{t.label.replace(`${REENTRY_PREFIX}: `, '')}</span>
                  <button onClick={() => removeTimer(t.id)} className="text-on-surface-variant hover:text-error">
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
                <div className={`text-4xl font-mono font-extrabold my-3 ${danger ? 'text-error' : warn ? 'text-amber-400' : 'text-on-surface'}`}>
                  {formatTimerSeconds(t.remaining)}
                </div>
                <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.max(0, ratio * 100)}%` }} />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => toggleTimer(t.id)}
                    className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-3 py-2 rounded-lg text-sm font-bold"
                  >
                    {t.isRunning ? '일시정지' : '시작'}
                  </button>
                  <button
                    onClick={() => resetTimer(t.id)}
                    className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant px-3 py-2 rounded-lg text-sm font-bold"
                  >
                    리셋
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 열압박(WBGT) 경고 ─────────────────────────────────────────
function HeatStress({ city }: { city: string }) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState<{ temp: string; humidity: string }>({ temp: '', humidity: '' });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const grid = CITY_GRIDS[city] ?? CITY_GRIDS.seoul;
    getUltraShortNow(grid.nx, grid.ny)
      .then(items => {
        if (!alive) return;
        setWeather(items.length ? parseCurrentWeather(items) : null);
      })
      .catch(() => alive && setWeather(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [city]);

  const result = useMemo<HeatStressResult | null>(() => {
    const temp = manual.temp !== '' ? Number(manual.temp) : weather?.temperature;
    const humidity = manual.humidity !== '' ? Number(manual.humidity) : weather?.humidity;
    if (temp === undefined || humidity === undefined) return null;
    const wbgt = estimateWbgt(temp, humidity);
    return wbgt === null ? null : classifyHeatStress(wbgt);
  }, [weather, manual]);

  return (
    <div className="space-y-5">
      <div className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-3 md:p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">info</span>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          <span className="font-bold text-amber-300">추정값 안내</span> — 흑구온도계 미측정 환경이라 기온·습도 기반 간이식으로 WBGT를
          <b> 추정</b>합니다. 직사광·복사열은 반영되지 않아 실제보다 낮게 나올 수 있습니다.
        </p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-bold text-on-surface">현재 열압박 지수</h3>
          {weather && (
            <span className="text-xs text-on-surface-variant">
              기상 실황: {weather.temperature}°C · 습도 {weather.humidity}%
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-on-surface-variant text-sm">기상 정보를 불러오는 중…</p>
        ) : result ? (
          <div className={`rounded-xl border p-5 ${HEAT_COLOR[result.color] ?? HEAT_COLOR.green}`}>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold font-mono">{result.wbgt}°C</span>
              <span className="text-xl font-bold">{result.label}</span>
            </div>
            <p className="text-sm mt-2 text-on-surface">{result.advice}</p>
            <div className="flex gap-4 mt-3 text-sm font-bold text-on-surface">
              <span>권장 작업 {result.workMinutes}분</span>
              <span>휴식 {result.restMinutes}분 / 시간</span>
            </div>
          </div>
        ) : (
          <p className="text-on-surface-variant text-sm">기상 정보를 불러오지 못했습니다. 아래에 직접 입력하세요.</p>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <input
            type="number"
            value={manual.temp}
            onChange={e => setManual(m => ({ ...m, temp: e.target.value }))}
            placeholder={`기온(°C)${weather ? ` · 실황 ${weather.temperature}` : ''}`}
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="number"
            value={manual.humidity}
            onChange={e => setManual(m => ({ ...m, humidity: e.target.value }))}
            placeholder={`습도(%)${weather ? ` · 실황 ${weather.humidity}` : ''}`}
            className="bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <p className="text-xs text-on-surface-variant">값을 입력하면 실황 대신 입력값으로 계산합니다.</p>
      </div>
    </div>
  );
}

// ── 심신건강 ──────────────────────────────────────────────────
function Wellness() {
  const [answers, setAnswers] = useLocalStorageState<number[]>(
    '119helper-stress-check',
    () => STRESS_CHECK_QUESTIONS.map(() => 0),
  );
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => evaluateStressCheck(answers), [answers]);
  const resultColor =
    result.level === 'good'
      ? 'text-green-400 bg-green-500/10 border-green-500/30'
      : result.level === 'mild'
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        : 'text-red-400 bg-red-500/10 border-red-500/30';

  return (
    <div className="space-y-5">
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-on-surface">스트레스 자가체크 (익명·기기 저장)</h3>
          <p className="text-xs text-on-surface-variant mt-1">최근 2주 기준. 0(전혀 아니다)~3(매우 그렇다). 진단이 아닌 참고용입니다.</p>
        </div>

        <div className="space-y-3">
          {STRESS_CHECK_QUESTIONS.map((q, idx) => (
            <div key={q.id} className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-on-surface flex-1 min-w-[180px]">{q.text}</span>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map(v => (
                  <button
                    key={v}
                    onClick={() => setAnswers(prev => prev.map((a, i) => (i === idx ? v : a)))}
                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                      answers[idx] === v
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
        </div>

        <button
          onClick={() => setSubmitted(true)}
          className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold hover:bg-primary/80 transition-colors"
        >
          결과 보기
        </button>

        {submitted && (
          <div className={`rounded-xl border p-5 ${resultColor}`}>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold font-mono">{result.score}/{result.max}</span>
              <span className="text-lg font-bold">{result.label}</span>
            </div>
            <p className="text-sm mt-2 text-on-surface">{result.advice}</p>
          </div>
        )}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-3">
        <h3 className="text-lg font-bold text-on-surface">상담·도움 연락처</h3>
        <p className="text-xs text-on-surface-variant">번호·기관은 변경될 수 있으니 사용 전 확인하세요.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {WELLNESS_RESOURCES.map(r => (
            <div key={r.id} className="border border-outline-variant/10 rounded-lg p-4 bg-surface-container/40">
              <div className="font-bold text-on-surface text-sm">{r.name}</div>
              <p className="text-xs text-on-surface-variant mt-1">{r.desc}</p>
              <div className="flex gap-3 mt-2">
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="text-primary text-sm font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">call</span>
                    {r.phone}
                  </a>
                )}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                    바로가기
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
