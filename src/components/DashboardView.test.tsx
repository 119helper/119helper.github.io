// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION, type IncidentSession } from '../services/incidentSession';
import DashboardView from './DashboardView';

const apiMocks = vi.hoisted(() => ({
  getRealtimeAirQuality: vi.fn(),
  getERRealTimeBeds: vi.fn(),
  getUltraShortNow: vi.fn(),
}));

const routineMocks = vi.hoisted(() => ({
  loadRoutineBriefing: vi.fn(),
}));

vi.mock('../services/airQualityApi', () => ({
  getRealtimeAirQuality: (...args: unknown[]) => apiMocks.getRealtimeAirQuality(...args),
}));

vi.mock('../services/erApi', () => ({
  CITY_TO_SIDO: { seoul: '서울특별시' },
  getERRealTimeBeds: (...args: unknown[]) => apiMocks.getERRealTimeBeds(...args),
}));

vi.mock('../services/weatherApi', () => ({
  CITY_GRIDS: { seoul: { nx: 60, ny: 127 } },
  getUltraShortNow: (...args: unknown[]) => apiMocks.getUltraShortNow(...args),
  parseCurrentWeather: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  getStaleAt: () => null,
}));

vi.mock('../services/routineBriefing', () => ({
  loadRoutineBriefing: (...args: unknown[]) => routineMocks.loadRoutineBriefing(...args),
}));

vi.mock('../services/privacySettings', () => ({
  loadStoredJson: (_key: string, fallback: unknown) => fallback,
}));

vi.mock('./WeatherAlertBanner', () => ({
  default: () => <div data-testid="weather-alert-banner" />,
}));

vi.mock('./StickyNotes', () => ({
  default: ({ onCountChange }: { onCountChange?: (count: number) => void }) => (
    <div data-testid="sticky-notes">
      <button type="button" onClick={() => onCountChange?.(1)}>테스트 메모 추가</button>
    </div>
  ),
}));

vi.mock('./WildfireTicker', () => ({
  WildfireTicker: () => <div data-testid="wildfire-ticker" />,
}));

vi.mock('./WindCompass', () => ({
  WindCompass: () => <div data-testid="wind-compass" />,
}));

function pendingRequest(): Promise<never> {
  return new Promise(() => undefined);
}

function renderDashboard(session: IncidentSession = EMPTY_INCIDENT_SESSION) {
  const onNavigate = vi.fn();
  render(
    <DashboardView
      onNavigate={onNavigate}
      city="seoul"
      fireFacilities={[]}
      isLoadingFacilities={false}
      cityIndex={null}
      incidentSession={session}
    />,
  );
  return onNavigate;
}

