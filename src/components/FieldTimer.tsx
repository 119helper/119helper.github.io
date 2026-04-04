import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 타이머 프리셋 ───
const PRESETS = [
  { label: '30분', seconds: 30 * 60, desc: '공기호흡기 (6.8L)', color: 'bg-green-500', icon: 'air' },
  { label: '45분', seconds: 45 * 60, desc: '공기호흡기 (9L)', color: 'bg-blue-500', icon: 'air' },
  { label: '60분', seconds: 60 * 60, desc: '장시간 작전', color: 'bg-purple-500', icon: 'schedule' },
  { label: '15분', seconds: 15 * 60, desc: '교대 알림', color: 'bg-orange-500', icon: 'swap_horiz' },
  { label: '사용자', seconds: 0, desc: '직접 설정', color: 'bg-gray-500', icon: 'tune' },
];

// 경고 기준 (남은 비율)
const WARN_THRESHOLD = 0.33; // 1/3 남으면 경고
const DANGER_THRESHOLD = 0.1; // 10% 남으면 위험

interface TimerState {
  id: number;
  label: string;
  totalSeconds: number;
  remaining: number;
  isRunning: boolean;
  startedAt: Date | null;
}

interface StopwatchLap {
  label: string;
  time: Date;
  elapsed: number; // ms from first lap
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

let nextTimerId = 1;

export default function FieldTimer() {
  const [timers, setTimers] = useState<TimerState[]>([]);
  const [customMinutes, setCustomMinutes] = useState(20);
  const [showPresets, setShowPresets] = useState(true);

  // 스톱워치 (출동 시간 기록)
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchStart, setStopwatchStart] = useState<Date | null>(null);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [laps, setLaps] = useState<StopwatchLap[]>([]);
  const [, setTick] = useState(0); // force re-render

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ─── Wake Lock (화면 꺼짐 방지) ───
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* 지원 안 되면 무시 */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  // ─── 타이머 틱 ───
  const stopwatchStartRef = useRef(stopwatchStart);
  stopwatchStartRef.current = stopwatchStart;

  const hasRunningTimer = timers.some(t => t.isRunning);

