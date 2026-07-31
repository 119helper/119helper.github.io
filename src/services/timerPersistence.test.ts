// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  restoreTimerSession,
  saveTimerSession,
  TIMER_SESSION_KEY,
  timersForIncident,
  type TimerState,
} from './timerPersistence';

beforeEach(() => {
  localStorage.clear();
});

describe('restoreTimerSession', () => {
  it('실행 중인 타이머를 절대 종료 시각 기준으로 복구한다', () => {
    const now = 1_000_000;
    const result = restoreTimerSession({
      timers: [{
        id: 3,
        incidentId: 'incident-a',
        label: '공기호흡기',
        totalSeconds: 1800,
        remaining: 1800,
        isRunning: true,
        startedAt: new Date(now - 10_000).toISOString(),
        endsAt: now + 25_000,
      }],
    }, now);

    expect(result.timers[0]).toMatchObject({
      id: 3,
      incidentId: 'incident-a',
      remaining: 25,
      isRunning: true,
      endsAt: now + 25_000,
    });
    expect(result.timers[0].startedAt).toBeInstanceOf(Date);
  });

  it('종료 시각이 지난 타이머는 종료 상태로 복구한다', () => {
    const result = restoreTimerSession({
      timers: [{
        id: 1,
        label: '교대',
        totalSeconds: 900,
        remaining: 300,
        isRunning: true,
        startedAt: '2026-07-13T00:00:00.000Z',
        endsAt: 5_000,
      }],
    }, 10_000);

    expect(result.timers[0]).toMatchObject({ remaining: 0, isRunning: false, endsAt: null });
  });

  it('실행 중인 스톱워치 경과 시간과 랩 날짜를 복구한다', () => {
    const result = restoreTimerSession({
      stopwatchIncidentId: 'incident-stopwatch',
      stopwatchRunning: true,
      stopwatchStart: '2026-07-13T00:00:00.000Z',
      stopwatchElapsed: 4_000,
      stopwatchRunStartedAt: 10_000,
      laps: [{ label: '현장 도착', time: '2026-07-13T00:10:00.000Z', elapsed: 600_000 }],
    }, 16_000);

    expect(result.stopwatchRunning).toBe(true);
    expect(result.stopwatchIncidentId).toBe('incident-stopwatch');
    expect(result.stopwatchElapsed).toBe(10_000);
    expect(result.stopwatchRunStartedAt).toBe(16_000);
    expect(result.laps[0].time).toBeInstanceOf(Date);
  });

  it('legacy timer와 stopwatch는 현재 출동으로 추측하지 않고 미배정 범위로 격리한다', () => {
    const result = restoreTimerSession({
      version: 1,
      timers: [{
        id: 7,
        label: '기존 타이머',
        totalSeconds: 60,
        remaining: 30,
        isRunning: false,
      }],
      stopwatchStart: '2026-07-13T00:00:00.000Z',
      stopwatchElapsed: 5_000,
      laps: [],
    });

    expect(result.timers[0].incidentId).toBeNull();
    expect(result.stopwatchIncidentId).toBeNull();
    expect(timersForIncident(result.timers, 'incident-new')).toEqual([]);
    expect(timersForIncident(result.timers, null)).toHaveLength(1);
  });

  it('출동 ID를 정규화하고 다른 출동 범위를 정확히 분리한다', () => {
    const result = restoreTimerSession({
      timers: [
        {
          id: 1,
          incidentId: ' incident-a ',
          label: 'A',
          totalSeconds: 60,
          remaining: 60,
          isRunning: false,
        },
        {
          id: 2,
          incidentId: 'incident-b',
          label: 'B',
          totalSeconds: 60,
          remaining: 60,
          isRunning: false,
        },
      ],
    });

    expect(timersForIncident(result.timers, 'incident-a').map(timer => timer.id)).toEqual([1]);
    expect(timersForIncident(result.timers, 'incident-b').map(timer => timer.id)).toEqual([2]);
  });

  it('v2 포맷에 timer와 stopwatch의 출동 ID를 함께 저장한다', () => {
    const timer: TimerState = {
      id: 9,
      incidentId: 'incident-save',
      label: '저장 확인',
      totalSeconds: 120,
      remaining: 90,
      isRunning: false,
      startedAt: new Date('2026-07-13T00:00:00.000Z'),
      endsAt: null,
    };

    saveTimerSession({
      timers: [timer],
      stopwatchIncidentId: 'incident-save',
      stopwatchRunning: false,
      stopwatchStart: new Date('2026-07-13T00:01:00.000Z'),
      stopwatchElapsed: 10_000,
      stopwatchRunStartedAt: null,
      laps: [{
        label: '현장 도착',
        time: new Date('2026-07-13T00:02:00.000Z'),
        elapsed: 10_000,
      }],
    });

    const stored = JSON.parse(localStorage.getItem(TIMER_SESSION_KEY) ?? '{}');
    expect(stored).toMatchObject({
      version: 2,
      stopwatchIncidentId: 'incident-save',
      timers: [{ id: 9, incidentId: 'incident-save' }],
    });
  });
});
