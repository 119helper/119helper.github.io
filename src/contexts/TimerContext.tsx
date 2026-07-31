import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  loadTimerSession,
  saveTimerSession,
  timersForIncident,
  type StopwatchLap,
  type TimerState,
} from '../services/timerPersistence';
import { useIncidentSession } from '../hooks/useIncidentSession';
/* eslint-disable react-refresh/only-export-components */
export type { StopwatchLap, TimerState } from '../services/timerPersistence';
const WARN_THRESHOLD = 0.33;
const DANGER_THRESHOLD = 0.1;

interface TimerContextValue {
  timers: TimerState[];
  allTimers: TimerState[];
  otherScopeTimerCount: number;
  stopwatchIncidentId: string | null;
  stopwatchScopeBlocked: boolean;
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
  clearIncidentScope: (incidentId: string) => void;
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
  const [incidentSession] = useIncidentSession();
  const scopeIncidentId = incidentSession.active && incidentSession.incidentId
    ? incidentSession.incidentId
    : null;
  const [initialSession] = useState(() => {
    const loaded = loadTimerSession();
    nextTimerId = Math.max(1, ...loaded.timers.map(timer => timer.id + 1));
    return loaded;
  });
  const [allTimers, setAllTimers] = useState<TimerState[]>(initialSession.timers);
  const [storedStopwatchIncidentId, setStoredStopwatchIncidentId] = useState<string | null>(
    initialSession.stopwatchIncidentId,
  );
  const [storedStopwatchRunning, setStoredStopwatchRunning] = useState(initialSession.stopwatchRunning);
  const [storedStopwatchStart, setStoredStopwatchStart] = useState<Date | null>(initialSession.stopwatchStart);
  const [storedStopwatchElapsed, setStoredStopwatchElapsed] = useState(initialSession.stopwatchElapsed);
  const [stopwatchAccumulated, setStopwatchAccumulated] = useState(initialSession.stopwatchElapsed);
  const [stopwatchRunStartedAt, setStopwatchRunStartedAt] = useState<number | null>(initialSession.stopwatchRunStartedAt);
  const [storedLaps, setStoredLaps] = useState<StopwatchLap[]>(initialSession.laps);
  const [, setTick] = useState(0);

  const timers = useMemo(
    () => timersForIncident(allTimers, scopeIncidentId),
    [allTimers, scopeIncidentId],
  );
  const otherScopeTimerCount = allTimers.length - timers.length;
  const hasStoredStopwatch = storedStopwatchStart !== null
    || storedStopwatchRunning
    || storedStopwatchElapsed > 0
    || storedLaps.length > 0;
  const stopwatchScopeBlocked = hasStoredStopwatch
    && storedStopwatchIncidentId !== scopeIncidentId;
  const stopwatchRunning = stopwatchScopeBlocked ? false : storedStopwatchRunning;
  const stopwatchStart = stopwatchScopeBlocked ? null : storedStopwatchStart;
  const stopwatchElapsed = stopwatchScopeBlocked ? 0 : storedStopwatchElapsed;
  const laps = stopwatchScopeBlocked ? [] : storedLaps;

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

  const timersRef = useRef(allTimers);
  useEffect(() => {
    timersRef.current = allTimers;
  }, [allTimers]);

  const timerPersistenceKey = useMemo(() => JSON.stringify(allTimers.map(timer => ({
    id: timer.id,
    incidentId: timer.incidentId,
    label: timer.label,
    totalSeconds: timer.totalSeconds,
    remaining: timer.isRunning ? null : timer.remaining,
    isRunning: timer.isRunning,
    startedAt: timer.startedAt?.getTime() ?? null,
    endsAt: timer.endsAt,
  }))), [allTimers]);

  useEffect(() => {
    saveTimerSession({
      timers: timersRef.current,
      stopwatchIncidentId: storedStopwatchIncidentId,
      stopwatchRunning: storedStopwatchRunning,
      stopwatchStart: storedStopwatchStart,
      stopwatchElapsed: stopwatchAccumulated,
      stopwatchRunStartedAt,
      laps: storedLaps,
    });
  }, [
    timerPersistenceKey,
    storedStopwatchIncidentId,
    storedStopwatchRunning,
    storedStopwatchStart,
    stopwatchAccumulated,
    stopwatchRunStartedAt,
    storedLaps,
  ]);

  const hasRunningTimer = allTimers.some(t => t.isRunning);

