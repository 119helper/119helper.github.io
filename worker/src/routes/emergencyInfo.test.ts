import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleEmergencyInfo } from './emergencyInfo';

function response(items: unknown[]) {
  return new Response(JSON.stringify({
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
    totalCount: items.length,
    body: { items },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('handleEmergencyInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses gutYm for activity details and requires a fire station', async () => {
    const fetchMock = vi.fn(async () => response([{
      sidoHqOgidNm: '광주소방본부',
      rsacGutFsttOgidNm: '광산소방서',
      gutYm: '202512',
      sptMvmnDtc: 4,
    }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleEmergencyInfo(
      '/api/emergency/info/activity',
      new URL('https://worker.test/api/emergency/info/activity?sido=광주&fireStn=광산소방서&reportYm=202512'),
      'emergency-key',
    );

    expect(result.data).toMatchObject({
      requestedYm: '202512',
      headquarters: '광주소방본부',
      station: '광산소방서',
    });
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('gutYm')).toBe('202512');
    expect(upstream.searchParams.has('stmtYm')).toBe(false);
    expect(upstream.searchParams.get('rsacGutFsttOgidNm')).toBe('광산소방서');
  });

  it('rejects detail calls that would otherwise become a silent empty result', async () => {
    await expect(handleEmergencyInfo(
      '/api/emergency/info/transfer',
      new URL('https://worker.test/api/emergency/info/transfer?sido=광주&reportYm=202512'),
      'emergency-key',
    )).rejects.toThrow('출동소방서와 신고년월');
  });
});
