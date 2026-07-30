/**
 * 뉴스 데이터 프록시 (Naver News API / Google News / Bing News)
 * 
 * 1. Naver API Key가 있으면 최우선으로 Naver API 사용 (결과를 기존 프론트와 호환되게 XML로 변환)
 * 2. 실패 시 Google News RSS -> Bing News RSS 폴백 방식을 취함
 * 3. 성공 시 KV(NEWS_CACHE)에 저장
 * 4. 실패 시 KV의 만료된(stale) 데이터라도 반환 (고가용성)
 */

import { z } from 'zod';
import { errorMessage, isRecord } from './publicData';
import { sanitizeStringParam } from '../middleware/cors';

const CACHE_TTL = 60 * 60; // 1시간 (KV 만료 기본 단위 초)
const STALE_TTL = 6 * 60 * 60; // 6시간 동안은 실패 시 과거 데이터라도 반환
const ALLOWED_TYPES = new Set(['google', 'nfa']);
const OG_IMAGE_FETCH_LIMIT = 8;
const OG_IMAGE_CONCURRENCY = 4;
const OG_IMAGE_TIMEOUT_MS = 2500;
const OG_HTML_MAX_BYTES = 128 * 1024;
const NEWS_IMAGE_TIMEOUT_MS = 6000;
const NEWS_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const NEWS_IMAGE_URL_MAX_LENGTH = 4096;
const NEWS_IMAGE_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/x-png',
]);
const RSS_MAX_BYTES = 512 * 1024;
const REDIRECT_LIMIT = 3;

interface NewsEnv {
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
  NEWS_CACHE?: KVNamespace;
}

interface NewsCacheEntry {
  text: string;
  ts: number;
}

const naverNewsSchema = z.object({
  lastBuildDate: z.string().optional(),
  items: z.array(z.object({
    title: z.coerce.string().default(''),
    originallink: z.coerce.string().default(''),
    link: z.coerce.string().default(''),
    description: z.coerce.string().default(''),
    pubDate: z.coerce.string().default(''),
  }).catchall(z.unknown())).default([]),
}).catchall(z.unknown());

type NaverNewsItem = z.infer<typeof naverNewsSchema>['items'][number];

function isNewsCacheEntry(value: unknown): value is NewsCacheEntry {
  return isRecord(value) && typeof value.text === 'string' && typeof value.ts === 'number';
}

export async function newsHandler(request: Request, env: NewsEnv): Promise<Response> {
  const url = new URL(request.url);
  const requestedType = sanitizeStringParam(url, 'type', 12) || 'google';
  const type = ALLOWED_TYPES.has(requestedType) ? requestedType : 'google';
  const query = sanitizeStringParam(url, 'query', 120) || '소방관';

  return await getNewsWithCache(type, query, env, false);
}

