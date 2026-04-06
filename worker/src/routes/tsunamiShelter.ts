/**
 * 재난안전데이터포털 - 지진해일 긴급대피장소 API (DSSP-IF-10944) 프록시
 * 
 * GET /api/tsunami-shelter
 */

const BASE = 'https://www.safetydata.go.kr';
const DEFAULT_KEY = '5D5834I0Q3N1GT96'; // 사용자가 제공한 기본키

export async function handleTsunamiShelter(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = apiKey || DEFAULT_KEY;
  const ctprvnNm = url.searchParams.get('ctprvnNm') || '';
  const numOfRows = url.searchParams.get('numOfRows') || '1000'; // 대피소는 데이터가 많으므로 크게 잡음
  const pageNo = url.searchParams.get('pageNo') || '1';

  const qs = new URLSearchParams({
    serviceKey,
    numOfRows,
    pageNo,
  });

  // DSSP-IF-10944는 지역 필터를 지원하지 않는 경우가 많으므로 전수 조사를 위해 필터 제거
  // if (ctprvnNm) {
  //   qs.set('ctprvnNm', ctprvnNm);
  // }

  // SSL 오류 방지를 위해 http 시도 (safetydata는 보통 지원함)
  const apiUrl = `http://www.safetydata.go.kr/V2/api/DSSP-IF-10944?${qs}`;

  const res = await fetch(apiUrl);

  if (!res.ok) {
    throw new Error(`Tsunami Shelter API ${res.status}: ${res.statusText}`);
  }

  const data: any = await res.json();

  // DSSP 응답 구조 체크
  if (data?.header?.resultCode !== '00') {
    throw new Error(`Tsunami Shelter API error: ${data?.header?.resultMsg || 'Unknown error'}`);
  }

  // body 배열이 비어있을 수도 있으므로 안전하게 반환
  const items = data?.body || [];

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시 (자주 안바뀌는 데이터)
}
