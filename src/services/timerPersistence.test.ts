import { describe, expect, it } from 'vitest';
import { restoreTimerSession } from './timerPersistence';

describe('restoreTimerSession', () => {
  it('실행 중인 타이머를 절대 종료 시각 기준으로 복구한다', () => {
    const now = 1_000_000;
    const result = restoreTimerSession({
      timers: [{
        id: 3,
        label: '공기호흡기',
        totalSeconds: 1800,
        remaining: 1800,
        isRunning: true,
        startedAt: new Date(now - 10_000).toISOString(),
        endsAt: now + 25_000,
      }],
    }, now);

    expect(result.timers[0]).toMatchObject({ id: 3, remaining: 25, isRunning: true, endsAt: now + 25_000 });
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
      stopwatchRunning: true,
      stopwatchStart: '2026-07-13T00:00:00.000Z',
      stopwatchElapsed: 4_000,
      stopwatchRunStartedAt: 10_000,
      laps: [{ label: '현장 도착', time: '2026-07-13T00:10:00.000Z', elapsed: 600_000 }],
    }, 16_000);

    expect(result.stopwatchRunning).toBe(true);
    expect(result.stopwatchElapsed).toBe(10_000);
    expect(result.stopwatchRunStartedAt).toBe(16_000);
    expect(result.laps[0].time).toBeInstanceOf(Date);
  });
});
