import { Env } from '../index';
import { jsonResponse, errorResponse, sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { encodeServiceKey, fetchWithTimeout, isRecord, errorMessage } from './publicData';

export async function handleEquipment(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/equipment', '');

  // 환경변수 확인
  if (!env.EQUIPMENT_API_KEY) {
    return errorResponse('EQUIPMENT_API_KEY is not configured in environment', request, 500);
  }

  try {
    let targetUrl: string;
    let allowedStringParams: string[];

    // 1. 소방장비 (차량 등) 인증 정보 조회
    if (path === '/cert') {
      targetUrl = 'http://apis.data.go.kr/B552486/opnFeqpmCtfcn/opnFeqpmCtfcn01';
      // 필수 파라미터: pageNo, numOfRows, fromAprv, toAprv
      allowedStringParams = ['fromAprv', 'toAprv'];
    }
    // 2. 소화기 정비번호 발급현황
    else if (path === '/extinguisher') {
      targetUrl = 'http://apis.data.go.kr/B552486/opnGcExsrImpmAply/opnGcExsrImpmAply01';
      // 필수 파라미터: pageNo, numOfRows, exsrImpmYr, exsrImpmNo
      allowedStringParams = ['exsrImpmYr', 'exsrImpmNo'];
    }
    else {
      return errorResponse('Not found API path under equipment.', request, 404);
    }

    // 공공데이터 요청을 위한 새로운 URLSearchParams 생성
    const params = new URLSearchParams();
    params.set('pageNo', sanitizeNumericParam(url, 'pageNo', 1, 1000, 1));
    params.set('numOfRows', sanitizeNumericParam(url, 'numOfRows', 1, 1000, 100));

    // 엔드포인트별 allowlist에 있는 조회 조건만 업스트림에 전달한다.
    for (const key of allowedStringParams) {
      const value = sanitizeStringParam(url, key, 30);
      if (value) params.set(key, value);
    }

    // URL 조립 — serviceKey는 이중 인코딩 방지를 위해 수동 concat
    const serviceKey = encodeServiceKey(env.EQUIPMENT_API_KEY, 'EQUIPMENT_API_KEY');
    const finalUrl = `${targetUrl}?serviceKey=${serviceKey}&${params.toString()}`;

    // Cloudflare Edge Cache: 1시간
    const cacheUrl = new Request(finalUrl, request);
    const cache = caches.default;
    let response = await cache.match(cacheUrl);

    if (!response) {
      const apiResponse = await fetchWithTimeout(finalUrl);

      if (!apiResponse.ok) {
        return errorResponse(`공공데이터 API 서버 오류: ${apiResponse.status}`, request, apiResponse.status);
      }

      // 1. 텍스트로 먼져 파싱 시도 (JSON 파싱 에러 방어)
      const respText = await apiResponse.text();
      let data: unknown;
      try {
        data = JSON.parse(respText);
      } catch {
        // 간혹 공공데이터는 에러일때 XML 뱉음
        if (respText.includes('<errMsg>')) {
          return errorResponse('요청 에러: API 키 또는 파라미터가 유효하지 않습니다.', request, 400);
        }
        return errorResponse('Invalid JSON response from Korean API', request, 502);
      }

      // 공공데이터 에러 응답 분기 처리 (기본 JSON일경우)
      if (isRecord(data)) {
        const header = isRecord(data.header) ? data.header : {};
        const resultCode = header.resultCode || data.resultCode;
        if (resultCode && resultCode !== '00') {
           // 00은 정상, 그 외는 모두 에러
           const msg = header.resultMsg || data.resultMsg || 'Unknown API Error';
           return errorResponse(`API Error: ${String(msg)}`, request, 400);
        }
      }

      // 2. 프론트엔드 호환 포맷으로 매핑
      // 공공데이터 API 응답구조 { data: [...], header: {totalCount: x} } 매핑
      let items: unknown = [];
      let totalCount: unknown = 0;

      if (isRecord(data) && Array.isArray(data.data)) {
        items = data.data;
        const header = isRecord(data.header) ? data.header : {};
        totalCount = header.totalCount || data.data.length;
      } else {
        // 혹시 다른 구조일 케이스 방어
        items = data;
      }

      // 프론트엔드 포맷 ({ items, totalCount })
      const mappedResponse = { items, totalCount };

      response = jsonResponse(mappedResponse, request);
      response.headers.set('Cache-Control', 'public, max-age=3600');
      
      // Edge Cache 저장
      if (apiResponse.ok) {
        await cache.put(cacheUrl, response.clone());
      }
    } else {
      // 캐시된 응답을 복제해 반환. CORS 헤더는 호출부(index.ts)의 applyCors가
      // 화이트리스트 기반으로 일괄 적용한다.
      response = new Response(response.body, response);
    }

    return response;

  } catch (err) {
    return errorResponse(`Server Error: ${errorMessage(err)}`, request, 500);
  }
}
