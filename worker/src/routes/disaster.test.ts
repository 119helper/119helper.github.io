import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSafetydataJson } from './safetydata';
import { handleDisasterMsg } from './disaster';

vi.mock('./safetydata', () => ({
  fetchSafetydataJson: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchSafetydataJson);

describe('disaster message route', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reads the latest page for today and normalizes the current API contract', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T02:00:00Z'));
    mockedFetch
      .mockResolvedValueOnce({
        totalCount: 181,
        body: [{ SN: 1, CRT_DT: '2026/07/28 00:01:00', MSG_CN: 'old' }],
      })
      .mockResolvedValueOnce({
        totalCount: 181,
        body: [
          {
            SN: 181,
            CRT_DT: '2026/07/28 10:59:00',
            MSG_CN: '최신 문자',
            RCPTN_RGN_NM: '전남광주통합특별시 서구 ',
            EMRG_STEP_NM: '긴급재난',
          },
          {
            SN: 180,
            CRT_DT: '2026/07/28 10:58:00',
            MSG_CN: '직전 문자',
            RCPTN_RGN_NM: '전국',
            EMRG_STEP_NM: '안전안내',
          },
        ],
      });

    const result = await handleDisasterMsg(
      new URL('https://worker.test/api/disaster-msg?numOfRows=2'),
      'secret',
    );

    expect(result.data).toEqual([
      {
        create_date: '2026/07/28 10:59:00',
        location_id: '',
        location_name: '전남광주통합특별시 서구',
        md101_sn: '181',
        msg: '최신 문자',
        send_platform: 'cbs',
        msgType: '긴급재난',
      },
      {
        create_date: '2026/07/28 10:58:00',
        location_id: '',
        location_name: '전국',
        md101_sn: '180',
        msg: '직전 문자',
        send_platform: 'cbs',
        msgType: '안전안내',
      },
    ]);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      '/V2/api/DSSP-IF-00247',
      expect.any(URLSearchParams),
      { label: 'DisasterMsg API' },
    );
    expect(mockedFetch.mock.calls[0][1].get('crtDt')).toBe('20260728');
    expect(mockedFetch.mock.calls[1][1].get('pageNo')).toBe('2');
  });

  it('falls back to yesterday only when today has no messages', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T15:05:00Z'));
    mockedFetch
      .mockResolvedValueOnce({ totalCount: 0, body: [] })
      .mockResolvedValueOnce({
        totalCount: 1,
        body: [{
          SN: 7,
          CRT_DT: '2026/07/28 23:59:00',
          MSG_CN: '전날 마지막 문자',
          RCPTN_RGN_NM: '전국',
          EMRG_STEP_NM: '안전안내',
        }],
      });

    const result = await handleDisasterMsg(
      new URL('https://worker.test/api/disaster-msg'),
      'secret',
    );

    expect(mockedFetch.mock.calls[0][1].get('crtDt')).toBe('20260729');
    expect(mockedFetch.mock.calls[1][1].get('crtDt')).toBe('20260728');
    expect(result.data).toHaveLength(1);
  });
});
