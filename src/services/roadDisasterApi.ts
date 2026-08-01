import {
  fetchRoadDisasters,
  getStaleAt,
  isStaleDataError,
  type RoadDisasterResponse,
} from './apiClient';

const MAX_ROAD_DISASTER_STALE_MS = 10 * 60 * 1000;

export interface RoadDisasterLoadResult {
  data: RoadDisasterResponse;
  staleAt: number | null;
}

/**
 * 실시간 조회 실패 시에도 apiClient가 허용한 10분 이내 캐시만 돌려준다.
 * 호출부는 staleAt을 반드시 표시해 오래된 통제를 현재 정보로 오인하지 않게 한다.
 */
export async function getNearbyRoadDisasters(
  lat: number,
  lng: number,
  radiusKm = 5,
  forceRefresh = false,
  scope?: { regionName?: string; districtName?: string },
): Promise<RoadDisasterLoadResult> {
  try {
    const data = await fetchRoadDisasters(lat, lng, radiusKm, forceRefresh, scope);
    return { data, staleAt: getStaleAt(data) };
  } catch (error) {
    if (!isStaleDataError(error)) throw error;
    if (
      !Number.isFinite(error.cachedAt)
      || error.cachedAt <= 0
      || Date.now() - error.cachedAt > MAX_ROAD_DISASTER_STALE_MS
    ) {
      throw new Error(
        '도로 재난 정보가 너무 오래되어 현장 브리핑에 표시할 수 없습니다.',
        { cause: error },
      );
    }
    return {
      data: error.cachedData as RoadDisasterResponse,
      staleAt: error.cachedAt,
    };
  }
}
