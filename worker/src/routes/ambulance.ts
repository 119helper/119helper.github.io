/**
 * 사설 구급차 API 프록시
 * 
 * Routes:
 *   GET /api/ambulance?Q0=서울특별시
 */

const BASE = 'https://apis.data.go.kr/B552657/AmblInfoInqireService';

export async function handleAmbulance(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
    const sido = url.searchParams.get('Q0') || '서울특별시';
    const qs = `serviceKey=${apiKey}&pageNo=1&numOfRows=1000&Q0=${encodeURIComponent(sido)}`;
    const apiUrl = `${BASE}/getAmblListInfoInqire?${qs}`;
    
    const res = await fetch(apiUrl, { headers: { 'User-Agent': '119-helper-worker/1.0' } });
    if (!res.ok) {
        throw new Error(`Ambulance API failed with status ${res.status}`);
    }
    
    const text = await res.text();
    return { data: { xml: text }, cacheTtl: 86400 }; // 1일 캐시
}
