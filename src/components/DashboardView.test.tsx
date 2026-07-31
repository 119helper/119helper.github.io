// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION, type IncidentSession } from '../services/incidentSession';
import DashboardView from './DashboardView';

const apiMocks = vi.hoisted(() => ({
  getRealtimeAirQuality: vi.fn(),
  getERRealTimeBeds: vi.fn(),
  getUltraShortNow: vi.fn(),
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

vi.mock('../services/privacySettings', () => ({
  loadStoredJson: (_key: string, fallback: unknown) => fallback,
}));

vi.mock('./WeatherAlertBanner', () => ({
  default: () => <div data-testid="weather-alert-banner" />,
}));

vi.mock('./StickyNotes', () => ({
  default: () => <div data-testid="sticky-notes" />,
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('places routine work shortcuts before the supporting incident entry', () => {
    const onNavigate = renderDashboard();
    const routine = screen.getByRole('region', { name: '근무 준비 바로가기' });
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

  it('does not render a second incident summary while the global strip owns active status', () => {
    renderDashboard({
      ...EMPTY_INCIDENT_SESSION,
      incidentId: 'incident-active',
      active: true,
      title: '진행 중인 화재',
      startedAt: Date.now() - 30_000,
    });

    expect(screen.getByRole('region', { name: '근무 준비 바로가기' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '출동 대응 바로가기' }))
      .not.toBeInTheDocument();
  });

  it('uses routine work as the new default quick-tool set', () => {
    renderDashboard();
    const quickTools = screen.getByRole('region', { name: '빠른 도구' });

    expect(within(quickTools).getByRole('button', { name: '일정관리' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '장비점검' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '대상물 정보' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '대응 매뉴얼' })).toBeVisible();
    expect(within(quickTools).queryByRole('button', { name: '현장 타이머' }))
      .not.toBeInTheDocument();
  });

  it('migrates only a known former default and preserves a custom response set', () => {
    const previousDefault = [
      'facility_hydrants',
      'facility_towers',
      'checklist',
      'field_timer',
      'calc_water',
      'aviation',
      'law_defense',
    ];
    localStorage.setItem('119helper-custom-tools', JSON.stringify(previousDefault));
    renderDashboard();

    expect(JSON.parse(localStorage.getItem('119helper-custom-tools') || '[]')).toEqual([
      'calendar',
      'checklist',
      'preplan',
      'manual',
      'facility_hydrants',
      'facility_towers',
      'law_defense',
    ]);

    cleanup();
    localStorage.setItem('119helper-custom-tools', JSON.stringify(['field_timer', 'incident']));
    renderDashboard();
    const quickTools = screen.getByRole('region', { name: '빠른 도구' });

    expect(within(quickTools).getByRole('button', { name: '현장 타이머' })).toBeVisible();
    expect(within(quickTools).getByRole('button', { name: '출동 상황판' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('119helper-custom-tools') || '[]'))
      .toEqual(['field_timer', 'incident']);
  });
});
