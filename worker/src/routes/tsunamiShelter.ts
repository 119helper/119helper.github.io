/**
 * 재난안전데이터포털 - 지진해일 긴급대피장소 API (DSSP-IF-10944) 프록시
 * 
 * GET /api/tsunami-shelter
 */

import { fetchSafetydataJson } from './safetydata';
import { isRecord, errorMessage, requireSecret } from './publicData';
import { sanitizeNumericParam } from '../middleware/cors';

export async function handleTsunamiShelter(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = requireSecret(apiKey, 'TSUNAMI_SHELTER_API_KEY');
  // ctprvnNm 필터링은 DSSP-IF-10944에서 미지원하여 제거됨
  const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 500, 200); // 1000개 요청 시 정부 서버 지연이 심해 200개로 축소
  const pageNo = sanitizeNumericParam(url, 'pageNo', 1, 1000, 1);

  const qs = new URLSearchParams({
    serviceKey,
    numOfRows,
    pageNo,
  });

  // DSSP-IF-10944는 지역 필터를 지원하지 않는 경우가 많으므로 전수 조사를 위해 필터 제거
  // if (ctprvnNm) {
  //   qs.set('ctprvnNm', ctprvnNm);
  // }

  // SSL 이슈가 있을 수 있어 https와 http를 신중히 선택.
  // Wildfire가 성공한 것과 동일한 설정을 사용하되 더 견고하게 구성.
  try {
    const data = await fetchSafetydataJson('/V2/api/DSSP-IF-10944', qs, {
      label: 'TsunamiShelter API',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const header = isRecord(data) && isRecord(data.header) ? data.header : {};
    if (header.resultCode !== '00') {
      return {
        data: { error: `API_RESULT_${String(header.resultCode ?? '')}`, message: header.resultMsg ?? 'Unknown API Error' },
        cacheTtl: 0
      };
    }

    const items = (isRecord(data) ? data.body : undefined) ?? [];
    return { data: items, cacheTtl: 86400 };
  } catch (err) {
    return {
      data: { error: 'WORKER_FETCH_FAILED', message: errorMessage(err) },
      cacheTtl: 0
    };
  }
}
