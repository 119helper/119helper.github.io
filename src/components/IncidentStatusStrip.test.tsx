// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncidentSession } from '../services/incidentSession';
import { isIncidentSessionStale, STALE_INCIDENT_MS } from '../utils/incidentStale';
import IncidentStatusStrip from './IncidentStatusStrip';

vi.mock('../contexts/TimerContext', () => ({
  useTimer: () => ({
    timers: [],
    formatTime: (seconds: number) => String(seconds),
  }),
}));

vi.mock('../hooks/useActivitySession', () => ({
  useActivitySession: () => [{ stamps: [] }],
}));

vi.mock('./ActivityStageEditorDialog', () => ({
  default: () => null,
}));

afterEach(() => cleanup());

function createSession(overrides: Partial<IncidentSession> = {}): IncidentSession {
  return {
    incidentId: 'incident-stale-test',
    active: true,
    type: 'fire',
    title: '테스트 출동',
    address: '서울특별시 종로구',
    startedAt: Date.now() - STALE_INCIDENT_MS - 60_000,
    note: '',
    ...overrides,
  };
}

describe('incident status stale recovery', () => {
  it('flags an active incident only after the recovery threshold', () => {
    const session = createSession({ startedAt: 1_000 });
    expect(isIncidentSessionStale(session, session.startedAt + STALE_INCIDENT_MS - 1)).toBe(false);
    expect(isIncidentSessionStale(session, session.startedAt + STALE_INCIDENT_MS)).toBe(true);
  });

  it('never flags a closed incident', () => {
    const session = createSession({ active: false, startedAt: 1_000 });
    expect(isIncidentSessionStale(session, session.startedAt + STALE_INCIDENT_MS)).toBe(false);
  });

  it('keeps non-incident pages compact and offers explicit stale-session recovery', () => {
    const onRequestCloseReview = vi.fn();
    render(
      <IncidentStatusStrip
        session={createSession()}
        activeTab="manual"
        onNavigate={vi.fn()}
        onRequestCloseReview={onRequestCloseReview}
        fieldModeActive={false}
        onFieldModeChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('화재 출동 활동 빠른 기록')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('12시간 이상 진행 중인 출동입니다.');

    fireEvent.click(screen.getByRole('button', { name: '빠른 기록 펼치기' }));
    expect(screen.getByLabelText('화재 출동 활동 빠른 기록')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '종료 점검' }));
    expect(onRequestCloseReview).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '계속 진행' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
