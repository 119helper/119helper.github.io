/**
 * 재난안전데이터포털 - 민방위대피소 API (DSSP-IF-10166) 프록시
 * 
 * GET /api/civil-shelter
 */

import { isRecord, errorMessage, requireSecret } from './publicData';

export async function handleCivilShelter(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = requireSecret(apiKey, 'CIVIL_SHELTER_API_KEY');
  const pageNo = url.searchParams.get('pageNo') || '1';
  
  // DSSP-IF-10166는 지역 필터링(ctprvnNm)이 작동하지 않으므로, 한번에 많은 데이터를 가져갑니다.
  // 단, Cloudflare Worker Timeout (10초) 및 메모리 한계를 고려하여 너무 크지 않게 설정합니다.
  const numOfRows = url.searchParams.get('numOfRows') || '2000';

  const qs = new URLSearchParams({
    serviceKey,
    pageNo,
    numOfRows,
    returnType: 'JSON'
  });

  const apiUrl = `https://www.safetydata.go.kr/V2/api/DSSP-IF-10166?${qs}`;

  try {
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      }
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No response body');
      return { 
        data: { error: `API_HTTP_${res.status}`, message: res.statusText, detail: errorText.slice(0, 100) }, 
        cacheTtl: 0 
      };
    }

    const data: unknown = await res.json();

    const header = isRecord(data) && isRecord(data.header) ? data.header : {};
    if (header.resultCode && header.resultCode !== '00') {
      return {
        data: { error: `API_RESULT_${String(header.resultCode)}`, message: header.resultMsg || header.errorMsg || 'Unknown API Error' },
        cacheTtl: 0
      };
    }

    // data 구조 대응 (안전보건공단/공공데이터 등 구조 다양함)
    const body: unknown = isRecord(data) ? data.body : undefined;
    const first: unknown = Array.isArray(body) ? body[0] : undefined;
    const items =
      (isRecord(first) ? first.item : undefined)
      || (isRecord(body) ? body.item : undefined)
      || body
      || (isRecord(data) ? data.items : undefined)
      || [];

    const itemsArray = Array.isArray(items) ? items : [items];

    return { data: itemsArray, cacheTtl: 86400 };

  } catch (err) {
    return {
      data: { error: 'WORKER_FETCH_ERROR', message: errorMessage(err) },
      cacheTtl: 0
    };
  }
}
