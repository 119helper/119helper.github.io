// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncidentChangeAlert } from '../contexts/IncidentChangeMonitorContext';
import IncidentChangeGlobalBanner from './IncidentChangeGlobalBanner';

const mocks = vi.hoisted(() => ({
  alerts: [] as unknown[],
}));

vi.mock('../contexts/IncidentChangeMonitorContext', () => ({
  useIncidentChangeMonitor: () => ({
    alerts: mocks.alerts,
  }),
}));

function alert(
  alertId: string,
  severity: 'warning' | 'critical',
): IncidentChangeAlert {
  return {
    alertId,
    dedupeKey: `dedupe-${alertId}`,
    kind: 'road',
    type: 'road-control-activated',
    severity,
    title: '새 도로 재난·통제',
    message: '진입 경로를 다시 확인하세요.',
    detectedAt: 1_000,
    before: { observedAt: 900, values: { present: false } },
    after: { observedAt: 1_000, values: { present: true } },
    source: {
      dataset: 'road',
      previous: { provider: 'ITS', retrievedAt: 900, staleAt: null },
      current: { provider: 'ITS', retrievedAt: 1_000, staleAt: null },
    },
  };
}

beforeEach(() => {
  mocks.alerts = [];
});

afterEach(cleanup);

describe('IncidentChangeGlobalBanner', () => {
  it('stays hidden without an active incident, without alerts, or on the incident tab', () => {
    const onNavigate = vi.fn();
    const view = render(
      <IncidentChangeGlobalBanner
        incidentActive={false}
        activeTab="dashboard"
        onNavigate={onNavigate}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    mocks.alerts = [alert('warning-1', 'warning')];
    view.rerender(
      <IncidentChangeGlobalBanner
        incidentActive
        activeTab="incident"
        onNavigate={onNavigate}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('announces compact counts and opens the incident tab from anywhere else', () => {
    mocks.alerts = [
      alert('critical-1', 'critical'),
      alert('critical-2', 'critical'),
      alert('warning-1', 'warning'),
    ];
    const onNavigate = vi.fn();
    render(
      <IncidentChangeGlobalBanner
        incidentActive
        activeTab="er"
        onNavigate={onNavigate}
      />,
    );

    const button = screen.getByRole('button', {
      name: '현장 변화 3건, 긴급 2건. 출동 상황판에서 확인',
    });
    expect(button).toHaveClass('min-w-0');
    expect(screen.getByText('현장 변화 3건')).toBeInTheDocument();
    expect(screen.getByText('긴급 2건')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith('incident');
  });
});