export async function newsImageHandler(request: Request): Promise<Response> {
  const rawUrl = new URL(request.url).searchParams.get('url')?.trim() || '';
  if (!rawUrl || rawUrl.length > NEWS_IMAGE_URL_MAX_LENGTH) {
    return imageErrorResponse('Invalid image URL', 400);
  }

  const target = assertFetchableHttpUrl(rawUrl);
  if (!target) {
    return imageErrorResponse('Blocked image URL', 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_IMAGE_TIMEOUT_MS);

  try {
    const fetched = await fetchWithSafeRedirects(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    }, controller.signal);

    if (!fetched || !fetched.response.ok) {
      return imageErrorResponse('Image upstream unavailable', 502);
    }

    const contentType = fetched.response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || '';
    if (!NEWS_IMAGE_CONTENT_TYPES.has(contentType)) {
      return imageErrorResponse('Unsupported image response', 415);
    }

    const contentLength = Number(fetched.response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > NEWS_IMAGE_MAX_BYTES) {
      return imageErrorResponse('Image response too large', 413);
    }

    const bytes = await readResponseBytes(fetched.response, NEWS_IMAGE_MAX_BYTES);
    if (bytes.byteLength === 0) {
      return imageErrorResponse('Empty image response', 502);
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const status = error instanceof Error && error.message.includes('exceeded') ? 413 : 502;
    return imageErrorResponse('Image fetch failed', status);
  } finally {
    clearTimeout(timeout);
  }
}

// Cron Trigger에서 주기적으로 호출하기 위한 프리패치 함수
export async function prefetchNews(env: NewsEnv) {
  // 프리패치 할 기본 검색어: "소방" (화재 OR 구조 OR 구급 OR 재난)
  const defaultQuery = '"소방" (화재 OR 구조 OR 구급 OR 재난)';
  console.log('[news] Running cron prefetch for query:', defaultQuery);
  try {
    // force fetch by skipping cache read
    await getNewsWithCache('google', defaultQuery, env, true);
    console.log('[news] Cron prefetch success');
  } catch (err) {
    console.error('[news] Cron prefetch error:', errorMessage(err));
  }
}

async function getNewsWithCache(type: string, query: string, env: NewsEnv, forceFetch: boolean): Promise<Response> {
  // 캐시 키 버전을 v4 등으로 올려서 이전 데이터(이미지 없는 데이터) 캐시를 즉시 무효화
  const CACHE_PREFIX = 'news:v6:';
  const cacheKey = `${CACHE_PREFIX}${type}:${encodeURIComponent(query)}`;
  const kv = env.NEWS_CACHE; // binding from wrangler.toml

  // 1. KV 캐시 확인
  if (!forceFetch && kv) {
    const cachedData = await kv.get(cacheKey, 'json');
    if (isNewsCacheEntry(cachedData)) {
      const { text, ts } = cachedData;
      const ageMs = Date.now() - ts;
      
      // 1시간 이내의 싱싱한 데이터면 즉시 반환
      if (ageMs < CACHE_TTL * 1000) {
        return xmlResponse(text);
      }
    }
  }

  let xmlText: string;

  try {
    // 2. Fetch 뉴스 데이터
    if (type === 'nfa') {
      // korea.kr은 해외(Cloudflare) IP를 간헐 차단 → 실패 시 네이버/빙 검색으로 폴백
      try {
        xmlText = await fetchRss('https://www.korea.kr/rss/dept_nfa.xml');
      } catch (nfaErr) {
        console.warn(`[news] korea.kr NFA RSS failed: ${errorMessage(nfaErr)}. Falling back to search.`);
        if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
          try {
            xmlText = await fetchNaverAsXml('소방청', env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET);
          } catch {
            xmlText = await fetchBingNewsFallback('소방청');
          }
        } else {
          xmlText = await fetchBingNewsFallback('소방청');
        }
      }
    } else {
      // 우선 Naver API 시도
      if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
        try {
          xmlText = await fetchNaverAsXml(query, env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET);
        } catch (naverErr) {
          console.warn(`[news] Naver API failed: ${errorMessage(naverErr)}. Falling back to Bing News.`);
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

  } catch (error) {
    console.error(`[news] Fetch error for ${cacheKey}:`, errorMessage(error));

    // 3. 완전히 실패한 경우, KV에 오래된(stale) 데이터라도 있는지 확인
    if (kv) {
      const cachedData = await kv.get(cacheKey, 'json');
      if (isNewsCacheEntry(cachedData)) {
        const { text, ts } = cachedData;
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
  } catch (err) {
    console.warn(`[news] Bing fetch failed:`, errorMessage(err), `trying Google fallback...`);
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    return await fetchRss(googleUrl);
  }
}

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const text = await readResponseText(response, RSS_MAX_BYTES);
  if (!text || text.length < 100 || !text.includes('<item>')) {
    throw new Error('Empty or invalid RSS response');
  }

  return text;
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = match.slice(1).map(Number);
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 0;
}

function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === '::'
    || host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe80:')
    || host.startsWith('::ffff:127.')
    || host.startsWith('::ffff:10.')
    || host.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host === '::1'
    || host === '[::1]'
    || isPrivateIpv4(host)
    || isBlockedIpv6(host);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function assertFetchableHttpUrl(value: string): string {
  const target = safeHttpUrl(value);
  if (!target) return '';
  const url = new URL(target);
  if (isBlockedFetchHost(url.hostname)) return '';
  return url.toString();
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: string } | null> {
  let target = assertFetchableHttpUrl(initialUrl);
  if (!target) return null;

  for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects += 1) {
    const response = await fetch(target, {
      ...init,
      redirect: 'manual',
      signal,
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: target };
    }

    await response.body?.cancel().catch(() => undefined);
    if (redirects === REDIRECT_LIMIT) return null;
    const location = response.headers.get('Location');
    if (!location) return null;
    target = assertFetchableHttpUrl(new URL(location, target).toString());
    if (!target) return null;
  }

  return null;
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Response too large: ${contentLength}`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Response exceeded ${maxBytes} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return text;
}

async function readResponsePrefix(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      totalBytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });

      if (value.byteLength > remaining || totalBytes === maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return text;
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Response exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function htmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<>]+))`, 'i'));
  return match?.[1] || match?.[2] || match?.[3] || '';
}

function extractMetaImageUrl(html: string, baseUrl: string): string {
  const supportedKeys = new Set([
    'og:image',
    'og:image:url',
    'og:image:secure_url',
    'twitter:image',
    'twitter:image:src',
  ]);

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttribute(tag, 'property') || htmlAttribute(tag, 'name')).trim().toLowerCase();
    if (!supportedKeys.has(key)) continue;

    const content = decodeHtmlAttribute(htmlAttribute(tag, 'content').trim());
    if (!content) continue;

    try {
      const resolved = new URL(content, baseUrl).toString();
      const safe = assertFetchableHttpUrl(resolved);
      if (safe) return safe;
    } catch {
      // 다음 메타 태그를 계속 확인한다.
    }
  }

  return '';
}

