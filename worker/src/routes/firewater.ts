/**
 * 소방용수시설 API 프록시 (전국소방용수시설표준데이터)
 * Route: GET /api/firewater?city=서울특별시
 */

export async function handleFireWater(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const city = url.searchParams.get('city') || '서울특별시';
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: '1',
    numOfRows: '50000',
    type: 'json',
    ctprvnNm: city,
  });

  const res = await fetch(
    `https://api.data.go.kr/openapi/tn_pubr_public_ffus_wtrcns_api?${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  if (!res.ok) throw new Error(`FireWater API ${res.status}`);
  const json: any = await res.json();
  const items = json?.response?.body?.items || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
