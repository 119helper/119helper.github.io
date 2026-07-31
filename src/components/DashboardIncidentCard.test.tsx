// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION, type IncidentSession } from '../services/incidentSession';
import DashboardIncidentCard from './DashboardIncidentCard';

describe('DashboardIncidentCard', () => {
  it('renders an idle response entry as a compact supporting row', () => {
    const onOpen = vi.fn();
    const view = render(
      <DashboardIncidentCard
        session={EMPTY_INCIDENT_SESSION}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole('region', { name: '출동 대응 바로가기' })).toBeVisible();
    expect(screen.getByRole('heading', {
      name: '출동이 생기면 전용 상황판으로 전환',
    })).toBeVisible();
    expect(view.container.querySelector('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '출동 대응 열기' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows a recent closed incident without turning it into a dashboard hero', () => {
    const session: IncidentSession = {
      ...EMPTY_INCIDENT_SESSION,
      incidentId: 'incident-1',
      active: false,
      title: '○○동 상가 화재',
      address: '광주광역시 북구 테스트로 119',
      startedAt: 10_000,
      endedAt: 70_000,
    };
    const onOpen = vi.fn();

    render(
      <DashboardIncidentCard
        session={session}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole('heading', { name: '최근 종료 · ○○동 상가 화재' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '최근 출동 확인' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('does not duplicate the global status strip for an active incident', () => {
    const session: IncidentSession = {
      ...EMPTY_INCIDENT_SESSION,
      incidentId: 'incident-active',
      active: true,
      title: '진행 중인 화재',
      startedAt: Date.now() - 60_000,
    };

    const view = render(
      <DashboardIncidentCard
        session={session}
        onOpen={() => undefined}
      />,
    );

    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /상황판/ })).not.toBeInTheDocument();
  });
});
