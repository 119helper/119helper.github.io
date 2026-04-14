/**
 * 뉴스 데이터 프록시 (Naver News API / Google News / Bing News)
 * 
 * 1. Naver API Key가 있으면 최우선으로 Naver API 사용 (결과를 기존 프론트와 호환되게 XML로 변환)
 * 2. 실패 시 Google News RSS -> Bing News RSS 폴백 방식을 취함
 * 3. 성공 시 KV(NEWS_CACHE)에 저장
 * 4. 실패 시 KV의 만료된(stale) 데이터라도 반환 (고가용성)
 */

const CACHE_TTL = 60 * 60; // 1시간 (KV 만료 기본 단위 초)
const STALE_TTL = 6 * 60 * 60; // 6시간 동안은 실패 시 과거 데이터라도 반환

export async function newsHandler(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'google';
  const query = url.searchParams.get('query') || '소방관';

  return await getNewsWithCache(type, query, env, false);
}

// Cron Trigger에서 주기적으로 호출하기 위한 프리패치 함수
export async function prefetchNews(env: any) {
  // 프리패치 할 기본 검색어: "소방" (화재 OR 구조 OR 구급 OR 재난)
  const defaultQuery = '"소방" (화재 OR 구조 OR 구급 OR 재난)';
  console.log('[news] Running cron prefetch for query:', defaultQuery);
  try {
    // force fetch by skipping cache read
    await getNewsWithCache('google', defaultQuery, env, true);
    console.log('[news] Cron prefetch success');
  } catch (err: any) {
    console.error('[news] Cron prefetch error:', err.message);
  }
}

async function getNewsWithCache(type: string, query: string, env: any, forceFetch: boolean): Promise<Response> {
  // 캐시 키 버전을 v4 등으로 올려서 이전 데이터(이미지 없는 데이터) 캐시를 즉시 무효화
  const CACHE_PREFIX = 'news:v5:';
  const cacheKey = `${CACHE_PREFIX}${type}:${query}`;
  const kv = env.NEWS_CACHE; // binding from wrangler.toml

  // 1. KV 캐시 확인
  if (!forceFetch && kv) {
    const cachedData = await kv.get(cacheKey, 'json');
    if (cachedData) {
      const { text, ts } = cachedData as { text: string; ts: number };
      const ageMs = Date.now() - ts;
      
      // 1시간 이내의 싱싱한 데이터면 즉시 반환
      if (ageMs < CACHE_TTL * 1000) {
        return xmlResponse(text);
      }
    }
  }

  let xmlText = '';

  try {
    // 2. Fetch 뉴스 데이터
    if (type === 'nfa') {
      xmlText = await fetchRss('https://www.korea.kr/rss/dept_nfa.xml');
    } else {
      // 우선 Naver API 시도
      if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
        try {
          xmlText = await fetchNaverAsXml(query, env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET);
        } catch (naverErr: any) {
          console.warn(`[news] Naver API failed: ${naverErr?.message}. Falling back to Bing News.`);
          xmlText = await fetchBingNewsFallback(query);
        }
      } else {
        xmlText = await fetchBingNewsFallback(query);
      }
    }

    // --- Og:Image 썸네일 병렬 추출 (모든 RSS 포맷 통합) ---
    try {
      xmlText = await enhanceRssWithImages(xmlText);
    } catch (ogErr) {
      console.warn(`[news] Og:image extraction failed, proceeding with original XML:`, ogErr);
    }

    // 성공 → KV 저장
    if (kv && xmlText) {
      // KV put with expirationTtl so it auto cleans up (e.g. 24h)
      await kv.put(cacheKey, JSON.stringify({ text: xmlText, ts: Date.now() }), { expirationTtl: 86400 });
    }

    return xmlResponse(xmlText);

  } catch (error: any) {
    console.error(`[news] Fetch error for ${cacheKey}:`, error.message);

    // 3. 완전히 실패한 경우, KV에 오래된(stale) 데이터라도 있는지 확인
    if (kv) {
      const cachedData = await kv.get(cacheKey, 'json');
      if (cachedData) {
        const { text, ts } = cachedData as { text: string; ts: number };
        if (Date.now() - ts < STALE_TTL * 1000) {
          console.log(`[news] Serving stale KV cache for ${cacheKey}`);
          return xmlResponse(text);
        }
      }
    }

    return xmlResponse(emptyRss(query), true);
  }
}

async function fetchBingNewsFallback(query: string): Promise<string> {
  try {
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    return await fetchRss(bingUrl);
  } catch (err: any) {
    console.warn(`[news] Bing fetch failed:`, err.message, `trying Google fallback...`);
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    return await fetchRss(googleUrl);
  }
}

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const text = await response.text();
  if (!text || text.length < 100 || !text.includes('<item>')) {
    throw new Error('Empty or invalid RSS response');
  }

  return text;
}

