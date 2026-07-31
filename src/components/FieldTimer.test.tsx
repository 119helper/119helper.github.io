// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldTimer from './FieldTimer';

const mocks = vi.hoisted(() => ({
  incident: {
    incidentId: '',
    active: false,
    type: 'fire',
    title: '',
    address: '',
    startedAt: 0,
    note: '',
  },
  timer: {
    timers: [],
    otherScopeTimerCount: 0,
    stopwatchRunning: false,
    stopwatchStart: null as Date | null,
    stopwatchElapsed: 0,
    stopwatchScopeBlocked: false,
    laps: [] as Array<{ label: string; time: Date; elapsed: number }>,
    addTimer: vi.fn(),
    toggleTimer: vi.fn(),
    resetTimer: vi.fn(),
    removeTimer: vi.fn(),
    toggleStopwatch: vi.fn(),
    addLap: vi.fn(),
    resetStopwatch: vi.fn(),
    formatTime: (seconds: number) => `00:${String(seconds).padStart(2, '0')}`,
    formatTimeMs: () => '00:00',
    WARN_THRESHOLD: 0.33,
    DANGER_THRESHOLD: 0.1,
  },
}));

vi.mock('../hooks/useIncidentSession', () => ({
  useIncidentSession: () => [mocks.incident, vi.fn()],
}));

vi.mock('../contexts/TimerContext', () => ({
  useTimer: () => mocks.timer,
}));

vi.mock('../contexts/FeedbackContext', () => ({
  useAppFeedback: () => ({ showNotice: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.incident.incidentId = '';
  mocks.incident.active = false;
  mocks.incident.startedAt = 0;
  mocks.timer.stopwatchStart = null;
  mocks.timer.laps = [];
});

afterEach(cleanup);

describe('FieldTimer activity stopwatch', () => {
  it('keeps the standalone tool wording when no incident is active', () => {
    render(<FieldTimer />);

    expect(screen.getByRole('heading', { name: '별도 활동 스톱워치' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '활동 시작' })).toBeInTheDocument();
    expect(screen.queryByText(/출동 상황판이 기준/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '출동 시작' })).not.toBeInTheDocument();
  });

  it('explains that an active incident uses the incident board elapsed time', () => {
    mocks.incident.incidentId = 'incident-1';
    mocks.incident.active = true;
    mocks.incident.startedAt = Date.now();

    render(<FieldTimer />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '진행 중 사건의 경과 시간은 출동 상황판이 기준입니다.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '사건 전체 시간이 아닌 별도 활동 구간만 기록합니다.',
    );
    fireEvent.click(screen.getByRole('button', { name: '활동 시작' }));
    expect(mocks.timer.toggleStopwatch).toHaveBeenCalledOnce();
  });

  it('preserves breathing apparatus and rotation timer presets', () => {
    render(<FieldTimer />);

    expect(screen.getByRole('button', { name: /30분.*공기호흡기 참고값/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /15분.*교대 알림/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /30분.*공기호흡기 참고값/ }));
    expect(mocks.timer.addTimer).toHaveBeenCalledWith(30 * 60, '30분');
  });

  it('renames the legacy first stopwatch lap as an activity start', () => {
    mocks.timer.stopwatchStart = new Date('2026-07-31T05:00:00Z');
    mocks.timer.laps = [{
      label: '출동',
      time: new Date('2026-07-31T05:00:00Z'),
      elapsed: 0,
    }];

    render(<FieldTimer />);

    expect(screen.getByText('활동 시작')).toBeInTheDocument();
    expect(screen.queryByText('출동')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '활동 스톱워치 초기화' })).toBeInTheDocument();
  });
});
