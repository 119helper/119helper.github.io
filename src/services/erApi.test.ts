// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchERBeds: vi.fn(),
  fetchERList: vi.fn(),
  fetchERMessages: vi.fn(),
  fetchERSevereIllness: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  ...apiMocks,
  isStaleDataError: () => false,
  tagStale: <T>(value: T) => value,
}));

import { CITY_TO_SIDO, filterBedsForRequestedRegion, getERRealTimeBeds, type ERRealTimeData } from './erApi';

describe('erApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the post-merger official region name for Gwangju', () => {
    expect(CITY_TO_SIDO.gwangju).toBe('전남광주통합특별시');
  });

  it('keeps only the former Gwangju districts from the merged region response', () => {
    const beds = [
      { dutyName: '광주병원', dutyAddr: '전남광주통합특별시 서구 상무대로 1' },
      { dutyName: '광산병원', dutyAddr: '광주광역시 광산구 첨단로 2' },
      { dutyName: '목포병원', dutyAddr: '전남광주통합특별시 목포시 영산로 3' },
    ] as ERRealTimeData[];

    expect(filterBedsForRequestedRegion('전남광주통합특별시', beds).map(item => item.dutyName))
      .toEqual(['광주병원', '광산병원']);
  });

  it('propagates a beds request failure so the UI can distinguish it from an empty result', async () => {
    apiMocks.fetchERBeds.mockRejectedValueOnce(new Error('upstream unavailable'));

    await expect(getERRealTimeBeds('서울특별시')).rejects.toThrow('upstream unavailable');
  });

  it('passes force refresh through to the API client', async () => {
    apiMocks.fetchERBeds.mockResolvedValueOnce('<response><body><items /></body></response>');

    await getERRealTimeBeds('서울특별시', '', true);

    expect(apiMocks.fetchERBeds).toHaveBeenCalledWith('서울특별시', '', true);
  });
});
