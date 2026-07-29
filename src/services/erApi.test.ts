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

import {
  CITY_TO_SIDO,
  attachFacilityInfoAndFilterBeds,
  filterBedsForRequestedRegion,
  getERRealTimeBeds,
  type ERListItem,
  type ERRealTimeData,
} from './erApi';

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

  it('joins facility addresses before filtering merged Gwangju beds', async () => {
    apiMocks.fetchERBeds.mockResolvedValueOnce(`<response><body><items>
      <item><dutyName>광주병원</dutyName><hpid>GW-1</hpid><phpid>GW-1</phpid><hvec>5</hvec></item>
      <item><dutyName>목포병원</dutyName><hpid>JN-1</hpid><phpid>JN-1</phpid><hvec>7</hvec></item>
    </items></body></response>`);
    apiMocks.fetchERList.mockResolvedValueOnce(`<response><body><items>
      <item><dutyName>광주병원</dutyName><hpid>GW-1</hpid><phpid>GW-1</phpid><dutyAddr>전남광주통합특별시 서구 상무대로 1</dutyAddr><wgs84Lat>35.1</wgs84Lat><wgs84Lon>126.8</wgs84Lon></item>
      <item><dutyName>목포병원</dutyName><hpid>JN-1</hpid><phpid>JN-1</phpid><dutyAddr>전남광주통합특별시 목포시 영산로 3</dutyAddr></item>
    </items></body></response>`);

    const beds = await getERRealTimeBeds('전남광주통합특별시', '', true);

    expect(beds).toHaveLength(1);
    expect(beds[0]).toMatchObject({
      dutyName: '광주병원',
      dutyAddr: '전남광주통합특별시 서구 상무대로 1',
      wgs84Lat: '35.1',
      wgs84Lon: '126.8',
    });
    expect(apiMocks.fetchERList).toHaveBeenCalledWith('전남광주통합특별시', '', true);
  });

  it('drops merged-region beds whose facility address cannot be verified', () => {
    const beds = [
      { dutyName: '주소없는병원', hpid: 'UNKNOWN', phpid: 'UNKNOWN' },
    ] as ERRealTimeData[];
    const facilities = [] as ERListItem[];

    expect(attachFacilityInfoAndFilterBeds('전남광주통합특별시', beds, facilities)).toEqual([]);
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
