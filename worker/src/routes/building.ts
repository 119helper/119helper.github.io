/**
 * 건축물대장 API 프록시
 * Route: GET /api/building?sigunguCd=...&bjdongCd=...&platGbCd=...&bun=...&ji=...
 */

export async function handleBuilding(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    sigunguCd: url.searchParams.get('sigunguCd') || '',
    bjdongCd: url.searchParams.get('bjdongCd') || '',
    platGbCd: url.searchParams.get('platGbCd') || '0',
    bun: (url.searchParams.get('bun') || '0').padStart(4, '0'),
    ji: (url.searchParams.get('ji') || '0').padStart(4, '0'),
    numOfRows: '5',
    pageNo: '1',
    type: 'json',
  });

  const res = await fetch(
    `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  if (!res.ok) throw new Error(`Building API ${res.status}`);
  const json: any = await res.json();
  const items = json?.response?.body?.items?.item || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
