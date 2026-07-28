import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  loadTimerSession,
  saveTimerSession,
  type StopwatchLap,
  type TimerState,
} from '../services/timerPersistence';
/* eslint-disable react-refresh/only-export-components */
export type { StopwatchLap, TimerState } from '../services/timerPersistence';
const WARN_THRESHOLD = 0.33;
const DANGER_THRESHOLD = 0.1;

interface TimerContextValue {
  timers: TimerState[];
  stopwatchRunning: boolean;
  stopwatchStart: Date | null;
  stopwatchElapsed: number;
  laps: StopwatchLap[];
  addTimer: (seconds: number, label: string) => void;
  toggleTimer: (id: number) => void;
  resetTimer: (id: number) => void;
  removeTimer: (id: number) => void;
  toggleStopwatch: () => void;
  addLap: (label: string) => void;
  resetStopwatch: () => void;
  formatTime: (seconds: number) => string;
  formatTimeMs: (ms: number) => string;
  WARN_THRESHOLD: number;
  DANGER_THRESHOLD: number;
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined);

let nextTimerId = 1;

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatTimeMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState(() => {
    const loaded = loadTimerSession();
    nextTimerId = Math.max(1, ...loaded.timers.map(timer => timer.id + 1));
    return loaded;
  });
  const [timers, setTimers] = useState<TimerState[]>(initialSession.timers);
  const [stopwatchRunning, setStopwatchRunning] = useState(initialSession.stopwatchRunning);
  const [stopwatchStart, setStopwatchStart] = useState<Date | null>(initialSession.stopwatchStart);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(initialSession.stopwatchElapsed);
  const [stopwatchAccumulated, setStopwatchAccumulated] = useState(initialSession.stopwatchElapsed);
  const [stopwatchRunStartedAt, setStopwatchRunStartedAt] = useState<number | null>(initialSession.stopwatchRunStartedAt);
  const [laps, setLaps] = useState<StopwatchLap[]>(initialSession.laps);
  const [, setTick] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastTickRef = useRef<number>(0);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* ignorar */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  const timersRef = useRef(timers);
  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  const timerPersistenceKey = useMemo(() => JSON.stringify(timers.map(timer => ({
    id: timer.id,
    label: timer.label,
    totalSeconds: timer.totalSeconds,
    remaining: timer.isRunning ? null : timer.remaining,
    isRunning: timer.isRunning,
    startedAt: timer.startedAt?.getTime() ?? null,
    endsAt: timer.endsAt,
  }))), [timers]);

  useEffect(() => {
    saveTimerSession({
      timers: timersRef.current,
      stopwatchRunning,
      stopwatchStart,
      stopwatchElapsed: stopwatchAccumulated,
      stopwatchRunStartedAt,
      laps,
    });
  }, [timerPersistenceKey, stopwatchRunning, stopwatchStart, stopwatchAccumulated, stopwatchRunStartedAt, laps]);

  const hasRunningTimer = timers.some(t => t.isRunning);

  useEffect(() => {
    const hasActive = hasRunningTimer || stopwatchRunning;

    if (hasActive) {
      requestWakeLock();

      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const deltaSec = Math.floor((now - lastTickRef.current) / 1000);

        if (deltaSec >= 1) {
          lastTickRef.current = now - ((now - lastTickRef.current) % 1000);

          setTimers(prev => prev.map(t => {
            if (!t.isRunning || t.remaining <= 0) return t;
            
            const oldRemaining = t.remaining;
            const newRemaining = t.endsAt
              ? Math.max(0, Math.ceil((t.endsAt - now) / 1000))
              : Math.max(0, oldRemaining - deltaSec);
            
            const dangerThreshold = Math.floor(t.totalSeconds * DANGER_THRESHOLD);
            const warnThreshold = Math.floor(t.totalSeconds * WARN_THRESHOLD);

            if (newRemaining === 0 && oldRemaining > 0) {
              try { navigator.vibrate?.([500, 200, 500, 200, 500]); } catch { /* */ }
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🚨 타이머 종료', { body: `${t.label} 시간이 모두 경과되었습니다.` });
              }
            } else if (newRemaining <= dangerThreshold && oldRemaining > dangerThreshold) {
              try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('⚠️ 위험 경고', { body: `${t.label} 남은 시간이 10% 이하입니다! 대피 혹은 교대를 준비하세요.` });
              }
            } else if (newRemaining <= warnThreshold && oldRemaining > warnThreshold) {
              try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('📢 교대 경고', { body: `${t.label} 1/3 남았습니다.` });
              }
            }

            return {
              ...t,
              remaining: newRemaining,
              isRunning: newRemaining > 0,
              endsAt: newRemaining > 0 ? t.endsAt : null,
            };
          }));

          if (stopwatchRunning && stopwatchRunStartedAt !== null) {
            setStopwatchElapsed(stopwatchAccumulated + Math.max(0, now - stopwatchRunStartedAt));
          }

          setTick(t => t + 1);
        }
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      releaseWakeLock();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasRunningTimer, stopwatchRunning, stopwatchAccumulated, stopwatchRunStartedAt, requestWakeLock, releaseWakeLock]);

  const addTimer = (seconds: number, label: string) => {
    const timer: TimerState = {
      id: nextTimerId++,
      label,
      totalSeconds: seconds,
      remaining: seconds,
      isRunning: false,
      startedAt: null,
      endsAt: null,
    };
    setTimers(prev => [...prev, timer]);
  };

  const toggleTimer = (id: number) => {
    const now = Date.now();
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.isRunning) {
        const remaining = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.remaining;
        return { ...t, remaining, isRunning: false, endsAt: null };
      }
      if (t.remaining <= 0) return t;
      return {
        ...t,
        isRunning: true,
        startedAt: t.startedAt ?? new Date(now),
        endsAt: now + t.remaining * 1000,
      };
    }));
  };

  const resetTimer = (id: number) => {
    setTimers(prev => prev.map(t =>
      t.id === id ? { ...t, remaining: t.totalSeconds, isRunning: false, startedAt: null, endsAt: null } : t
    ));
  };

  const removeTimer = (id: number) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  };

  const toggleStopwatch = () => {
    const now = Date.now();
    if (!stopwatchRunning) {
      const start = stopwatchStart || new Date(now);
      if (!stopwatchStart) {
        setStopwatchStart(start);
        setLaps([{ label: '출동', time: start, elapsed: 0 }]);
        setStopwatchAccumulated(0);
        setStopwatchElapsed(0);
      }
      setStopwatchRunStartedAt(now);
      setStopwatchRunning(true);
    } else {
      const elapsed = stopwatchAccumulated + (stopwatchRunStartedAt === null ? 0 : Math.max(0, now - stopwatchRunStartedAt));
      setStopwatchAccumulated(elapsed);
      setStopwatchElapsed(elapsed);
      setStopwatchRunStartedAt(null);
      setStopwatchRunning(false);
    }
  };

  const addLap = (label: string) => {
    if (!stopwatchStart) return;
    setLaps(prev => [...prev, {
      label,
      time: new Date(),
      elapsed: stopwatchElapsed,
    }]);
  };

  const resetStopwatch = () => {
    setStopwatchRunning(false);
    setStopwatchStart(null);
    setStopwatchElapsed(0);
    setStopwatchAccumulated(0);
    setStopwatchRunStartedAt(null);
    setLaps([]);
  };

  return (
    <TimerContext.Provider value={{
      timers, stopwatchRunning, stopwatchStart, stopwatchElapsed, laps,
      addTimer, toggleTimer, resetTimer, removeTimer,
      toggleStopwatch, addLap, resetStopwatch,
      formatTime, formatTimeMs,
      WARN_THRESHOLD, DANGER_THRESHOLD
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}