describe('DashboardView routine-first layout', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.getRealtimeAirQuality.mockImplementation(pendingRequest);
    apiMocks.getERRealTimeBeds.mockImplementation(pendingRequest);
    apiMocks.getUltraShortNow.mockImplementation(pendingRequest);
    routineMocks.loadRoutineBriefing.mockReturnValue({
      todayScheduleCount: 0,
      todayScheduleTitle: null,
      noteCount: 0,
      prePlanCount: 0,
      recentPrePlanName: null,
      checklistChecked: 0,
      checklistTotal: 13,
      checklistProgress: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('places routine work shortcuts before the supporting incident entry', () => {
    const onNavigate = renderDashboard();
    const routine = screen.getByRole('region', { name: '오늘 업무 브리핑' });
    const incident = screen.getByRole('region', { name: '출동 대응 바로가기' });

    expect(routine.compareDocumentPosition(incident) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);

    fireEvent.click(within(routine).getByRole('button', { name: '일정관리 열기' }));
    fireEvent.click(within(routine).getByRole('button', { name: '장비점검 열기' }));
    fireEvent.click(within(routine).getByRole('button', { name: '대상물 정보 열기' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'calendar');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'checklist');
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'preplan');
  });

  it('shows a compact saved-state briefing without exposing detailed routine data', () => {
    routineMocks.loadRoutineBriefing.mockReturnValue({
      todayScheduleCount: 2,
      todayScheduleTitle: '월간 장비 점검',
      noteCount: 3,
      prePlanCount: 4,
      recentPrePlanName: '광주청사',
      checklistChecked: 6,
      checklistTotal: 13,
      checklistProgress: 46,
    });

    renderDashboard();
    const routine = screen.getByRole('region', { name: '오늘 업무 브리핑' });

    expect(within(routine).getByText('월간 장비 점검')).toBeVisible();
    expect(within(routine).getByText('오늘 2건 · 외 1건')).toBeVisible();
    expect(within(routine).getByText('6/13 완료')).toBeVisible();
    expect(within(routine).getByText('점검 46%')).toBeVisible();
    expect(within(routine).getByText('광주청사')).toBeVisible();
    expect(within(routine).getByText('저장 4곳 · 최근 수정')).toBeVisible();
    expect(within(routine).getByText('3건 저장')).toBeVisible();
    expect(routine).not.toHaveTextContent('주소');
    expect(routine).not.toHaveTextContent('연락처');
    expect(routine).not.toHaveTextContent('메모 내용');
  });

  it('updates the saved-note count when the embedded memo pad changes in the same tab', () => {
    renderDashboard();
    const routine = screen.getByRole('region', { name: '오늘 업무 브리핑' });

    expect(within(routine).getByText('0건 저장')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '테스트 메모 추가' }));
    expect(within(routine).getByText('1건 저장')).toBeVisible();
  });

  it('refreshes the routine briefing when an always-open office dashboard crosses midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 59, 500));
    routineMocks.loadRoutineBriefing.mockReturnValue({
      todayScheduleCount: 1,
      todayScheduleTitle: '7월 31일 업무',
      noteCount: 0,
      prePlanCount: 0,
      recentPrePlanName: null,
      checklistChecked: 1,
      checklistTotal: 13,
      checklistProgress: 8,
    });

    try {
      renderDashboard();
      expect(screen.getByText('7월 31일 업무')).toBeVisible();

      routineMocks.loadRoutineBriefing.mockReturnValue({
        todayScheduleCount: 1,
        todayScheduleTitle: '8월 1일 업무',
        noteCount: 0,
        prePlanCount: 0,
        recentPrePlanName: null,
        checklistChecked: 0,
        checklistTotal: 13,
        checklistProgress: 0,
      });
      act(() => vi.advanceTimersByTime(1_600));

      expect(screen.getByText('8월 1일 업무')).toBeVisible();
      expect(screen.getByText('0/13 완료')).toBeVisible();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('does not render a second incident summary while the global strip owns active status', () => {
    renderDashboard({
      ...EMPTY_INCIDENT_SESSION,
      incidentId: 'incident-active',
      active: true,
      title: '진행 중인 화재',
      startedAt: Date.now() - 30_000,
    });

    expect(screen.getByRole('region', { name: '오늘 업무 브리핑' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '출동 대응 바로가기' }))
      .not.toBeInTheDocument();
  });

  it('uses supporting utilities as the default quick-tool set without duplicating briefing shortcuts', () => {
    renderDashboard();
    const quickTools = screen.getByRole('region', { name: '빠른 도구' });

    expect(within(quickTools).getByRole('button', { name: '대응 매뉴얼' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '오프라인 점검' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '장비 인증' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: /^소화전/ })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: /^급수탑/ })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '수압 계산' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '법률 방어망' })).toBeVisible();
    expect(within(quickTools).queryByRole('button', { name: '일정관리' }))
      .not.toBeInTheDocument();
    expect(within(quickTools).queryByRole('button', { name: '장비점검' }))
      .not.toBeInTheDocument();
    expect(within(quickTools).queryByRole('button', { name: '대상물 정보' }))
      .not.toBeInTheDocument();
    expect(within(quickTools).queryByRole('button', { name: '현장 타이머' }))
      .not.toBeInTheDocument();
  });

  it('migrates only a known former default and preserves a custom response set', () => {
    const previousDefault = [
      'calendar',
      'checklist',
      'preplan',
      'manual',
      'facility_hydrants',
      'facility_towers',
      'law_defense',
    ];
    localStorage.setItem('119helper-custom-tools', JSON.stringify(previousDefault));
    renderDashboard();

    expect(JSON.parse(localStorage.getItem('119helper-custom-tools') || '[]')).toEqual([
      'manual',
      'offline_readiness',
      'equipment_cert',
      'facility_hydrants',
      'facility_towers',
      'calc_water',
      'law_defense',
    ]);

    cleanup();
    localStorage.setItem('119helper-custom-tools', JSON.stringify(['building', 'field_timer', 'incident']));
    renderDashboard();
    const quickTools = screen.getByRole('region', { name: '빠른 도구' });

    expect(within(quickTools).getByRole('button', { name: '건축물대장' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '현장 타이머' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '출동 상황판' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('119helper-custom-tools') || '[]'))
      .toEqual(['building', 'field_timer', 'incident']);
  });
});
