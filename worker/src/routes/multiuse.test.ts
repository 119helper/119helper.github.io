import { afterEach, describe, expect, it, vi } from 'vitest';
import { MULTIUSE_2025_AGGREGATES, MULTIUSE_2025_SOURCE } from '../data/multiuse2025';
import { handleMultiUse } from './multiuse';

function numericTotal(row: Record<string, string | number>): number {
  return Object.values(row).reduce<number>(
    (sum, value) => sum + (typeof value === 'number' ? value : 0),
    0,
  );
}

describe('handleMultiUse', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves the official 2025 static aggregate without an API credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMultiUse(
      new URL('https://api.example.test/api/multiuse?ctprvnNm=광주광역시'),
      '',
    );
    const rows = result.data as Record<string, string | number>[];

    expect(result.cacheTtl).toBe(30 * 86400);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 소방본부: '광주광역시', 연도: '2025' });
    expect(numericTotal(rows[0])).toBe(3873);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the current integrated Gwangju name to the source-era city boundary', async () => {
    const result = await handleMultiUse(
      new URL('https://api.example.test/api/multiuse?ctprvnNm=전남광주통합특별시'),
      '',
    );

    expect(result.data).toEqual([
      expect.objectContaining({ 소방본부: '광주광역시', 연도: '2025' }),
    ]);
  });

  it('aggregates approved 2025 facility API rows and normalizes category names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      currentCount: 3,
      matchCount: 3,
      totalCount: 154_873,
      data: [
        { 주소: '광주광역시 북구', 영업상태: '정상', 업종: '인터넷컴퓨터게임시설제공업(PC방)' },
        { 주소: '광주광역시 서구', 영업상태: '정상', 업종: '목욕장(찜질방)' },
        { 주소: '광주광역시 동구', 영업상태: '정상', 업종: 'PC방' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMultiUse(
      new URL('https://api.example.test/api/multiuse?ctprvnNm=광주광역시'),
      'approved-key',
    );

    expect(result.data).toEqual([{
      소방본부: '광주광역시',
      연도: '2025',
      PC방: 2,
      찜질방: 1,
    }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain('/api/15083979/v1/uddi:42865d20-be48-41cb-b9ce-95665c31a5b5');
    expect(requestUrl).toContain('cond%5B%EC%A3%BC%EC%86%8C%3A%3ALIKE%5D=');
    expect(requestUrl).toContain('cond%5B%EC%98%81%EC%97%85%EC%83%81%ED%83%9C%3A%3AEQ%5D=');
  });

  it('falls back to the verified aggregate when the current API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('not authorized', { status: 401 }),
    ));

    const result = await handleMultiUse(
      new URL('https://api.example.test/api/multiuse?ctprvnNm=광주광역시'),
      'invalid-key',
    );
    const rows = result.data as Record<string, string | number>[];

    expect(rows).toHaveLength(1);
    expect(numericTotal(rows[0])).toBe(3873);
  });

  it('keeps the checked-in aggregation internally consistent', () => {
    expect(MULTIUSE_2025_SOURCE.sourceRows).toBe(154_873);
    expect(MULTIUSE_2025_SOURCE.statusCounts.정상).toBe(113_235);
    expect(MULTIUSE_2025_AGGREGATES).toHaveLength(9);
    expect(MULTIUSE_2025_AGGREGATES.reduce((sum, row) => sum + numericTotal(row), 0)).toBe(48_736);
  });
});
