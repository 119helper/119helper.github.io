/**
 * 건축물대장 API 프록시 (건축HUB 건축물대장정보 서비스)
 * Route: GET /api/building?sigunguCd=...&bjdongCd=...&platGbCd=...&bun=...&ji=...
 * 
 * End Point: https://apis.data.go.kr/1613000/BldRgstHubService
 * 응답 형식: XML (Hub 서비스는 JSON 미지원)
 */

import { fetchWithTimeout } from './publicData';

function sanitizeDigits(value: string | null, length: number, fallback: string): string {
  const trimmed = value?.trim() || '';
  return new RegExp(`^\\d{1,${length}}$`).test(trimmed) ? trimmed.padStart(length, '0') : fallback;
}

function sanitizeExactDigits(value: string | null, length: number): string {
  const trimmed = value?.trim() || '';
  return new RegExp(`^\\d{${length}}$`).test(trimmed) ? trimmed : '';
}

function sanitizePlatGbCd(value: string | null): string {
  const trimmed = value?.trim() || '0';
  return ['0', '1', '2'].includes(trimmed) ? trimmed : '0';
}

export async function handleBuilding(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    sigunguCd: sanitizeExactDigits(url.searchParams.get('sigunguCd'), 5),
    bjdongCd: sanitizeExactDigits(url.searchParams.get('bjdongCd'), 5),
    platGbCd: sanitizePlatGbCd(url.searchParams.get('platGbCd')),
    bun: sanitizeDigits(url.searchParams.get('bun'), 4, '0000'),
    ji: sanitizeDigits(url.searchParams.get('ji'), 4, '0000'),
    numOfRows: '5',
    pageNo: '1',
  });

  const apiUrl = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params}`;
  const res = await fetchWithTimeout(apiUrl, {
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
