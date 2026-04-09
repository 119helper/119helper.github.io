/**
 * 뉴스 RSS 프록시 (Google News / 소방청 korea.kr)
 * 
 * Google News RSS는 Cloudflare Worker IP를 자주 차단하므로:
 * 1. 성공 시 KV(또는 메모리) 캐시에 저장
 * 2. 실패 시 이전 캐시를 반환 (stale-while-revalidate)
 * 3. 캐시 TTL을 넉넉하게 (1시간)
 * 
 * Route: GET /api/news?type=google&query=소방관
 *        GET /api/news?type=nfa
 */

// 메모리 캐시 (Worker instance 수명 동안 유지)
const newsMemCache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1시간
const STALE_TTL = 6 * 60 * 60 * 1000; // 6시간 (stale 허용)

export async function newsHandler(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'google';
  const query = url.searchParams.get('query') || '소방관';

  // 캐시 키 생성
  const cacheKey = `news:${type}:${query}`;

  // 1. 메모리 캐시 체크 (fresh)
  const cached = newsMemCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return xmlResponse(cached.text);
  }

  // 2. 원본 RSS 가져오기 시도
  try {
    let rssUrl = '';
    if (type === 'nfa') {
      rssUrl = 'https://www.korea.kr/rss/dept_nfa.xml';
    } else {
      rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    }
    
    let xmlText = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8초 타임아웃

    try {
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google RSS fetch failed: ${response.status}`);
      }

      xmlText = await response.text();

      // 빈 응답 또는 너무 짧은 응답 체크
      if (!xmlText || xmlText.length < 100 || !xmlText.includes('<item>')) {
        throw new Error('Empty or invalid Google RSS response');
      }
    } catch (googleError: any) {
      console.warn(`[news] Google fetch failed:`, googleError.message, `trying Bing fallback...`);
      clearTimeout(timeout);
      
      // Fallback to Bing News RSS
      const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
      const bingController = new AbortController();
      const bingTimeout = setTimeout(() => bingController.abort(), 8000);
      
      const bingResponse = await fetch(bingUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: bingController.signal,
      });
      
      clearTimeout(bingTimeout);
      
      if (!bingResponse.ok) {
        throw new Error(`Fallback Bing RSS fetch failed: ${bingResponse.status}`);
      }
      
      xmlText = await bingResponse.text();
      
      if (!xmlText || xmlText.length < 100 || !xmlText.includes('<item>')) {
        throw new Error('Empty or invalid Fallback Bing RSS response');
      }
    }

    // 성공 → 캐시 갱신
    newsMemCache.set(cacheKey, { text: xmlText, ts: Date.now() });

    return xmlResponse(xmlText);

  } catch (error: any) {
    console.error(`[news] ${cacheKey} error:`, error.message);

    // 3. 실패 시 stale 캐시 반환
    if (cached && Date.now() - cached.ts < STALE_TTL) {
      console.log(`[news] Serving stale cache for ${cacheKey}`);
      return xmlResponse(cached.text);
    }

    // 4. 캐시도 없으면 빈 RSS 반환 (프론트에서 "뉴스 없음" 표시)
    return xmlResponse(emptyRss(query), true);
  }
}

function xmlResponse(body: string, isError: boolean = false): Response {
  return new Response(body, {
    status: isError ? 503 : 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isError ? 'no-store, no-cache, must-revalidate' : 'public, max-age=1800', // 에러 시 캐시 방지
    },
  });
}

function emptyRss(query: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${query} - 뉴스</title>
    <description>검색 결과 없음</description>
  </channel>
</rss>`;
}
