/**
 * 행정안전부 긴급재난문자 API 프록시
 * 
 * Route: GET /api/disaster-msg
 */

import { fetchSafetydataJson } from './safetydata';
import { isRecord } from './publicData';

export async function handleDisasterMsg(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = apiKey || 'X46QXE6KR1HU0RTN';
  const pageNo = url.searchParams.get('pageNo') || '1';
  const numOfRows = url.searchParams.get('numOfRows') || '20';
  
  const params = new URLSearchParams({
    serviceKey,
    returnType: 'json',
    numOfRows,
    pageNo,
  });

  const json = await fetchSafetydataJson('/V2/api/DSSP-IF-00247', params, { label: 'DisasterMsg API' });
  const items = (isRecord(json) ? json.body : undefined) ?? [];

  // 캐시: 재난문자는 비교적 실시간성이 중요하지만, API 호출 제한 방지를 위해 3분 캐시
  return { data: items, cacheTtl: 180 };
}
