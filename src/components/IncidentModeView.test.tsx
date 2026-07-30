// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION } from '../services/incidentSession';
import type { IncidentSession } from '../services/incidentSession';
import { IncidentChangeMonitorProvider } from '../contexts/IncidentChangeMonitorContext';
import IncidentModeView from './IncidentModeView';

const mocks = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  setIncident: vi.fn(),
  geocodeAddress: vi.fn(),
  currentLocation: vi.fn(),
  getWeather: vi.fn(),
  getErBeds: vi.fn(),
  getRoadDisasters: vi.fn(),
  getFireWater: vi.fn(),
  getFreshness: vi.fn(),
  startActivity: vi.fn(),
  appendActivity: vi.fn(),
}));

vi.mock('../hooks/useIncidentSession', () => ({
  useIncidentSession: () => [mocks.session, mocks.setIncident],
}));

vi.mock('../hooks/useActivitySession', () => ({
  useActivitySession: () => [{ stamps: [] }, vi.fn()],
}));

vi.mock('../contexts/TimerContext', () => ({
  useTimer: () => ({
    timers: [],
    stopwatchRunning: false,
    stopwatchElapsed: 0,
  }),
}));

vi.mock('../services/incidentLocation', () => ({
  geocodeIncidentAddress: mocks.geocodeAddress,
  getCurrentIncidentLocation: mocks.currentLocation,
}));

vi.mock('../services/weatherApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/weatherApi')>();
  return {
    ...actual,
    getUltraShortNow: mocks.getWeather,
  };
});

vi.mock('../services/erApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/erApi')>();
  return {
    ...actual,
    getERRealTimeBeds: mocks.getErBeds,
  };
});

vi.mock('../services/roadDisasterApi', () => ({
  getNearbyRoadDisasters: mocks.getRoadDisasters,
}));

vi.mock('../services/fireWaterApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/fireWaterApi')>();
  return {
    ...actual,
    fetchFireWaterFacilities: mocks.getFireWater,
  };
});

vi.mock('../services/dataFreshness', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/dataFreshness')>();
  return {
    ...actual,
    getDatasetFreshness: mocks.getFreshness,
  };
});

vi.mock('../services/activitySession', () => ({
  startActivityFromIncident: mocks.startActivity,
  appendActivityEvent: mocks.appendActivity,
}));

vi.mock('./AviationSafetyCard', () => ({
  default: () => <div data-testid="aviation-safety" />,
}));

vi.mock('./IncidentCloseReviewDialog', () => ({
  default: () => null,
}));

const LOCATION = {
  lat: 37.5665,
  lng: 126.978,
  source: 'address' as const,
  queryAddress: '서울시청',
  resolvedAddress: '서울특별시 중구 세종대로 110',
  regionName: '서울특별시',
  districtName: '중구',
  legalDongCode: '1114010300',
  resolvedAt: 10_000,
};

function activeSession() {
  return {
    ...EMPTY_INCIDENT_SESSION,
    incidentId: 'incident-active',
    active: true,
    type: 'fire' as const,
    title: '시청 인근 화재',
    address: LOCATION.resolvedAddress,
    location: LOCATION,
    startedAt: Date.now() - 60_000,
  };
}

function roadResponse(overrides: Record<string, unknown> = {}) {
  return {
    source: '국토교통부 국가교통정보센터',
    sourceUrl: 'https://its.go.kr/opendata/opendataList?service=disaster',
    retrievedAt: new Date().toISOString(),
    query: {
      lat: LOCATION.lat,
      lng: LOCATION.lng,
      radiusKm: 5,
      eventType: 'all',
      startDate: '20260724',
      endDate: '20260730',
      bounds: { minX: 126.9, maxX: 127, minY: 37.5, maxY: 37.6 },
    },
    totalCount: 0,
    truncated: false,
    items: [],
    ...overrides,
  };
}

function activeRoadControl() {
  return {
    eventId: 'active-control-1',
    eventType: 'sinkhole',
    eventTypeCode: 'D06',
    eventDetailType: '1',
    status: '1',
    occurredAt: '2026-07-30T12:00:00+09:00',
    endedAt: null,
    facilityName: null,
    facilityExtent: null,
    geometry: {
      type: 'Point',
      coordinates: [[126.978, 37.5665]],
      raw: 'POINT(126.978 37.5665)',
    },
    road: { linkIds: [], names: ['세종대로'], number: null, direction: null },
    control: { type: 'full', typeCode: '4', blockedLanes: '전 차로' },
    message: '복구 작업으로 전면 통제',
  };
}

function ViewTree() {
  return (
    <IncidentChangeMonitorProvider
      session={mocks.session as unknown as IncidentSession}
      city="seoul"
      enabledWhenIdle
    >
    <IncidentModeView
      city="seoul"
      cityLabel="서울"
      fireFacilities={[]}
      isLoadingFacilities={false}
      cityIndex={null}
      onNavigate={vi.fn()}
    />
    </IncidentChangeMonitorProvider>
  );
}

