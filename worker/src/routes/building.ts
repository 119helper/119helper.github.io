/**
 * 건축물대장 API 프록시 (건축HUB 건축물대장정보 서비스)
 * Route: GET /api/building?sigunguCd=...&bjdongCd=...&platGbCd=...&bun=...&ji=...
 * 
 * End Point: https://apis.data.go.kr/1613000/BldRgstHubService
 * 응답 형식: XML (Hub 서비스는 JSON 미지원)
 */

export async function handleBuilding(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    sigunguCd: url.searchParams.get('sigunguCd') || '',
    bjdongCd: url.searchParams.get('bjdongCd') || '',
    platGbCd: url.searchParams.get('platGbCd') || '0',
    bun: (url.searchParams.get('bun') || '0').padStart(4, '0'),
    ji: (url.searchParams.get('ji') || '0').padStart(4, '0'),
    numOfRows: '5',
    pageNo: '1',
  });

  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params}`;
  const res = await fetch(apiUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; 119-helper/1.0)',
      'Accept': 'application/xml, text/xml, */*',
    },
  });
  
  if (!res.ok) throw new Error(`Building API ${res.status}`);
  
  // Hub 서비스는 XML 응답만 지원 — 간단한 XML 파싱
  const xml = await res.text();
  
  // 에러 체크
  const resultCode = xml.match(/<resultCode>(\d+)<\/resultCode>/)?.[1];
  if (resultCode && resultCode !== '00') {
    const resultMsg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1] || 'Unknown error';
    throw new Error(`Building API error: ${resultCode} ${resultMsg}`);
  }

  // <item>...</item> 블록 추출
  const items: Record<string, string>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item: Record<string, string> = {};
    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(match[1])) !== null) {
      item[tagMatch[1]] = tagMatch[2];
    }
    items.push(item);
  }

  return { data: items, cacheTtl: 86400 }; // 24시간 캐시
}
