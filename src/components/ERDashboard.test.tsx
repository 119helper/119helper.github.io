// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ERRealTimeData } from '../services/erApi';

const erMocks = vi.hoisted(() => ({
  getERRealTimeBeds: vi.fn(),
  getERMessages: vi.fn(),
  getERSevereIllness: vi.fn(),
}));

vi.mock('../services/erApi', () => ({
  ...erMocks,
  CITY_TO_SIDO: {
    seoul: '서울특별시',
    gwangju: '전남광주통합특별시',
  },
}));

vi.mock('../services/apiClient', () => ({
  getStaleAt: () => null,
}));

import ERDashboard from './ERDashboard';

function bed(name: string, id: string): ERRealTimeData {
  return {
    dutyName: name,
    phpid: id,
    hvec: '3',
    hvgc: '4',
    dutyTel3: '062-000-0000',
    dutyAddr: `${name} 주소`,
  } as ERRealTimeData;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('ERDashboard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the newly selected region result when an older request finishes later', async () => {
    const seoul = deferred<ERRealTimeData[]>();
    erMocks.getERRealTimeBeds.mockImplementation((sido: string) => {
      if (sido === '서울특별시') return seoul.promise;
      return Promise.resolve([bed('광주통합병원', 'GW-1')]);
    });
    erMocks.getERMessages.mockResolvedValue([]);
    erMocks.getERSevereIllness.mockResolvedValue([]);

    const view = render(<ERDashboard city="seoul" />);
    view.rerender(<ERDashboard city="gwangju" />);

    expect(await screen.findByText('광주통합병원')).toBeInTheDocument();
    expect(screen.getByText('광주광역시')).toBeInTheDocument();
    expect(screen.queryByText('전남광주통합특별시')).not.toBeInTheDocument();

    await act(async () => {
      seoul.resolve([bed('서울지연병원', 'SE-1')]);
      await seoul.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText('서울지연병원')).not.toBeInTheDocument();
      expect(screen.getByText('광주통합병원')).toBeInTheDocument();
    });
  });

  it('shows a retryable error instead of presenting a request failure as zero hospitals', async () => {
    erMocks.getERRealTimeBeds.mockRejectedValue(new Error('공공데이터 연결 실패'));
    erMocks.getERMessages.mockResolvedValue([]);
    erMocks.getERSevereIllness.mockResolvedValue([]);

    render(<ERDashboard city="gwangju" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('응급실 현황을 불러오지 못했습니다.');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('keeps ER detail on the active incident region instead of the selected app city', async () => {
    erMocks.getERRealTimeBeds.mockResolvedValue([bed('부산현장병원', 'BS-1')]);
    erMocks.getERMessages.mockResolvedValue([]);
    erMocks.getERSevereIllness.mockResolvedValue([]);

    render(
      <ERDashboard
        city="seoul"
        incidentRegionName="부산광역시"
        incidentDistrictName="중구"
      />,
    );

    expect(await screen.findByText('부산현장병원')).toBeInTheDocument();
    expect(erMocks.getERRealTimeBeds).toHaveBeenCalledWith(
      '부산광역시',
      '',
      false,
      'incident-region',
    );
    expect(screen.getByText('부산광역시')).toBeInTheDocument();
  });
});
