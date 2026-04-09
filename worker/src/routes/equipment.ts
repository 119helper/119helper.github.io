import { Env } from '../index';
import { jsonResponse, errorResponse } from '../middleware/cors';

export async function handleEquipment(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/equipment', '');

  // 공통 Query 파라미터 (프론트엔드에서 넘어온 파라미터들)
  const searchParams = new URLSearchParams(url.search);

  // 환경변수 확인
  if (!env.EQUIPMENT_API_KEY) {
    return errorResponse('EQUIPMENT_API_KEY is not configured in environment', request, 500);
  }

  try {
    let targetUrl: string;
    let requiredParams: string[] = [];

    // 1. 소방장비 (차량 등) 인증 정보 조회
    if (path === '/cert') {
      targetUrl = 'http://apis.data.go.kr/B552486/opnFeqpmCtfcn/opnFeqpmCtfcn01';
      requiredParams = ['pageNo', 'numOfRows', 'fromAprv', 'toAprv']; // 필수 파라미터
    }
    // 2. 소화기 정비번호 발급현황
    else if (path === '/extinguisher') {
      targetUrl = 'http://apis.data.go.kr/B552486/opnGcExsrImpmAply/opnGcExsrImpmAply01';
      requiredParams = ['pageNo', 'numOfRows', 'exsrImpmYr', 'exsrImpmNo']; // 필수 파라미터
    }
    else {
      return errorResponse('Not found API path under equipment.', request, 404);
    }

    // 공공데이터 요청을 위한 새로운 URLSearchParams 생성
    const params = new URLSearchParams();
    // 발급받은 API 키 그대로 주입
    params.append('serviceKey', env.EQUIPMENT_API_KEY);

    // 전달받은 모든 인자들을 공공데이터 포털 형식에 맞게 복사 (serviceKey 제외)
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    // URL 조립
    const finalUrl = `${targetUrl}?${params.toString()}`;

    // Cloudflare Edge Cache: 1시간
    const cacheUrl = new Request(finalUrl, request);
    const cache = caches.default;
    let response = await cache.match(cacheUrl);

    if (!response) {
      const apiResponse = await fetch(finalUrl);

      if (!apiResponse.ok) {
        return errorResponse(`공공데이터 API 서버 오류: ${apiResponse.status}`, request, apiResponse.status);
      }

      // 1. 텍스트로 먼져 파싱 시도 (JSON 파싱 에러 방어)
      const respText = await apiResponse.text();
      let data: any;
      try {
        data = JSON.parse(respText);
      } catch (e) {
        // 간혹 공공데이터는 에러일때 XML 뱉음
        if (respText.includes('<errMsg>')) {
          return errorResponse('요청 에러: API 키 또는 파라미터가 유효하지 않습니다.', request, 400);
        }
        return errorResponse('Invalid JSON response from Korean API', request, 502);
      }

      // 공공데이터 에러 응답 분기 처리 (기본 JSON일경우)
      if (data && typeof data === 'object') {
        const resultCode = data.header?.resultCode || data.resultCode;
        if (resultCode && resultCode !== '00') {
           // 00은 정상, 그 외는 모두 에러
           const msg = data.header?.resultMsg || data.resultMsg || 'Unknown API Error';
           return errorResponse(`API Error: ${msg}`, request, 400);
        }
      }

      // 2. 프론트엔드 호환 포맷으로 매핑
      // 공공데이터 API 응답구조 { data: [...], header: {totalCount: x} } 매핑
      let items = [];
      let totalCount = 0;

      if (data.data && Array.isArray(data.data)) {
        items = data.data;
        totalCount = data.header?.totalCount || items.length;
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
      // 캐시된 응답에 CORS 등 최신 헤더 적용 
      response = new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    return response;

  } catch (err: any) {
    return errorResponse(`Server Error: ${err.message}`, request, 500);
  }
}
