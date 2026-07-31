// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncidentSession } from '../services/incidentSession';
import type { TimerSessionSnapshot, TimerState } from '../services/timerPersistence';
import { TimerProvider, useTimer } from './TimerContext';

const mocks = vi.hoisted(() => ({
  incidentSession: {
    incidentId: 'incident-a',
    active: true,
    type: 'fire',
    title: 'A 출동',
    address: '',
    startedAt: 1,
    note: '',
  } as IncidentSession,
  loadedSession: null as TimerSessionSnapshot | null,
  saveTimerSession: vi.fn(),
}));

vi.mock('../hooks/useIncidentSession', () => ({
  useIncidentSession: () => [mocks.incidentSession, vi.fn()],
}));

vi.mock('../services/timerPersistence', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/timerPersistence')>();
  return {
    ...actual,
    loadTimerSession: () => mocks.loadedSession,
    saveTimerSession: mocks.saveTimerSession,
  };
});

function timer(id: number, incidentId: string | null): TimerState {
  return {
    id,
    incidentId,
    label: `타이머 ${id}`,
    totalSeconds: 300,
    remaining: 300,
    isRunning: false,
    startedAt: null,
    endsAt: null,
  };
}

function session(overrides: Partial<TimerSessionSnapshot> = {}): TimerSessionSnapshot {
  return {
    timers: [],
    stopwatchIncidentId: null,
    stopwatchRunning: false,
    stopwatchStart: null,
    stopwatchElapsed: 0,
    stopwatchRunStartedAt: null,
    laps: [],
    ...overrides,
  };
}

function Probe() {
  const context = useTimer();
  return (
    <div>
      <output data-testid="visible-timers">
        {JSON.stringify(context.timers.map(item => [item.id, item.incidentId]))}
      </output>
      <output data-testid="all-timers">
        {JSON.stringify(context.allTimers.map(item => [item.id, item.incidentId]))}
      </output>
      <output data-testid="other-count">{context.otherScopeTimerCount}</output>
      <output data-testid="stopwatch-blocked">{String(context.stopwatchScopeBlocked)}</output>
      <output data-testid="stopwatch-start">
        {context.stopwatchStart?.toISOString() ?? 'none'}
      </output>
      <output data-testid="stopwatch-elapsed">{context.stopwatchElapsed}</output>
      <button type="button" onClick={() => context.addTimer(60, '추가')}>
        타이머 추가
      </button>
      <button type="button" onClick={context.toggleStopwatch}>
        스톱워치 전환
      </button>
      <button type="button" onClick={() => context.clearIncidentScope('incident-a')}>
        A 범위 삭제
      </button>
    </div>
  );
}

beforeEach(() => {
  mocks.incidentSession = {
    incidentId: 'incident-a',
    active: true,
    type: 'fire',
    title: 'A 출동',
    address: '',
    startedAt: 1,
    note: '',
  };
  mocks.loadedSession = session();
  mocks.saveTimerSession.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('TimerProvider incident scope', () => {
  it('현재 출동 타이머만 노출하고 추가 타이머에 현재 incidentId를 태그한다', () => {
    mocks.loadedSession = session({
      timers: [timer(1, 'incident-a'), timer(2, 'incident-b'), timer(3, null)],
    });
    render(<TimerProvider><Probe /></TimerProvider>);

    expect(screen.getByTestId('visible-timers')).toHaveTextContent(
      JSON.stringify([[1, 'incident-a']]),
    );
    expect(screen.getByTestId('all-timers')).toHaveTextContent(
      JSON.stringify([[1, 'incident-a'], [2, 'incident-b'], [3, null]]),
    );
    expect(screen.getByTestId('other-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: '타이머 추가' }));

    expect(screen.getByTestId('visible-timers')).toHaveTextContent(
      JSON.stringify([[1, 'incident-a'], [4, 'incident-a']]),
    );
    expect(screen.getByTestId('all-timers')).toHaveTextContent(
      JSON.stringify([
        [1, 'incident-a'],
        [2, 'incident-b'],
        [3, null],
        [4, 'incident-a'],
      ]),
    );
  });

  it('출동이 바뀌어도 다른 범위 타이머를 보존한다', () => {
    mocks.loadedSession = session({
      timers: [timer(1, 'incident-a'), timer(2, 'incident-b')],
    });
    const view = render(<TimerProvider><Probe /></TimerProvider>);

    mocks.incidentSession = {
      ...mocks.incidentSession,
      incidentId: 'incident-b',
      title: 'B 출동',
    };
    view.rerender(<TimerProvider><Probe /></TimerProvider>);

    expect(screen.getByTestId('visible-timers')).toHaveTextContent(
      JSON.stringify([[2, 'incident-b']]),
    );
    expect(screen.getByTestId('all-timers')).toHaveTextContent(
      JSON.stringify([[1, 'incident-a'], [2, 'incident-b']]),
    );
  });

  it('다른 출동의 stopwatch를 숨기고 조작을 차단한 뒤 해당 범위에서만 복원한다', () => {
    const start = new Date('2026-07-31T00:00:00.000Z');
    mocks.loadedSession = session({
      stopwatchIncidentId: 'incident-b',
      stopwatchStart: start,
      stopwatchElapsed: 12_000,
      laps: [{ label: '출동', time: start, elapsed: 0 }],
    });
    const view = render(<TimerProvider><Probe /></TimerProvider>);

    expect(screen.getByTestId('stopwatch-blocked')).toHaveTextContent('true');
    expect(screen.getByTestId('stopwatch-start')).toHaveTextContent('none');
    expect(screen.getByTestId('stopwatch-elapsed')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: '스톱워치 전환' }));
    expect(screen.getByTestId('stopwatch-blocked')).toHaveTextContent('true');
    expect(screen.getByTestId('stopwatch-start')).toHaveTextContent('none');

    mocks.incidentSession = {
      ...mocks.incidentSession,
      incidentId: 'incident-b',
      title: 'B 출동',
    };
    view.rerender(<TimerProvider><Probe /></TimerProvider>);

    expect(screen.getByTestId('stopwatch-blocked')).toHaveTextContent('false');
    expect(screen.getByTestId('stopwatch-start')).toHaveTextContent(start.toISOString());
    expect(screen.getByTestId('stopwatch-elapsed')).toHaveTextContent('12000');
  });

  it('clearIncidentScope는 지정 출동의 timer와 stopwatch만 제거한다', () => {
    const start = new Date('2026-07-31T00:00:00.000Z');
    mocks.loadedSession = session({
      timers: [timer(1, 'incident-a'), timer(2, 'incident-b')],
      stopwatchIncidentId: 'incident-a',
      stopwatchStart: start,
      stopwatchElapsed: 5_000,
      laps: [{ label: '출동', time: start, elapsed: 0 }],
    });
    render(<TimerProvider><Probe /></TimerProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'A 범위 삭제' }));

    expect(screen.getByTestId('visible-timers')).toHaveTextContent('[]');
    expect(screen.getByTestId('all-timers')).toHaveTextContent(
      JSON.stringify([[2, 'incident-b']]),
    );
    expect(screen.getByTestId('stopwatch-blocked')).toHaveTextContent('false');
    expect(screen.getByTestId('stopwatch-start')).toHaveTextContent('none');
  });
});