  useEffect(() => {
    const hasActive = hasRunningTimer || storedStopwatchRunning;

    if (hasActive) {
      requestWakeLock();

      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const deltaSec = Math.floor((now - lastTickRef.current) / 1000);

        if (deltaSec >= 1) {
          lastTickRef.current = now - ((now - lastTickRef.current) % 1000);

          setAllTimers(prev => prev.map(t => {
            if (!t.isRunning || t.remaining <= 0) return t;
            
            const oldRemaining = t.remaining;
            const newRemaining = t.endsAt
              ? Math.max(0, Math.ceil((t.endsAt - now) / 1000))
              : Math.max(0, oldRemaining - deltaSec);
            
            const dangerThreshold = Math.floor(t.totalSeconds * DANGER_THRESHOLD);
            const warnThreshold = Math.floor(t.totalSeconds * WARN_THRESHOLD);

            const belongsToVisibleScope = t.incidentId === scopeIncidentId;

            if (belongsToVisibleScope && newRemaining === 0 && oldRemaining > 0) {
              try { navigator.vibrate?.([500, 200, 500, 200, 500]); } catch { /* */ }
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🚨 타이머 종료', { body: `${t.label} 시간이 모두 경과되었습니다.` });
              }
            } else if (belongsToVisibleScope && newRemaining <= dangerThreshold && oldRemaining > dangerThreshold) {
              try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('⚠️ 위험 경고', { body: `${t.label} 남은 시간이 10% 이하입니다! 대피 혹은 교대를 준비하세요.` });
              }
            } else if (belongsToVisibleScope && newRemaining <= warnThreshold && oldRemaining > warnThreshold) {
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

          if (storedStopwatchRunning && stopwatchRunStartedAt !== null) {
            setStoredStopwatchElapsed(stopwatchAccumulated + Math.max(0, now - stopwatchRunStartedAt));
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
  }, [
    hasRunningTimer,
    storedStopwatchRunning,
    stopwatchAccumulated,
    stopwatchRunStartedAt,
    scopeIncidentId,
    requestWakeLock,
    releaseWakeLock,
  ]);

  const addTimer = (seconds: number, label: string) => {
    const timer: TimerState = {
      id: nextTimerId++,
      incidentId: scopeIncidentId,
      label,
      totalSeconds: seconds,
      remaining: seconds,
      isRunning: false,
      startedAt: null,
      endsAt: null,
    };
    setAllTimers(prev => [...prev, timer]);
  };

  const toggleTimer = (id: number) => {
    const now = Date.now();
    setAllTimers(prev => prev.map(t => {
      if (t.id !== id || t.incidentId !== scopeIncidentId) return t;
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
    setAllTimers(prev => prev.map(t =>
      t.id === id && t.incidentId === scopeIncidentId
        ? { ...t, remaining: t.totalSeconds, isRunning: false, startedAt: null, endsAt: null }
        : t
    ));
  };

  const removeTimer = (id: number) => {
    setAllTimers(prev => prev.filter(t =>
      t.id !== id || t.incidentId !== scopeIncidentId
    ));
  };

  const toggleStopwatch = () => {
    if (stopwatchScopeBlocked) return;

    const now = Date.now();
    if (!storedStopwatchRunning) {
      const start = storedStopwatchStart || new Date(now);
      if (!storedStopwatchStart) {
        setStoredStopwatchIncidentId(scopeIncidentId);
        setStoredStopwatchStart(start);
        setStoredLaps([{ label: '출동', time: start, elapsed: 0 }]);
        setStopwatchAccumulated(0);
        setStoredStopwatchElapsed(0);
      }
      setStopwatchRunStartedAt(now);
      setStoredStopwatchRunning(true);
    } else {
      const elapsed = stopwatchAccumulated + (stopwatchRunStartedAt === null ? 0 : Math.max(0, now - stopwatchRunStartedAt));
      setStopwatchAccumulated(elapsed);
      setStoredStopwatchElapsed(elapsed);
      setStopwatchRunStartedAt(null);
      setStoredStopwatchRunning(false);
    }
  };

  const addLap = (label: string) => {
    if (stopwatchScopeBlocked || !storedStopwatchStart) return;
    setStoredLaps(prev => [...prev, {
      label,
      time: new Date(),
      elapsed: storedStopwatchElapsed,
    }]);
  };

  const resetStopwatch = () => {
    if (stopwatchScopeBlocked) return;
    setStoredStopwatchIncidentId(null);
    setStoredStopwatchRunning(false);
    setStoredStopwatchStart(null);
    setStoredStopwatchElapsed(0);
    setStopwatchAccumulated(0);
    setStopwatchRunStartedAt(null);
    setStoredLaps([]);
  };

  const clearIncidentScope = (incidentId: string) => {
    const targetIncidentId = incidentId.trim().slice(0, 80);
    if (!targetIncidentId) return;

    setAllTimers(prev => prev.filter(timer => timer.incidentId !== targetIncidentId));
    if (storedStopwatchIncidentId !== targetIncidentId) return;

    setStoredStopwatchIncidentId(null);
    setStoredStopwatchRunning(false);
    setStoredStopwatchStart(null);
    setStoredStopwatchElapsed(0);
    setStopwatchAccumulated(0);
    setStopwatchRunStartedAt(null);
    setStoredLaps([]);
  };

  return (
    <TimerContext.Provider value={{
      timers, allTimers, otherScopeTimerCount,
      stopwatchIncidentId: storedStopwatchIncidentId,
      stopwatchScopeBlocked,
      stopwatchRunning, stopwatchStart, stopwatchElapsed, laps,
      addTimer, toggleTimer, resetTimer, removeTimer,
      toggleStopwatch, addLap, resetStopwatch, clearIncidentScope,
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