// 썸네일 URL(Og:Image)만 짧은 제한 안에서 가져오는 best-effort 스크래퍼
async function fetchOgImage(link: string): Promise<string> {
  try {
    const target = assertFetchableHttpUrl(link);
    if (!target) return '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OG_IMAGE_TIMEOUT_MS);

    try {
      const fetched = await fetchWithSafeRedirects(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
      }, controller.signal);

      if (!fetched || !fetched.response.ok) return '';
      const html = await readResponsePrefix(fetched.response, OG_HTML_MAX_BYTES);
      return extractMetaImageUrl(html, fetched.finalUrl);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return '';
  }
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cdata(value: string): string {
  return value.replace(/]]>/g, ']]]]><![CDATA[>');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlTagText(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  if (!match) return '';
  return match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1').trim();
}

// 생성되거나 파싱된 XML의 <item> 속 <link>들을 추적해 <imageUrl> 태그를 박아넣는 함수 (병렬 처리)
async function enhanceRssWithImages(xml: string): Promise<string> {
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  const items = xml.match(itemRegex);
  if (!items) return xml;

  const enhancedItems = [...items];
  let cursor = 0;

  async function enhanceItem(itemXml: string, index: number): Promise<string> {
    // 1. Bing News의 <News:Image> 태그가 이미 존재하면 즉시 사용
    const bingImageMatch = itemXml.match(/<News:Image>([^<]+)<\/News:Image>/i);
    const bingImage = bingImageMatch ? safeHttpUrl(decodeHtmlAttribute(bingImageMatch[1])) : '';
    if (bingImage) {
       return itemXml.replace(/<\/item>/i, `  <imageUrl><![CDATA[${cdata(bingImage)}]]></imageUrl>\n    </item>`);
    }

    // RSS feeds can contain many links. Keep HTML scraping intentionally small so news
    // never dominates Worker subrequests or latency.
    if (index >= OG_IMAGE_FETCH_LIMIT) return itemXml;

    let targetLink = '';
    // 원 언론사 페이지가 Naver 중계 페이지보다 보도사진 메타데이터를 안정적으로 제공한다.
    const linkUrl = xmlTagText(itemXml, 'link');
    const originalLinkUrl = xmlTagText(itemXml, 'originallink');
    
    if (originalLinkUrl) {
      targetLink = originalLinkUrl;
    } else if (linkUrl) {
      targetLink = linkUrl;
    }
    
    if (!targetLink) return itemXml;
    targetLink = safeHttpUrl(decodeHtmlAttribute(targetLink));
    
    const imageUrl = await fetchOgImage(targetLink);
    
    if (imageUrl) {
      // </item> 직전에 imageUrl 삽입
      return itemXml.replace(/<\/item>/i, `  <imageUrl><![CDATA[${cdata(imageUrl)}]]></imageUrl>\n    </item>`);
    }
    return itemXml;
  }

  const workers = Array.from({ length: Math.min(OG_IMAGE_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      enhancedItems[index] = await enhanceItem(items[index], index);
    }
  });
  await Promise.all(workers);

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

  const data = naverNewsSchema.parse(await response.json());
  if (data.items.length === 0) {
    throw new Error('Naver API returned 0 items');
  }

  // RSS Header
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n`;
  xml += `    <title><![CDATA[Naver News - ${cdata(query)}]]></title>\n`;
  xml += `    <description><![CDATA[Naver Search Result]]></description>\n`;
  xml += `    <lastBuildDate>${data.lastBuildDate || new Date().toUTCString()}</lastBuildDate>\n`;

  // Item parsing (escaping b tags and raw html since front-end handles it as text or we must enclose in CDATA)
  for (const item of data.items satisfies NaverNewsItem[]) {
    // title/desc contains <b>keyword</b> from Naver
    xml += `    <item>\n`;
    xml += `      <title><![CDATA[${cdata(item.title)}]]></title>\n`;
    xml += `      <originallink><![CDATA[${cdata(safeHttpUrl(item.originallink))}]]></originallink>\n`; // og 추출용 추가
    xml += `      <link><![CDATA[${cdata(safeHttpUrl(item.link))}]]></link>\n`;
    xml += `      <description><![CDATA[${cdata(item.description)}]]></description>\n`;
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

function imageErrorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function emptyRss(query: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXmlText(query)} - 뉴스</title>
    <description>검색 결과 없음</description>
  </channel>
</rss>`;
}
