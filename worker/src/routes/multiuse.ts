/**
 * 다중이용업소 API 프록시 (소방청_다중이용업소 현황)
 * Route: GET /api/multiuse?page=1&perPage=100
 * 
 * 실제 엔드포인트: api.odcloud.kr (공공데이터포털 odcloud)
 * 데이터: 연도별 소방본부별 다중이용업소 현황 (2019/2023/2024)
 * 
 * Swagger: https://infuser.odcloud.kr/oas/docs?namespace=15066545/v1
 */

// 연도별 UDDI 엔드포인트
const MULTIUSE_ENDPOINTS: Record<string, string> = {
  '2024': 'uddi:68611b5a-b208-436c-9e32-990df1907bfe',  // 20240101
  '2023': 'uddi:f5d6c40d-88ad-43fb-9793-b9b4e6a47230',  // 20230101
  '2019': 'uddi:fb23ce80-a55f-45e5-89fe-966c42e67c97',  // 20191231
};

export async function handleMultiUse(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const year = url.searchParams.get('year') || '2024';
  const page = url.searchParams.get('page') || url.searchParams.get('pageNo') || '1';
  const perPage = url.searchParams.get('perPage') || url.searchParams.get('numOfRows') || '100';

  const uddi = MULTIUSE_ENDPOINTS[year] || MULTIUSE_ENDPOINTS['2024'];

  const params = new URLSearchParams({
    serviceKey: apiKey,
    page,
    perPage,
  });

  const res = await fetch(
    `https://api.odcloud.kr/api/15066545/v1/${uddi}?${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  if (!res.ok) throw new Error(`MultiUse API ${res.status}`);
  const json: any = await res.json();

  // odcloud 응답 형식: { currentCount, data: [...], matchCount, page, perPage, totalCount }
  const items = json?.data || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
