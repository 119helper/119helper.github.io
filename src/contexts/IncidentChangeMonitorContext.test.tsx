// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_INCIDENT_SESSION, type IncidentSession } from '../services/incidentSession';
import {
  INCIDENT_OPERATIONAL_POLL_MS,
  INCIDENT_ROAD_POLL_MS,
  IncidentChangeMonitorProvider,
  useIncidentChangeMonitor,
} from './IncidentChangeMonitorContext';

const mocks = vi.hoisted(() => ({
  getWeather: vi.fn(),
  getErBeds: vi.fn(),
  getRoadDisasters: vi.fn(),
  appendActivity: vi.fn(),
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

vi.mock('../services/activitySession', () => ({
  appendActivityEvent: mocks.appendActivity,
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

function activeSession(
  overrides: Partial<IncidentSession> = {},
): IncidentSession {
  return {
    ...EMPTY_INCIDENT_SESSION,
    incidentId: 'incident-monitor',
    active: true,
    type: 'fire',
    title: '모니터 출동',
    address: LOCATION.resolvedAddress,
    location: LOCATION,
    startedAt: Date.now() - 60_000,
    ...overrides,
  };
}

function roadItem(
  eventId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    eventId,
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
    road: { linkIds: [], names: [`도로-${eventId}`], number: null, direction: null },
    control: { type: 'full', typeCode: '4', blockedLanes: '전 차로' },
    message: '복구 작업으로 전면 통제',
    ...overrides,
  };
}

function roadResponse(
  items: unknown[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    data: {
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
      totalCount: items.length,
      truncated: false,
      items,
      sources: [],
      messageCandidates: [],
      messageCandidatesTruncated: false,
      verificationLinks: [],
      ...overrides,
    },
    staleAt: null,
  };
}

function erRow(beds: number) {
  return {
    rnum: '1',
    dutyName: '현장대학병원',
    dutyAddr: '서울특별시 중구 병원로 1',
    dutyTel3: '02-119-1190',
    hpbdn: '',
    hpccuyn: '',
    hpcuyn: '',
    hvec: String(beds),
    hvgc: '',
    hvoc: '',
    hvs01: '',
    hvs02: '',
    hvs37: '',
    hvs38: '',
    wgs84Lat: '37.57',
    wgs84Lon: '126.98',
    dutyHayn: '',
    dutyInf: '',
    hpid: 'HPID-STABLE-1',
    phpid: 'PHPID-STABLE-1',
    hvidate: '20260730230000',
  };
}

function Probe() {
  const { alerts } = useIncidentChangeMonitor();
  return (
    <div>
      <span data-testid="alert-count">{alerts.length}</span>
      <ol>
        {alerts.map(alert => (
          <li
            key={alert.alertId}
            data-testid="change-alert"
            data-severity={alert.severity}
            data-type={alert.type}
            data-dedupe={alert.dedupeKey}
          >
            {alert.title}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProviderTree({
  session,
  showProbe = true,
}: {
  session: IncidentSession;
  showProbe?: boolean;
}) {
  return (
    <IncidentChangeMonitorProvider session={session} city="seoul">
      {showProbe ? <Probe /> : <div>다른 앱 탭</div>}
    </IncidentChangeMonitorProvider>
  );
}

async function settlePromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T23:00:00+09:00'));
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  mocks.getWeather.mockResolvedValue([]);
  mocks.getErBeds.mockResolvedValue([]);
  mocks.getRoadDisasters.mockResolvedValue(roadResponse());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('IncidentChangeMonitorProvider lifecycle and queue', () => {
  it('keeps polling and preserves alerts while the incident view consumer is unmounted', async () => {
    mocks.getRoadDisasters
      .mockResolvedValueOnce(roadResponse())
      .mockResolvedValueOnce(roadResponse([roadItem('tab-away-control')]));
    const session = activeSession();
    const view = render(<ProviderTree session={session} />);
    await settlePromises();
    expect(screen.getByTestId('alert-count')).toHaveTextContent('0');

    view.rerender(<ProviderTree session={session} showProbe={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
    });
    expect(mocks.getRoadDisasters).toHaveBeenCalledTimes(2);

    view.rerender(<ProviderTree session={session} />);
    expect(screen.getByTestId('alert-count')).toHaveTextContent('1');
    expect(screen.getByText('새 도로 재난·통제')).toBeInTheDocument();
  });

  it('preserves every simultaneous change and orders critical before warning', async () => {
    const changes = Array.from({ length: 9 }, (_, index) => (
      index === 0
        ? roadItem('warning-control', {
          eventType: 'fire',
          eventTypeCode: 'D07',
          control: { type: 'partial', typeCode: '2', blockedLanes: '1개 차로' },
        })
        : roadItem(`critical-control-${index}`)
    ));
    mocks.getRoadDisasters
      .mockResolvedValueOnce(roadResponse())
      .mockResolvedValueOnce(roadResponse(changes));
    render(<ProviderTree session={activeSession()} />);
    await settlePromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
    });

    expect(screen.getByTestId('alert-count')).toHaveTextContent('9');
    const alerts = screen.getAllByTestId('change-alert');
    expect(alerts[0]).toHaveAttribute('data-severity', 'critical');
    expect(alerts.at(-1)).toHaveAttribute('data-severity', 'warning');
    expect(mocks.appendActivity).toHaveBeenCalledTimes(9);
  });

  it('keeps a zero-bed hospital in the snapshot and emits a critical bed-drop alert', async () => {
    mocks.getErBeds
      .mockResolvedValueOnce([erRow(8)])
      .mockResolvedValueOnce([erRow(0)]);
    render(<ProviderTree session={activeSession()} />);
    await settlePromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INCIDENT_OPERATIONAL_POLL_MS);
    });

    const [alert] = screen.getAllByTestId('change-alert');
    expect(alert).toHaveAttribute('data-type', 'er-beds-dropped');
    expect(alert).toHaveAttribute('data-severity', 'critical');
    expect(alert).toHaveAttribute(
      'data-dedupe',
      expect.stringContaining('hpid-stable-1'),
    );
  });

  it('does not advance the road baseline from a truncated ITS response', async () => {
    const existing = roadItem('existing-control');
    mocks.getRoadDisasters
      .mockResolvedValueOnce(roadResponse([existing]))
      .mockResolvedValueOnce(roadResponse([], { truncated: true }))
      .mockResolvedValueOnce(roadResponse([existing]));
    render(<ProviderTree session={activeSession()} />);
    await settlePromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
    });

    expect(mocks.getRoadDisasters).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('alert-count')).toHaveTextContent('0');
  });

  it('resets the baseline when coordinates change within the same incident', async () => {
    mocks.getRoadDisasters
      .mockResolvedValueOnce(roadResponse([roadItem('old-location-control')]))
      .mockResolvedValueOnce(roadResponse([roadItem('new-location-control')]));
    const first = activeSession();
    const view = render(<ProviderTree session={first} />);
    await settlePromises();

    const moved = activeSession({
      location: {
        ...LOCATION,
        lat: 37.7,
        lng: 127.2,
        resolvedAddress: '서울특별시 새 현장',
      },
    });
    view.rerender(<ProviderTree session={moved} />);
    await settlePromises();

    expect(mocks.getRoadDisasters).toHaveBeenLastCalledWith(37.7, 127.2, 5, false, {
      regionName: '서울특별시',
      districtName: '중구',
    });
    expect(screen.getByTestId('alert-count')).toHaveTextContent('0');
  });

  it('alerts again when the same control reactivates after being released', async () => {
    const active = roadItem('recurrent-control');
    const released = roadItem('recurrent-control', { status: '3' });
    mocks.getRoadDisasters
      .mockResolvedValueOnce(roadResponse())
      .mockResolvedValueOnce(roadResponse([active]))
      .mockResolvedValueOnce(roadResponse([released]))
      .mockResolvedValueOnce(roadResponse([active]));
    render(<ProviderTree session={activeSession()} />);
    await settlePromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
      await vi.advanceTimersByTimeAsync(INCIDENT_ROAD_POLL_MS);
    });

    const alerts = screen.getAllByTestId('change-alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveAttribute(
      'data-dedupe',
      alerts[1].getAttribute('data-dedupe'),
    );
  });
});
