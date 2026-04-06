/**
 * 재난안전데이터포털 - 산불정보 API (DSSP-IF-10346) 프록시
 * 
 * GET /api/wildfire
 */

const BASE = 'https://www.safetydata.go.kr';
const DEFAULT_KEY = '60R7CGX9JR11RCL6';

export async function handleWildfire(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = apiKey || DEFAULT_KEY;
  const numOfRows = url.searchParams.get('numOfRows') || '200';
  const pageNo = url.searchParams.get('pageNo') || '1';

  const qs = new URLSearchParams({
    serviceKey,
    numOfRows,
    pageNo,
  });

  const apiUrl = `${BASE}/V2/api/DSSP-IF-10346?${qs}`;

  const res = await fetch(apiUrl, { 
    headers: { 'User-Agent': '119-helper-worker/1.0' }
  });

  if (!res.ok) {
    throw new Error(`Wildfire API ${res.status}: ${res.statusText}`);
  }

  const data: any = await res.json();

  if (data?.header?.resultCode !== '00') {
    throw new Error(`Wildfire API error: ${data?.header?.resultMsg}`);
  }

  return { data, cacheTtl: 300 }; // 5분 캐시
}
