/**
 * 소비자 위해정보 동향 API 프록시
 * 
 * Routes:
 *   GET /api/consumer-hazard
 */

import { encodeServiceKey, parsePublicDataJson } from './publicData';

const BASE = 'https://apis.data.go.kr/B551919/open-api/harm/reception';

export async function handleConsumerHazard(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
    const serviceKey = encodeServiceKey(apiKey, 'CONSUMER_HAZARD_API_KEY');
    const qs = `serviceKey=${serviceKey}&pageNo=1&numOfRows=100&apiFormat=json`;
    const apiUrl = `${BASE}?${qs}`;

    const res = await fetch(apiUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Consumer Hazard API ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
    }

    const data = parsePublicDataJson(text, 'ConsumerHazard');
    return { data, cacheTtl: 86400 }; // 1일 캐시
}
