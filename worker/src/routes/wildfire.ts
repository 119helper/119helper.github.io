/**
 * 재난안전데이터포털 - 산불정보 API (DSSP-IF-10346) 프록시
 * 
 * GET /api/wildfire
 */

import { fetchSafetydataJson } from './safetydata';
import { isRecord } from './publicData';

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

  const data = await fetchSafetydataJson('/V2/api/DSSP-IF-10346', qs, { label: 'Wildfire API' });

  const header = isRecord(data) && isRecord(data.header) ? data.header : {};
  if (header.resultCode !== '00') {
    throw new Error(`Wildfire API error: ${String(header.resultMsg ?? '')}`);
  }

  return { data, cacheTtl: 300 }; // 5분 캐시
}
