// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION, type IncidentSession } from '../services/incidentSession';
import DashboardIncidentCard from './DashboardIncidentCard';

describe('DashboardIncidentCard', () => {
  it('opens the response workspace without replacing the routine dashboard', () => {
    const onOpen = vi.fn();
    render(
      <DashboardIncidentCard
        session={EMPTY_INCIDENT_SESSION}
        routineCityLabel="서울"
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole('heading', {
      name: '현장 대응이 필요할 때 한 번에 전환',
    })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '출동 대응 열기' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('summarizes an active incident and its committed actions', () => {
    const session: IncidentSession = {
      ...EMPTY_INCIDENT_SESSION,
      incidentId: 'incident-1',
      active: true,
      title: '○○동 상가 화재',
      address: '광주광역시 북구 테스트로 119',
      startedAt: Date.now() - 60_000,
      selections: {
        fireWater: {
          id: 'water-1',
          selectedAt: Date.now() - 30_000,
          type: '소화전',
          address: '광주광역시 북구 테스트로 120',
          status: '정상',
          sourceDate: '2026-07-01',
        },
      },
    };

    render(
      <DashboardIncidentCard
        session={session}
        routineCityLabel="광주"
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: '○○동 상가 화재' })).toBeVisible();
    expect(screen.getByText('선택한 조치 1건')).toBeVisible();
    expect(screen.getByText('아래 정보는 광주 관심 지역 기준')).toBeVisible();
    expect(screen.getByRole('button', { name: '상황판 계속하기' })).toBeVisible();
  });
});
