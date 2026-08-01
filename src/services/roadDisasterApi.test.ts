import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRoadDisasters,
  StaleDataError,
  type RoadDisasterResponse,
} from './apiClient';
import { getNearbyRoadDisasters } from './roadDisasterApi';

vi.mock('./apiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    fetchRoadDisasters: vi.fn(),
  };
});

const RESPONSE: RoadDisasterResponse = {
  source: '국토교통부 국가교통정보센터',
  sourceUrl: 'https://its.go.kr/opendata/opendataList?service=disaster',
  retrievedAt: '2026-07-30T10:00:00.000Z',
  query: {
    lat: 35.1595,
    lng: 126.8526,
    radiusKm: 5,
    eventType: 'all',
    startDate: '20260730',
    endDate: '20260730',
    bounds: { minX: 126.8, maxX: 126.9, minY: 35.1, maxY: 35.2 },
  },
  totalCount: 0,
  truncated: false,
  items: [],
  sources: [],
  messageCandidates: [],
  messageCandidatesTruncated: false,
  verificationLinks: [],
};

describe('roadDisasterApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns fresh data without a stale marker', async () => {
    vi.mocked(fetchRoadDisasters).mockResolvedValue(RESPONSE);
    await expect(getNearbyRoadDisasters(35.1595, 126.8526, 5, false, {
      regionName: '광주광역시',
      districtName: '서구',
    })).resolves.toEqual({
      data: RESPONSE,
      staleAt: null,
    });
    expect(fetchRoadDisasters).toHaveBeenCalledWith(35.1595, 126.8526, 5, false, {
      regionName: '광주광역시',
      districtName: '서구',
    });
  });

  it('returns only the bounded stale cache and exposes its timestamp', async () => {
    const cachedAt = Date.now() - 5 * 60 * 1000;
    vi.mocked(fetchRoadDisasters).mockRejectedValue(
      new StaleDataError(RESPONSE, 'network unavailable', cachedAt),
    );
    await expect(getNearbyRoadDisasters(35.1595, 126.8526)).resolves.toEqual({
      data: RESPONSE,
      staleAt: cachedAt,
    });
  });

  it('rejects Worker LKG data older than ten minutes', async () => {
    vi.mocked(fetchRoadDisasters).mockRejectedValue(
      new StaleDataError(RESPONSE, 'network unavailable', Date.now() - 11 * 60 * 1000),
    );
    await expect(getNearbyRoadDisasters(35.1595, 126.8526)).rejects.toThrow('너무 오래되어');
  });

  it('does not turn a missing Worker secret into a false no-hazard result', async () => {
    vi.mocked(fetchRoadDisasters).mockRejectedValue(new Error('ITS_API_KEY is not configured'));
    await expect(getNearbyRoadDisasters(35.1595, 126.8526)).rejects.toThrow('ITS_API_KEY');
  });
});
