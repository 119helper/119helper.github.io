/**
 * 소비자 위해정보 동향 API 프록시
 * 
 * Routes:
 *   GET /api/consumer-hazard
 */

const BASE = 'https://apis.data.go.kr/B551919/open-api/harm/reception';

export async function handleConsumerHazard(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
    const qs = `serviceKey=${apiKey}&pageNo=1&numOfRows=100&apiFormat=json`;
    const apiUrl = `${BASE}?${qs}`;
    
    const res = await fetch(apiUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
    if (!res.ok) {
        throw new Error(`Consumer Hazard API failed with status ${res.status}`);
    }
    
    const data = await res.json();
    return { data, cacheTtl: 86400 }; // 1일 캐시
}
