/**
 * 사설 구급차 API 프록시
 * 
 * Routes:
 *   GET /api/ambulance?Q0=서울특별시
 */

import { encodeServiceKey, fetchPublicDataText, findPublicDataError } from './publicData';

const BASE = 'https://apis.data.go.kr/B552657/AmblInfoInqireService';

export async function handleAmbulance(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
    const sido = url.searchParams.get('Q0') || '서울특별시';
    const serviceKey = encodeServiceKey(apiKey, 'AMBULANCE_API_KEY');
    const qs = `serviceKey=${serviceKey}&pageNo=1&numOfRows=1000&Q0=${encodeURIComponent(sido)}`;
    const apiUrl = `${BASE}/getAmblListInfoInqire?${qs}`;

    const text = await fetchPublicDataText(apiUrl, 'Ambulance');
    const upstreamError = findPublicDataError(text);
    if (upstreamError) throw new Error(`Ambulance: ${upstreamError}`);

    return { data: { xml: text }, cacheTtl: 86400 }; // 1일 캐시
}