  useEffect(() => {
    const hasActive = hasRunningTimer || stopwatchRunning;

    if (hasActive) {
      requestWakeLock();
      intervalRef.current = setInterval(() => {
        setTimers(prev => prev.map(t => {
          if (!t.isRunning || t.remaining <= 0) return t;
          const newRemaining = t.remaining - 1;

          // 진동 알림
          if (newRemaining === 0) {
            try { navigator.vibrate?.([500, 200, 500, 200, 500]); } catch { /* */ }
          } else if (newRemaining === Math.floor(t.totalSeconds * WARN_THRESHOLD)) {
            try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
          }

          return { ...t, remaining: Math.max(0, newRemaining) };
        }));

        const sw = stopwatchStartRef.current;
        if (stopwatchRunning && sw) {
          setStopwatchElapsed(Date.now() - sw.getTime());
        }

        setTick(t => t + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      releaseWakeLock();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasRunningTimer, stopwatchRunning, requestWakeLock, releaseWakeLock]);

  // ─── 타이머 조작 ───
  const addTimer = (seconds: number, label: string) => {
    const timer: TimerState = {
      id: nextTimerId++,
      label,
      totalSeconds: seconds,
      remaining: seconds,
      isRunning: false,
      startedAt: null,
    };
    setTimers(prev => [...prev, timer]);
    setShowPresets(false);
  };

  const toggleTimer = (id: number) => {
    setTimers(prev => prev.map(t =>
      t.id === id ? { ...t, isRunning: !t.isRunning, startedAt: !t.isRunning ? new Date() : t.startedAt } : t
    ));
  };

  const resetTimer = (id: number) => {
    setTimers(prev => prev.map(t =>
      t.id === id ? { ...t, remaining: t.totalSeconds, isRunning: false } : t
    ));
  };

  const removeTimer = (id: number) => {
    setTimers(prev => prev.filter(t => t.id !== id));
    if (timers.length <= 1) setShowPresets(true);
  };

  // ─── 스톱워치 조작 ───
  const toggleStopwatch = () => {
    if (!stopwatchRunning) {
      const start = stopwatchStart || new Date();
      if (!stopwatchStart) {
        setStopwatchStart(start);
        setLaps([{ label: '출동', time: start, elapsed: 0 }]);
      }
      setStopwatchRunning(true);
    } else {
      setStopwatchRunning(false);
    }
  };

  const addLap = (label: string) => {
    if (!stopwatchStart) return;
    setLaps(prev => [...prev, {
      label,
      time: new Date(),
      elapsed: Date.now() - stopwatchStart.getTime()
    }]);
  };

  const resetStopwatch = () => {
    setStopwatchRunning(false);
    setStopwatchStart(null);
    setStopwatchElapsed(0);
    setLaps([]);
  };

  const getTimerColor = (t: TimerState) => {
    if (t.remaining <= 0) return { ring: 'ring-red-500', bg: 'bg-red-500/20', text: 'text-red-400', label: '종료' };
    const ratio = t.remaining / t.totalSeconds;
    if (ratio <= DANGER_THRESHOLD) return { ring: 'ring-red-500 animate-pulse', bg: 'bg-red-500/20', text: 'text-red-400', label: '위험' };
    if (ratio <= WARN_THRESHOLD) return { ring: 'ring-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '경고' };
    return { ring: 'ring-green-500/30', bg: 'bg-green-500/10', text: 'text-green-400', label: '정상' };
  };

  const copyReport = async () => {
    const ts = new Date().toLocaleString('ko-KR');
    let text = `⏱️ 현장 활동 기록\n📅 ${ts}\n${'─'.repeat(25)}\n\n`;

    if (laps.length > 0) {
      text += `📍 스톱워치 기록:\n`;
      laps.forEach((lap, i) => {
        text += `  ${i + 1}. ${lap.label}: ${lap.time.toLocaleTimeString('ko-KR')} (${formatTimeMs(lap.elapsed)})\n`;
      });
      text += `  총 경과: ${formatTimeMs(stopwatchElapsed)}\n\n`;
    }

    if (timers.length > 0) {
      text += `⏳ 타이머 기록:\n`;
      timers.forEach(t => {
        const used = t.totalSeconds - t.remaining;
        text += `  - ${t.label}: ${formatTime(used)} 사용 / ${formatTime(t.totalSeconds)} 중\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      alert('활동 기록이 복사되었습니다.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl">
              <span className="material-symbols-outlined text-orange-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>timer</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">현장 활동 타이머</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                공기호흡기 · 교대 · 출동 시간 관리
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!showPresets && (
              <button onClick={() => setShowPresets(true)}
                className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">add_alarm</span>
                추가
              </button>
            )}
            {(timers.length > 0 || laps.length > 0) && (
              <button onClick={copyReport}
                className="bg-surface-container text-on-surface-variant px-3 py-2 rounded-lg text-sm font-bold hover:bg-surface-container-high transition-colors flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">content_copy</span>
                기록 복사
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 프리셋 선택 */}
      {showPresets && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
          <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">add_alarm</span>
            타이머 추가
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  if (preset.seconds === 0) {
                    addTimer(customMinutes * 60, `${customMinutes}분`);
                  } else {
                    addTimer(preset.seconds, preset.label);
                  }
                }}
                className="bg-surface-container border border-outline-variant/20 rounded-xl p-4 text-left hover:border-primary/30 hover:scale-[1.02] transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-8 h-8 ${preset.color} rounded-lg flex items-center justify-center`}>
                    <span className="material-symbols-outlined text-white text-lg">{preset.icon}</span>
                  </span>
                  <span className="text-lg font-black text-on-surface font-headline">{preset.label}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant">{preset.desc}</p>
              </button>
            ))}
          </div>
          {/* 사용자 정의 분 슬라이더 */}
          <div className="mt-3 flex items-center gap-3 bg-surface-container/50 rounded-lg px-4 py-3">
            <span className="text-xs text-on-surface-variant font-bold whitespace-nowrap">직접 설정:</span>
            <input
              type="range"
              min={1} max={120} step={1}
              value={customMinutes}
              onChange={e => setCustomMinutes(parseInt(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold text-primary w-12 text-right">{customMinutes}분</span>
          </div>
        </div>
      )}

      {/* 활성 타이머 */}
      {timers.map(t => {
        const color = getTimerColor(t);
        const progress = t.totalSeconds > 0 ? ((t.totalSeconds - t.remaining) / t.totalSeconds) * 100 : 0;

        return (
          <div
            key={t.id}
            className={`${color.bg} border-2 ${color.ring} rounded-2xl overflow-hidden transition-all`}
          >
            {/* 진행 바 */}
            <div className="h-1.5 bg-surface-container/30">
              <div
                className={`h-full transition-all duration-1000 ${
                  t.remaining <= 0 ? 'bg-red-500' :
                  t.remaining / t.totalSeconds <= DANGER_THRESHOLD ? 'bg-red-500 animate-pulse' :
                  t.remaining / t.totalSeconds <= WARN_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">air</span>
                  <span className="text-sm font-bold text-on-surface">{t.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${color.bg} ${color.text} border ${color.ring}`}>
                    {color.label}
                  </span>
                </div>
                <button onClick={() => removeTimer(t.id)} className="text-on-surface-variant hover:text-red-400 transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* 큰 시간 표시 */}
              <div className="text-center my-4">
                <p className={`text-6xl sm:text-7xl font-black font-mono tracking-tight ${color.text} tabular-nums`}>
                  {formatTime(t.remaining)}
                </p>
                <p className="text-xs text-on-surface-variant mt-2">
                  총 {formatTime(t.totalSeconds)} 중 {formatTime(t.totalSeconds - t.remaining)} 경과
                </p>
              </div>

              {/* 컨트롤 */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => toggleTimer(t.id)}
                  className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg ${
                    t.isRunning
                      ? 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-yellow-500/20'
                      : t.remaining <= 0
                        ? 'bg-surface-container text-on-surface-variant'
                        : 'bg-green-500 text-white hover:bg-green-400 shadow-green-500/20'
                  }`}
                  disabled={t.remaining <= 0}
                >
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {t.isRunning ? 'pause' : 'play_arrow'}
                  </span>
                  {t.isRunning ? '일시정지' : t.remaining <= 0 ? '종료됨' : '시작'}
                </button>
                <button
                  onClick={() => resetTimer(t.id)}
                  className="px-4 py-3 rounded-xl text-sm font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-lg">restart_alt</span>
                  리셋
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* 스톱워치 (출동 시간 기록) */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-outline-variant/10 bg-surface-container/30">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-400 text-2xl">timer</span>
            <div>
              <h3 className="text-lg font-bold text-on-surface">출동 시간 기록</h3>
              <p className="text-xs text-on-surface-variant">출동 → 도착 → 진압 완료 시간 자동 기록</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* 경과 시간 */}
          <div className="text-center mb-5">
            <p className={`text-5xl font-black font-mono tracking-tight tabular-nums ${stopwatchRunning ? 'text-blue-400' : 'text-on-surface'}`}>
              {formatTimeMs(stopwatchElapsed)}
            </p>
            {stopwatchStart && (
              <p className="text-xs text-on-surface-variant mt-2">
                시작: {stopwatchStart.toLocaleTimeString('ko-KR')}
              </p>
            )}
          </div>

          {/* 컨트롤 */}
          <div className="flex gap-3 justify-center mb-4">
            <button
              onClick={toggleStopwatch}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg ${
                stopwatchRunning
                  ? 'bg-yellow-500 text-black shadow-yellow-500/20'
                  : 'bg-blue-500 text-white shadow-blue-500/20'
              }`}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                {stopwatchRunning ? 'pause' : 'play_arrow'}
              </span>
              {stopwatchRunning ? '일시정지' : stopwatchStart ? '재개' : '출동 시작'}
            </button>
            {stopwatchStart && (
              <button
                onClick={resetStopwatch}
                className="px-4 py-3 rounded-xl text-sm font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-lg">restart_alt</span>
              </button>
            )}
          </div>

          {/* 랩 버튼 */}
          {stopwatchStart && (
            <div className="flex gap-2 flex-wrap justify-center mb-4">
              {['현장 도착', '진압 시작', '진압 완료', '인명 구조', '귀서'].map(label => (
                <button
                  key={label}
                  onClick={() => addLap(label)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                >
                  📍 {label}
                </button>
              ))}
            </div>
          )}

          {/* 랩 기록 */}
          {laps.length > 0 && (
            <div className="bg-surface-container/30 rounded-xl p-4 space-y-2">
              {laps.map((lap, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-black">
                      {i + 1}
                    </span>
                    <span className="font-bold text-on-surface">{lap.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-on-surface-variant text-xs">{lap.time.toLocaleTimeString('ko-KR')}</span>
                    <span className="text-on-surface font-mono font-bold ml-2">{formatTimeMs(lap.elapsed)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
