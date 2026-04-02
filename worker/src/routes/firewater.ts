/**
 * 소방용수시설 API 프록시
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
    `https://apis.data.go.kr/1661000/FireFacilityInfoService/getFireWterinfoList?${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  if (!res.ok) throw new Error(`FireWater API ${res.status}`);
  const json: any = await res.json();
  const items = json?.response?.body?.items || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
