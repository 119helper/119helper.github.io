import { loadStoredJson, saveStoredJson } from './privacySettings';

export const TIMER_SESSION_KEY = '119helper-timer-session';

export interface TimerState {
  id: number;
  label: string;
  totalSeconds: number;
  remaining: number;
  isRunning: boolean;
  startedAt: Date | null;
  endsAt: number | null;
}

export interface StopwatchLap {
  label: string;
  time: Date;
  elapsed: number;
}

export interface TimerSessionSnapshot {
  timers: TimerState[];
  stopwatchRunning: boolean;
  stopwatchStart: Date | null;
  stopwatchElapsed: number;
  stopwatchRunStartedAt: number | null;
  laps: StopwatchLap[];
}

const EMPTY_SESSION: TimerSessionSnapshot = {
  timers: [],
  stopwatchRunning: false,
  stopwatchStart: null,
  stopwatchElapsed: 0,
  stopwatchRunStartedAt: null,
  laps: [],
};

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function restoreTimerSession(value: unknown, now = Date.now()): TimerSessionSnapshot {
  if (!value || typeof value !== 'object') return EMPTY_SESSION;
  const raw = value as Record<string, unknown>;

  const timers = Array.isArray(raw.timers)
    ? raw.timers.flatMap((entry): TimerState[] => {
        if (!entry || typeof entry !== 'object') return [];
        const timer = entry as Record<string, unknown>;
        const id = finiteNumber(timer.id, -1);
        const totalSeconds = Math.floor(finiteNumber(timer.totalSeconds));
        if (id < 0 || totalSeconds <= 0 || typeof timer.label !== 'string') return [];

        const storedRemaining = Math.min(totalSeconds, Math.max(0, Math.ceil(finiteNumber(timer.remaining, totalSeconds))));
        const storedEndsAt = finiteNumber(timer.endsAt, 0);
        const wasRunning = timer.isRunning === true && storedEndsAt > 0;
        const remaining = wasRunning
          ? Math.min(totalSeconds, Math.max(0, Math.ceil((storedEndsAt - now) / 1000)))
          : storedRemaining;

        return [{
          id,
          label: timer.label.slice(0, 80),
          totalSeconds,
          remaining,
          isRunning: wasRunning && remaining > 0,
          startedAt: parseDate(timer.startedAt),
          endsAt: wasRunning && remaining > 0 ? storedEndsAt : null,
        }];
      })
    : [];

  const stopwatchStart = parseDate(raw.stopwatchStart);
  const storedElapsed = Math.max(0, finiteNumber(raw.stopwatchElapsed));
  const storedRunStartedAt = finiteNumber(raw.stopwatchRunStartedAt, 0);
  const stopwatchRunning = raw.stopwatchRunning === true && stopwatchStart !== null && storedRunStartedAt > 0;
  const stopwatchElapsed = stopwatchRunning
    ? storedElapsed + Math.max(0, now - storedRunStartedAt)
    : storedElapsed;

  const laps = Array.isArray(raw.laps)
    ? raw.laps.flatMap((entry): StopwatchLap[] => {
        if (!entry || typeof entry !== 'object') return [];
        const lap = entry as Record<string, unknown>;
        const time = parseDate(lap.time);
        if (!time || typeof lap.label !== 'string') return [];
        return [{
          label: lap.label.slice(0, 80),
          time,
          elapsed: Math.max(0, finiteNumber(lap.elapsed)),
        }];
      })
    : [];

  return {
    timers,
    stopwatchRunning,
    stopwatchStart,
    stopwatchElapsed,
    stopwatchRunStartedAt: stopwatchRunning ? now : null,
    laps,
  };
}

export function loadTimerSession(now = Date.now()): TimerSessionSnapshot {
  const stored = loadStoredJson<unknown>(TIMER_SESSION_KEY, null);
  return restoreTimerSession(stored, now);
}

export function saveTimerSession(session: TimerSessionSnapshot): void {
  saveStoredJson(TIMER_SESSION_KEY, {
    version: 1,
    timers: session.timers.map(timer => ({
      ...timer,
      startedAt: timer.startedAt?.toISOString() ?? null,
    })),
    stopwatchRunning: session.stopwatchRunning,
    stopwatchStart: session.stopwatchStart?.toISOString() ?? null,
    stopwatchElapsed: session.stopwatchElapsed,
    stopwatchRunStartedAt: session.stopwatchRunStartedAt,
    laps: session.laps.map(lap => ({
      ...lap,
      time: lap.time.toISOString(),
    })),
  });
}
