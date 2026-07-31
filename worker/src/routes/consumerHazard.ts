/**
 * 소비자 위해정보 동향 API 프록시
 * 
 * Routes:
 *   GET /api/consumer-hazard
 */

import { encodeServiceKey, fetchPublicDataText, parsePublicDataJson } from './publicData';
import { sanitizeNumericParam } from '../middleware/cors';

const BASE = 'https://apis.data.go.kr/B551919/open-api/harm/reception';

export async function handleConsumerHazard(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
    const serviceKey = encodeServiceKey(apiKey, 'CONSUMER_HAZARD_API_KEY');
    const pageNo = sanitizeNumericParam(url, 'pageNo', 1, 100, 1);
    const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 1000, 100);
    const qs = `serviceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${numOfRows}&apiFormat=json`;
    const apiUrl = `${BASE}?${qs}`;

    const text = await fetchPublicDataText(apiUrl, 'Consumer Hazard');
    const data = parsePublicDataJson(text, 'ConsumerHazard');
    return { data, cacheTtl: 86400 }; // 1일 캐시
}
