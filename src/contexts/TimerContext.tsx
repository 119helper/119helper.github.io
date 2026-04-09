import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

const WARN_THRESHOLD = 0.33;
const DANGER_THRESHOLD = 0.1;

export interface TimerState {
  id: number;
  label: string;
  totalSeconds: number;
  remaining: number;
  isRunning: boolean;
  startedAt: Date | null;
}

export interface StopwatchLap {
  label: string;
  time: Date;
  elapsed: number;
}

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
  const [timers, setTimers] = useState<TimerState[]>([]);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchStart, setStopwatchStart] = useState<Date | null>(null);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [laps, setLaps] = useState<StopwatchLap[]>([]);
  const [, setTick] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

  const stopwatchStartRef = useRef(stopwatchStart);
  stopwatchStartRef.current = stopwatchStart;

  const hasRunningTimer = timers.some(t => t.isRunning);

  useEffect(() => {
    const hasActive = hasRunningTimer || stopwatchRunning;

    if (hasActive) {
      requestWakeLock();
      
      // 알림 권한 요청
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      intervalRef.current = setInterval(() => {
        setTimers(prev => prev.map(t => {
          if (!t.isRunning || t.remaining <= 0) return t;
          const newRemaining = t.remaining - 1;

          if (newRemaining === 0) {
            try { navigator.vibrate?.([500, 200, 500, 200, 500]); } catch { /* */ }
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🚨 타이머 종료', { body: `${t.label} 시간이 모두 경과되었습니다.` });
            }
          } else if (newRemaining === Math.floor(t.totalSeconds * DANGER_THRESHOLD)) {
            try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('⚠️ 위험 경고', { body: `${t.label} 남은 시간이 10% 이하입니다! 대피 혹은 교대를 준비하세요.` });
            }
          } else if (newRemaining === Math.floor(t.totalSeconds * WARN_THRESHOLD)) {
            try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('📢 교대 경고', { body: `${t.label} 1/3 남았습니다.` });
            }
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
  };

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