// 썸네일 URL(Og:Image)만 1.5초 내로 빠르게 훔쳐오는 스크래퍼
async function fetchOgImage(link: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    if (!res.ok) return '';
    
    const html = await res.text();
    // meta og:image 추출 정규식 (줄바꿈 허용, 순서 무관)
    const match = html.match(/<meta[^>]*?property=["']og:image["'][^>]*?content=["']([^"']+)["']/i) || 
                  html.match(/<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:image["']/i) ||
                  html.match(/<meta[^>]*?name=["']twitter:image["'][^>]*?content=["']([^"']+)["']/i);
    return match ? match[1] : '';
  } catch(e) {
    return '';
  }
}

// 생성되거나 파싱된 XML의 <item> 속 <link>들을 추적해 <imageUrl> 태그를 박아넣는 함수 (병렬 처리)
async function enhanceRssWithImages(xml: string): Promise<string> {
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  const items = xml.match(itemRegex);
  if (!items) return xml;

  const enhancedItems = await Promise.all(items.map(async (itemXml, index) => {
    // 1. Bing News의 <News:Image> 태그가 이미 존재하면 즉시 사용
    const bingImageMatch = itemXml.match(/<News:Image>([^<]+)<\/News:Image>/i);
    if (bingImageMatch) {
       return itemXml.replace(/<\/item>/i, `  <imageUrl><![CDATA[${bingImageMatch[1]}]]></imageUrl>\n    </item>`);
    }

    // Cloudflare Workers has a strict limit of 50 subrequests per invocation (on the free plan).
    // RSS feeds might contain up to 100 items. We limit image fetching to the top 15 items
    // which protects the worker from crashing with HTTP 500 Subrequest limit error.
    if (index >= 15) return itemXml;

    // originallink가 있으면 그것을, 없으면 link를 사용 (네이버용)
    const originalLinkMatch = itemXml.match(/<originallink[^>]*>([^<]+)<\/originallink>/i);
    const linkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
    
    let targetLink = '';
    // Priority: If link contains naver.com, use it (extremely fast and standard). Otherwise fallback to originallink, then link.
    const linkUrl = linkMatch ? linkMatch[1] : '';
    const originalLinkUrl = originalLinkMatch ? originalLinkMatch[1] : '';
    
    if (linkUrl.includes('naver.com')) {
      targetLink = linkUrl;
    } else if (originalLinkUrl) {
      targetLink = originalLinkUrl;
    } else if (linkUrl) {
      targetLink = linkUrl;
    }
    
    if (!targetLink) return itemXml;
    targetLink = targetLink.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim();
    
    const imageUrl = await fetchOgImage(targetLink);
    
    if (imageUrl) {
      // </item> 직전에 imageUrl 삽입
      return itemXml.replace(/<\/item>/i, `  <imageUrl><![CDATA[${imageUrl}]]></imageUrl>\n    </item>`);
    }
    return itemXml;
  }));

  // 원본 XML 문자열 대치
  let newXml = xml;
  // 순차 대치 (items와 enhancedItems 순서/길이가 보장됨)
  for(let i = 0; i < items.length; i++) {
    newXml = newXml.replace(items[i], enhancedItems[i]);
  }
  
  return newXml;
}

// 네이버 뉴스 검색 JSON 결과를 RSS XML 포맷으로 변환
async function fetchNaverAsXml(query: string, clientId: string, clientSecret: string): Promise<string> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    },
    signal: controller.signal,
  });
  
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Naver API returned ${response.status}`);
  }

  const data = await response.json() as any;
  if (!data?.items || data.items.length === 0) {
    throw new Error('Naver API returned 0 items');
  }

  // RSS Header
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n`;
  xml += `    <title><![CDATA[Naver News - ${query}]]></title>\n`;
  xml += `    <description><![CDATA[Naver Search Result]]></description>\n`;
  xml += `    <lastBuildDate>${data.lastBuildDate || new Date().toUTCString()}</lastBuildDate>\n`;

  // Item parsing (escaping b tags and raw html since front-end handles it as text or we must enclose in CDATA)
  for (const item of data.items) {
    // title/desc contains <b>keyword</b> from Naver
    xml += `    <item>\n`;
    xml += `      <title><![CDATA[${item.title}]]></title>\n`;
    xml += `      <originallink><![CDATA[${item.originallink}]]></originallink>\n`; // og 추출용 추가
    xml += `      <link><![CDATA[${item.link}]]></link>\n`;
    xml += `      <description><![CDATA[${item.description}]]></description>\n`;
    xml += `      <pubDate>${item.pubDate}</pubDate>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n</rss>`;
  return xml;
}

function xmlResponse(body: string, isError: boolean = false): Response {
  return new Response(body, {
    status: isError ? 503 : 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isError ? 'no-store, no-cache, must-revalidate' : 'public, max-age=600',
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
