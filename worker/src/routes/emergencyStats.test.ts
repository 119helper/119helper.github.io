import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleEmergencyStats } from './emergencyStats';

function response(totalCount: number, items: unknown[] = []) {
  return new Response(JSON.stringify({
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
    totalCount,
    body: { items },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('handleEmergencyStats', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the current upstream headquarters name for Gwangju', async () => {
    const fetchMock = vi.fn(async () => response(1, [{
      sidoHqOgidNm: '광주소방본부',
      rsacGutFsttOgidNm: '광산소방서',
      rcptYm: '202512',
      gutCo: 1500,
      trnfCo: 948,
      trnfPcnt: 955,
    }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleEmergencyStats(
      '/api/emergency/stats/activity',
      new URL('https://worker.test/api/emergency/stats/activity?sido=광주&reqYm=202512'),
      'emergency-key',
    );

    expect(result.data).toMatchObject({
      totalCount: 1,
      requestedYm: '202512',
      headquarters: '광주소방본부',
    });
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('sidoHqOgidNm')).toBe('광주소방본부');
    expect(upstream.searchParams.get('rcptYm')).toBe('202512');
  });

  it('discovers the latest published month instead of relying on a frontend constant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00Z'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const month = new URL(String(input)).searchParams.get('rcptYm');
      return month === '202512' ? response(26, [{}]) : response(0);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleEmergencyStats(
      '/api/emergency/stats/availability',
      new URL('https://worker.test/api/emergency/stats/availability'),
      'emergency-key',
    );

    expect(result.cacheTtl).toBe(6 * 60 * 60);
    expect(result.data).toMatchObject({
      latestYm: '202512',
      currentYm: '202607',
      lagMonths: 7,
      sourceName: '소방청_구급통계서비스',
    });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });
});
