/**
 * 산림청 국립산림과학원_산불위험예보정보 프록시
 *
 * GET /api/forest-fire-risk
 * Source: https://www.data.go.kr/data/15084817/openapi.do
 */

import { encodeServiceKey, fetchPublicDataText, parsePublicDataJson, pickItemsAndCount } from './publicData';

const BASE = 'https://apis.data.go.kr/1400377/forestPointV2';
const OPERATION = 'forestPointListGeongugSearchV2';

export async function handleForestFireRisk(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = encodeServiceKey(apiKey, 'FOREST_FIRE_API_KEY');
  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    pageNo: url.searchParams.get('pageNo') || '1',
    numOfRows: url.searchParams.get('numOfRows') || '1000',
    _type: 'json',
    excludeForecast: url.searchParams.get('excludeForecast') || '0',
  });

  const text = await fetchPublicDataText(`${BASE}/${OPERATION}?${params}`, 'ForestFireRisk');
  const data = parsePublicDataJson(text, 'ForestFireRisk');
  const { items, totalCount } = pickItemsAndCount(data);

  return {
    data: {
      items,
      totalCount,
      source: OPERATION,
      fetchedAt: new Date().toISOString(),
    },
    cacheTtl: 3600,
  };
}
