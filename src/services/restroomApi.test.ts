import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRestroomCityIndex,
  fetchRestrooms,
  normalizeRestroomCoordinateKind,
} from './restroomApi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeRestroomCoordinateKind', () => {
  it('keeps known kinds and treats missing or invalid values as unknown', () => {
    expect(normalizeRestroomCoordinateKind('facility_point')).toBe('facility_point');
    expect(normalizeRestroomCoordinateKind('address_point')).toBe('address_point');
    expect(normalizeRestroomCoordinateKind(undefined)).toBe('unknown');
    expect(normalizeRestroomCoordinateKind('exact')).toBe('unknown');
  });
});

describe('fetchRestroomCityIndex', () => {
  it('adds the address-point overlay counts to the base city index', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/data/restrooms/busan/index.json') {
        return jsonResponse({ total: 10, districts: { 사상구: 4, 수영구: 6 } });
      }
      if (url === '/data/restroom-address-points/busan/index.json') {
        return jsonResponse({ total: 3, districts: { 사상구: 2, 동래구: 1 } });
      }
      return jsonResponse({}, 404);
    }));

    await expect(fetchRestroomCityIndex('busan')).resolves.toEqual({
      total: 13,
      districts: { 사상구: 6, 수영구: 6, 동래구: 1 },
    });
  });

  it('treats a missing overlay index as an empty overlay', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ total: 5, districts: { 종로구: 5 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRestroomCityIndex('seoul')).resolves.toEqual({
      total: 5,
      districts: { 종로구: 5 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not silently omit the required Busan overlay index', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url === '/data/restrooms/busan/index.json'
        ? jsonResponse({ total: 5, districts: { 사상구: 5 } })
        : jsonResponse({}, 500)
    )));

    await expect(fetchRestroomCityIndex('busan')).rejects.toThrow(
      'restroom-address-points',
    );
  });
});

describe('fetchRestrooms', () => {
  const baseItem = {
    id: 'base-1',
    nm: '기존 화장실',
    lat: 35.1,
    lng: 129.1,
    addr: '부산광역시 사상구 기존로 1',
    isOpenAtNight: 'N' as const,
    hasBell: 'N' as const,
    male: 1,
    female: 1,
    type: '공중화장실',
  };
  const addressPoint = {
    ...baseItem,
    id: 'address-1',
    nm: '주소점 화장실',
    lat: 35.1005,
    coordinateKind: 'address_point',
  };

  it('merges unique overlay IDs and normalizes missing kinds', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/data/restrooms/busan/사상구.json') {
        return jsonResponse({ items: [baseItem] });
      }
      if (url === '/data/restroom-address-points/busan/사상구.json') {
        return jsonResponse({
          items: [
            addressPoint,
          ],
        });
      }
      return jsonResponse({}, 404);
    }));

    const result = await fetchRestrooms('busan', '사상구', 35.1, 129.1);

    expect(result).toHaveLength(2);
    expect(result.find(item => item.id === 'base-1')).toMatchObject({
      nm: '기존 화장실',
      coordinateKind: 'unknown',
    });
    expect(result.find(item => item.id === 'address-1')).toMatchObject({
      coordinateKind: 'address_point',
    });
    expect(result.map(item => item.distance)).toEqual([0, 0.1]);
  });

  it('rejects duplicate IDs instead of hiding an overlay contract violation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url === '/data/restrooms/busan/사상구.json'
        ? jsonResponse({ items: [baseItem] })
        : jsonResponse({ items: [{ ...baseItem, coordinateKind: 'address_point' }] })
    )));

    await expect(fetchRestrooms('busan', '사상구')).rejects.toThrow(
      '기본 좌표와 주소 대표점 ID가 중복됐습니다',
    );
  });

  it('treats a missing district overlay as empty', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [{ ...baseItem, coordinateKind: 'facility_point' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRestrooms('seoul', '종로구')).resolves.toEqual([
      { ...baseItem, coordinateKind: 'facility_point' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not silently omit a required Busan district overlay', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url === '/data/restrooms/busan/사상구.json'
        ? jsonResponse({ items: [baseItem] })
        : jsonResponse({}, 500)
    )));

    await expect(fetchRestrooms('busan', '사상구')).rejects.toThrow(
      'restroom-address-points',
    );
  });
});
