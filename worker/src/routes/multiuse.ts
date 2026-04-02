/**
 * 다중이용업소 API 프록시
 * Route: GET /api/multiuse?ctprvnNm=경상북도&signguNm=포항시
 */

export async function handleMultiUse(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const ctprvnNm = url.searchParams.get('ctprvnNm') || '';
  const signguNm = url.searchParams.get('signguNm') || '';
  const numOfRows = url.searchParams.get('numOfRows') || '100';
  const pageNo = url.searchParams.get('pageNo') || '1';

  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo,
    numOfRows,
    type: 'json',
  });
  if (ctprvnNm) params.set('ctprvnNm', ctprvnNm);
  if (signguNm) params.set('signguNm', signguNm);

  const res = await fetch(
    `https://apis.data.go.kr/1661000/MultiUseFacilityInfoService/getMultiUseFacilityList?${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } }
  );
  if (!res.ok) throw new Error(`MultiUse API ${res.status}`);
  const json: any = await res.json();
  const items = json?.response?.body?.items || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
