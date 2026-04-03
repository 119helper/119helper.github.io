/**
 * 특정소방대상물 API 프록시
 * 
 * 1. 숙박시설 목록 조회: /api/fire-object/accom?ctprvn=서울&numOfRows=10
 *    End Point: https://apis.data.go.kr/1661000/SpecificFireObjectInfoService/getAccomList
 * 
 * 2. 소방시설(스프링클러) 정보: /api/fire-object/fire-sys?ctprvn=서울&numOfRows=10
 *    End Point: https://apis.data.go.kr/1661000/SpecificFireObjectFirefightingSysInfoService/getAccomFirefightingSysList
 */

const FIRE_OBJ_BASE = 'https://apis.data.go.kr/1661000';

export async function handleFireObject(
  path: string,
  url: URL,
  apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const ctpvNm = url.searchParams.get('ctpvNm') || url.searchParams.get('ctprvn') || '';
  const useAprvY = url.searchParams.get('useAprvY') || '';
  const numOfRows = url.searchParams.get('numOfRows') || '100';
  const pageNo = url.searchParams.get('pageNo') || '1';
  const resultType = 'JSON';

  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo,
    numOfRows,
    resultType,
  });
  if (ctpvNm) params.set('ctpvNm', ctpvNm);
  if (useAprvY) params.set('useAprvY', useAprvY);

  let apiUrl: string;

  switch (path) {
    case '/api/fire-object/accom':
      apiUrl = `${FIRE_OBJ_BASE}/SpecificFireObjectInfoService/getAccomList?${params}`;
      break;

    case '/api/fire-object/fire-sys':
      apiUrl = `${FIRE_OBJ_BASE}/SpecificFireObjectFirefightingSysInfoService/getAccomFirefightingSysList?${params}`;
      break;

    default:
      throw new Error(`Unknown fire-object route: ${path}`);
  }

  const res = await fetch(apiUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; 119-helper/1.0)',
      'Accept': 'application/json, application/xml, */*',
    },
  });

  if (!res.ok) throw new Error(`FireObject API ${res.status}`);

  const text = await res.text();

  // JSON 응답 시도
  if (text.trim().startsWith('{')) {
    try {
      const json: any = JSON.parse(text);
      const items = json?.response?.body?.items?.item || json?.response?.body?.items || [];
      const totalCount = json?.response?.body?.totalCount || 0;
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
