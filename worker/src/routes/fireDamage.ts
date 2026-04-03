/**
 * 소방청_지역별 화재피해 현황 API 프록시
 * Base: https://apis.data.go.kr/1661000/FireDamageStatus
 * 
 * 개별 화재 건별 상세 데이터 제공:
 * - 발생일자, 출동소방서, 사망/부상자, 재산피해(천원), 법정동주소
 */

const BASE = 'https://apis.data.go.kr/1661000/FireDamageStatus';

export async function handleFireDamage(
  url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const params = new URLSearchParams({ serviceKey: apiKey, resultType: 'json' });

  // 페이지네이션
  const pageNo = url.searchParams.get('pageNo') || '1';
  const numOfRows = url.searchParams.get('numOfRows') || '100';
  params.set('pageNo', pageNo);
  params.set('numOfRows', numOfRows);

  // 선택적 필터 파라미터 (API 활성화 후 정확한 파라미터명 확인 필요)
  for (const key of ['ocrnYmdhh', 'lawAddrName', 'gutFsttOgidNm']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }

  const res = await fetch(`${BASE}/getOcByregionFpcnd?${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`FireDamageStatus ${res.status}`);

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // XML fallback — 기본 구조 반환
    data = { response: { header: { resultMsg: 'PARSE_ERROR' }, body: { items: { item: [] }, totalCount: 0, numOfRows: 0, pageNo: 0 } } };
  }

  // 정상 응답 처리
  const header = data?.response?.header || data?.header || {};
  const body = data?.response?.body || data?.body || {};
  const rawItems = body?.items?.item || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const totalCount = Number(body?.totalCount) || 0;

  // 에러 응답 체크
  if (header.resultCode && header.resultCode !== '00') {
    return {
      data: {
        items: [],
        totalCount: 0,
        error: header.resultMsg || 'API 오류',
        errorCode: header.resultCode,
      },
      cacheTtl: 60,
    };
  }

  return {
    data: {
      items,
      totalCount,
      pageNo: Number(body.pageNo) || Number(pageNo),
      numOfRows: Number(body.numOfRows) || Number(numOfRows),
    },
    cacheTtl: 3600,
  };
}
