/**
 * 특정소방대상물 API 프록시
 * 
 * 1. 숙박시설 목록 조회: /api/fire-object/accom?ctprvn=서울&numOfRows=10
 *    End Point: https://apis.data.go.kr/1661000/SpecificFireObjectInfoService/getAccomList
 * 
 * 2. 소방시설(스프링클러) 정보: /api/fire-object/fire-sys?ctprvn=서울&numOfRows=10
 *    End Point: https://apis.data.go.kr/1661000/SpecificFireObjectFirefightingSysInfoService/getAccomFirefightingSysList
 */

import { encodeServiceKey, findPublicDataError, coerceEnvelope, fetchWithTimeout, isRecord } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';

const FIRE_OBJ_BASE = 'https://apis.data.go.kr/1661000';

export async function handleFireObject(
  path: string,
  url: URL,
  apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const ctpvNm = sanitizeStringParam(url, 'ctpvNm', 30) || sanitizeStringParam(url, 'ctprvn', 30) || '';
  const rawUseAprvY = sanitizeStringParam(url, 'useAprvY', 4) || '';
  const useAprvY = /^\d{4}$/.test(rawUseAprvY) ? rawUseAprvY : '';
  const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 1000, 100);
  const pageNo = sanitizeNumericParam(url, 'pageNo', 1, 1000, 1);
  const resultType = 'JSON';

  const serviceKey = encodeServiceKey(apiKey, 'FIRE_OBJECT_API_KEY');
  const params = new URLSearchParams({
    pageNo,
    numOfRows,
    resultType,
  });
  if (ctpvNm) params.set('ctpvNm', ctpvNm);
  if (useAprvY) params.set('useAprvY', useAprvY);

  let apiUrl: string;

  switch (path) {
    case '/api/fire-object/accom':
      apiUrl = `${FIRE_OBJ_BASE}/SpecificFireObjectInfoService/getAccomList?serviceKey=${serviceKey}&${params}`;
      break;

    case '/api/fire-object/fire-sys':
      apiUrl = `${FIRE_OBJ_BASE}/SpecificFireObjectFirefightingSysInfoService/getAccomFirefightingSysList?serviceKey=${serviceKey}&${params}`;
      break;

    default:
      throw new Error(`Unknown fire-object route: ${path}`);
  }

  const res = await fetchWithTimeout(apiUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; 119-helper/1.0)',
      'Accept': 'application/json, application/xml, */*',
    },
  });

  if (!res.ok) throw new Error(`FireObject API ${res.status}`);

  const text = await res.text();

  // 게이트웨이/서비스 에러 표면화 (키 미등록·미승인·한도초과 등)
  const upstreamError = findPublicDataError(text);
  if (upstreamError) throw new Error(`FireObject: ${upstreamError}`);

  // JSON 응답 시도
  if (text.trim().startsWith('{')) {
    try {
      const json = coerceEnvelope(JSON.parse(text));
      const itemsField = json.response?.body?.items;
      const items = (isRecord(itemsField) ? itemsField.item : undefined) || itemsField || [];
      const totalCount = json.response?.body?.totalCount || 0;
      return { data: { items: Array.isArray(items) ? items : [items], totalCount }, cacheTtl: 86400 };
    } catch { /* JSON 파싱 실패 → XML로 fallback */ }
  }

  // XML 응답 파싱
  const resultCode = text.match(/<resultCode>(\d+)<\/resultCode>/)?.[1];
  if (resultCode && resultCode !== '00') {
    const resultMsg = text.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1] || 'Unknown error';
    throw new Error(`FireObject API error: ${resultCode} ${resultMsg}`);
  }

  const items: Record<string, string>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const item: Record<string, string> = {};
    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(match[1])) !== null) {
      item[tagMatch[1]] = tagMatch[2];
    }
    items.push(item);
  }

  const totalCount = text.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] || '0';
  return { data: { items, totalCount: parseInt(totalCount) }, cacheTtl: 86400 };
}