function renderView() {
  return render(
    <ViewTree />,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.session = { ...EMPTY_INCIDENT_SESSION };
  mocks.getWeather.mockResolvedValue([]);
  mocks.getErBeds.mockResolvedValue([]);
  mocks.getRoadDisasters.mockResolvedValue({ data: roadResponse(), staleAt: null });
  mocks.getFireWater.mockResolvedValue([]);
  mocks.getFreshness.mockResolvedValue(null);
});

afterEach(cleanup);

describe('IncidentModeView operational flow', () => {
  it('resolves one address and shares the same incident identity and coordinate with activity logging', async () => {
    mocks.geocodeAddress.mockResolvedValue(LOCATION);
    renderView();

    fireEvent.change(screen.getByLabelText(/현장 주소/), { target: { value: '서울시청' } });
    fireEvent.click(screen.getByRole('button', { name: /위치 기준 브리핑 시작/ }));

    await waitFor(() => expect(mocks.setIncident).toHaveBeenCalledTimes(1));
    const incident = mocks.setIncident.mock.calls[0][0];
    expect(incident).toMatchObject({
      active: true,
      address: LOCATION.resolvedAddress,
      location: LOCATION,
    });
    expect(incident.incidentId).toEqual(expect.any(String));
    expect(mocks.startActivity).toHaveBeenCalledWith(expect.objectContaining({
      incidentId: incident.incidentId,
      startedAt: incident.startedAt,
      location: { lat: LOCATION.lat, lng: LOCATION.lng },
    }));
  });

  it('keeps edits made while address resolution is in progress', async () => {
    let finishGeocoding: ((location: typeof LOCATION) => void) | undefined;
    mocks.geocodeAddress.mockImplementation(() => new Promise(resolve => {
      finishGeocoding = resolve;
    }));
    renderView();

    fireEvent.change(screen.getByLabelText(/현장 주소/), { target: { value: '서울시청' } });
    fireEvent.click(screen.getByRole('button', { name: /위치 기준 브리핑 시작/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('현장 좌표를 확인하고 있습니다');

    fireEvent.change(screen.getByLabelText('출동 제목'), { target: { value: '조회 중 수정한 출동명' } });
    await act(async () => {
      finishGeocoding?.(LOCATION);
    });

    await waitFor(() => expect(mocks.setIncident).toHaveBeenCalledTimes(1));
    expect(mocks.setIncident).toHaveBeenCalledWith(expect.objectContaining({
      title: '조회 중 수정한 출동명',
      location: LOCATION,
    }));
  });

  it('does not partially start after geocoding fails and exposes an explicit regional fallback', async () => {
    mocks.geocodeAddress.mockRejectedValue(new Error('주소를 찾지 못했습니다.'));
    renderView();

    fireEvent.change(screen.getByLabelText(/현장 주소/), { target: { value: '확인 안 되는 주소' } });
    fireEvent.click(screen.getByRole('button', { name: /위치 기준 브리핑 시작/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('주소를 찾지 못했습니다');
    expect(mocks.setIncident).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '위치 없이 서울 지역 기준으로 시작' }));
    expect(mocks.setIncident).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      location: undefined,
    }));
  });

  it('labels an empty ITS response as reported-result scope, not as a safe route', async () => {
    mocks.session = activeSession();
    renderView();

    const heading = await screen.findByRole('heading', { name: '진입로 재난·통제' });
    const card = heading.closest('article');
    expect(card).not.toBeNull();
    expect(await within(card as HTMLElement).findByText('조회 결과 보고된 항목 없음')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/미신고 위험이나 현장 통제가 없다는 뜻은 아닙니다/)).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(/안전|진입 가능/)).not.toBeInTheDocument();
  });

  it('labels registration-only fire-water status as unknown and exposes expired freshness', async () => {
    mocks.session = activeSession();
    mocks.getFireWater.mockResolvedValue([{
      fcltyNo: 'FW-UNKNOWN',
      fcltyKndNm: '소화전',
      rdnmadr: '서울특별시 중구 세종대로 111',
      latitude: '37.5666',
      longitude: '126.9781',
      signguNm: '중구',
    }]);
    mocks.getFreshness.mockResolvedValue({
      label: '소화전',
      sourceDate: '2024-02-07',
      maxAgeDays: 120,
    });
    renderView();

    expect(await screen.findByText(/점검상태 미확인/)).toBeInTheDocument();
    expect(screen.getAllByText(/갱신주기 초과/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/가까운 정상 소방용수/)).not.toBeInTheDocument();
  });

  it('does not mix the selected city ER pool into a GPS incident with unresolved jurisdiction', async () => {
    mocks.session = {
      ...activeSession(),
      location: {
        ...LOCATION,
        source: 'gps',
        resolvedAddress: '현재 위치',
        regionName: undefined,
        districtName: undefined,
        legalDongCode: undefined,
        accuracyMeters: 15,
      },
    };
    renderView();

    expect(await screen.findByText('GPS 행정구역을 확인하지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByText(/잘못된 관할 병상을 섞지 않도록 응급실 후보는 숨겼습니다/)).toBeInTheDocument();
    expect(mocks.getErBeds).not.toHaveBeenCalled();
  });

  it('shows stale and truncated scope explicitly', async () => {
    mocks.session = activeSession();
    mocks.getRoadDisasters.mockResolvedValue({
      data: roadResponse({ truncated: true }),
      staleAt: Date.now() - 5 * 60_000,
    });
    renderView();

    expect(await screen.findByText(/분 전 성공 캐시 · 변경 가능/)).toBeInTheDocument();
    expect(screen.getByText('응답 일부만 표시 중')).toBeInTheDocument();
  });

  it('renders completed road events as ended history rather than current control', async () => {
    mocks.session = activeSession();
    mocks.getRoadDisasters.mockResolvedValue({
      data: roadResponse({
        totalCount: 1,
        items: [{
          eventId: 'ended-1',
          eventType: 'sinkhole',
          eventTypeCode: 'D06',
          eventDetailType: null,
          status: '3',
          occurredAt: '2026-07-29T10:00:00+09:00',
          endedAt: null,
          facilityName: null,
          facilityExtent: null,
          geometry: {
            type: 'Point',
            coordinates: [[126.978, 37.5665]],
            raw: 'POINT(126.978 37.5665)',
          },
          road: { linkIds: [], names: ['세종대로'], number: null, direction: null },
          control: { type: 'full', typeCode: '4', blockedLanes: null },
          message: '복구 완료',
        }],
      }),
      staleAt: null,
    });
    renderView();

    expect(await screen.findByText('거리 확인된 항목은 종료·해제 상태')).toBeInTheDocument();
    expect(screen.getByText(/현재 통제로 표시하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/종료·해제 · 땅꺼짐/)).toBeInTheDocument();
  });

  it('alerts only after a new road control appears and records it against the same incident', async () => {
    mocks.session = activeSession();
    mocks.getRoadDisasters
      .mockResolvedValueOnce({ data: roadResponse(), staleAt: null })
      .mockResolvedValueOnce({
        data: roadResponse({ totalCount: 1, items: [activeRoadControl()] }),
        staleAt: null,
      });
    const view = renderView();

    await waitFor(() => expect(mocks.getRoadDisasters).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('새 도로 재난·통제')).not.toBeInTheDocument();

    mocks.session = {
      ...activeSession(),
      location: { ...LOCATION },
    };
    view.rerender(<ViewTree />);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText('새 도로 재난·통제')).toBeInTheDocument();
    expect(screen.getByText(/진입 경로와 현장 지령을 다시 확인하세요/)).toBeInTheDocument();
    expect(mocks.appendActivity).toHaveBeenCalledWith(
      expect.stringContaining('변화 감지 · 새 도로 재난·통제'),
      expect.any(Number),
      'incident-active',
    );

    fireEvent.click(screen.getByRole('button', { name: '새 도로 재난·통제 확인 완료' }));
    expect(screen.queryByText('새 도로 재난·통제')).not.toBeInTheDocument();
    expect(screen.getByText(/변화 감시 중/)).toBeInTheDocument();
  });

  it('keeps all simultaneous alerts but initially collapses the visible list', async () => {
    const controls = Array.from({ length: 9 }, (_, index) => ({
      ...activeRoadControl(),
      eventId: `burst-control-${index}`,
      road: {
        ...activeRoadControl().road,
        names: [`폭주도로-${index}`],
      },
    }));
    mocks.session = activeSession();
    mocks.getRoadDisasters
      .mockResolvedValueOnce({ data: roadResponse(), staleAt: null })
      .mockResolvedValueOnce({
        data: roadResponse({ totalCount: controls.length, items: controls }),
        staleAt: null,
      });
    renderView();
    await waitFor(() => expect(mocks.getRoadDisasters).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('visibilitychange'));
    const heading = await screen.findByRole('heading', { name: '다시 확인할 현장 정보' });
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('article')).toHaveLength(4);
    expect(within(section as HTMLElement).getByRole('button', {
      name: '나머지 5건 모두 보기',
    })).toBeInTheDocument();
    expect(mocks.appendActivity).toHaveBeenCalledTimes(9);

    fireEvent.click(within(section as HTMLElement).getByRole('button', {
      name: '나머지 5건 모두 보기',
    }));
    expect(section?.querySelectorAll('article')).toHaveLength(9);
    expect(within(section as HTMLElement).getByRole('button', {
      name: '변화 알림 접기',
    })).toBeInTheDocument();
  });
});
