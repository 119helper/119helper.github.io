import { API_BASE, workerHeaders } from './apiConfig';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  isOfficial?: boolean;
  imageUrl?: string;
}

interface CacheEntry {
  data: NewsItem[];
  timestamp: number;
}

interface ParsedNewsItem extends Omit<NewsItem, 'pubDate'> {
  pubDateStr: string;
}
const CACHE_TTL = 3 * 60 * 1000; // 3분 캐시
const NEWS_THUMBNAIL_MAX_BYTES = 3 * 1024 * 1024;
const NEWS_THUMBNAIL_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/x-png',
]);
const NEWS_TEXT_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  ndash: '–',
  nbsp: ' ',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
};
const PLACEHOLDER_IMAGE_NAME = /(?:^|[._-])(?:sns[-_]?thumbnail|logo|favicon|placeholder|no[-_]?image|noimage|default(?:[-_]?image)?|blank)(?:[._-]|$)/i;
const EXACT_PLACEHOLDER_IMAGE_STEM = /^(?:banner|icon)(?:[-_]?\d+x\d+)?$/i;

const localNewsCache: Record<string, CacheEntry> = {};
let policyNewsCache: CacheEntry | null = null;

function safeHttpUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function decodeNewsEntityPass(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (entity, token: string) => {
      if (!token.startsWith('#')) {
        return NEWS_TEXT_ENTITIES[token.toLowerCase()] ?? entity;
      }

      const isHex = token[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (
        !Number.isInteger(codePoint)
        || codePoint <= 0
        || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    },
  );
}

export function normalizeNewsText(value?: string): string {
  let normalized = value || '';

  // 먼저 실제 태그를 없앤 뒤 두 번 디코딩해 &amp;quot; 같은 이중 인코딩도 처리한다.
  normalized = normalized.replace(/<[^>]*>/g, ' ');
  for (let pass = 0; pass < 2; pass++) {
    const decoded = decodeNewsEntityPass(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }

  // 인코딩된 태그가 디코딩된 경우에도 화면 텍스트에는 마크업을 남기지 않는다.
  return normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLikelyPlaceholderImageUrl(value?: string): boolean {
  const safeUrl = safeHttpUrl(value);
  if (!safeUrl) return true;

  try {
    const url = new URL(safeUrl);
    let filename = url.pathname.split('/').pop() || '';
    try {
      filename = decodeURIComponent(filename);
    } catch {
      // 잘못 인코딩된 파일명도 URL 자체가 안전하면 원문으로 판별한다.
    }

    const stem = filename.replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, '');
    return filename.toLowerCase().endsWith('.svg')
      || PLACEHOLDER_IMAGE_NAME.test(filename)
      || EXACT_PLACEHOLDER_IMAGE_STEM.test(stem);
  } catch {
    return true;
  }
}

export function formatNewsPubDate(pubDateStr: string, now = new Date()): string {
  const publishedAt = new Date(pubDateStr);
  if (Number.isNaN(publishedAt.getTime())) return '';

  return publishedAt.toLocaleString('ko-KR', {
    ...(publishedAt.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractImageUrl(item: Element): string {
  const imageUrl = item.getElementsByTagName('imageUrl')[0]?.textContent?.trim();
  if (imageUrl) return imageUrl;
  const mediaThumb = item.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url');
  if (mediaThumb) return mediaThumb;
  const mediaContent = item.getElementsByTagName('media:content')[0]?.getAttribute('url');
  if (mediaContent) return mediaContent;
  const enclosure = item.getElementsByTagName('enclosure')[0];
  const enclosureUrl = enclosure?.getAttribute('url');
  const enclosureType = enclosure?.getAttribute('type') || '';
  if (enclosureUrl && enclosureType.startsWith('image/')) return enclosureUrl;
  const descRaw = item.getElementsByTagName('description')[0]?.textContent || '';
  const imgMatch = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) return imgMatch[1];
  return '';
}

export async function fetchNewsThumbnail(imageUrl: string, signal?: AbortSignal): Promise<Blob> {
  const safeImageUrl = safeHttpUrl(imageUrl);
  if (!safeImageUrl) {
    throw new Error('유효하지 않은 뉴스 이미지 URL입니다.');
  }

  const proxyUrl = new URL(`${API_BASE}/api/news/image`);
  proxyUrl.searchParams.set('url', safeImageUrl);

  const response = await fetch(proxyUrl.toString(), {
    cache: 'force-cache',
    headers: workerHeaders({
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`뉴스 이미지 요청 실패: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() || '';
  if (!NEWS_THUMBNAIL_CONTENT_TYPES.has(contentType)) {
    throw new Error('뉴스 이미지가 아닌 응답입니다.');
  }

  const contentLength = Number(response.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > NEWS_THUMBNAIL_MAX_BYTES) {
    throw new Error('뉴스 이미지가 허용 크기를 초과했습니다.');
  }

  const blob = await response.blob();
  if (blob.size === 0 || blob.size > NEWS_THUMBNAIL_MAX_BYTES) {
    throw new Error('뉴스 이미지 크기가 올바르지 않습니다.');
  }

  return blob;
}

async function fetchRssAndParse(url: string, sourceName: string, isOfficial: boolean, limit: number, retries = 2): Promise<ParsedNewsItem[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s 대기
      }
      const response = await fetch(url, { cache: 'no-store', headers: workerHeaders() });
      if (!response.ok) {
        if (attempt < retries) continue;
        return [];
      }
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const itemNodes = xmlDoc.getElementsByTagName('item');
      const items: Element[] = [];
      for (let i = 0; i < Math.min(itemNodes.length, limit); i++) {
        items.push(itemNodes[i]);
      }
      
      // 빈 응답이면 재시도
      if (items.length === 0 && attempt < retries) continue;

      return items.map(item => {
        let desc = normalizeNewsText(
          item.getElementsByTagName('description')[0]?.textContent || '',
        );
        
        const pubDateStr = item.getElementsByTagName('pubDate')[0]?.textContent || 
                         item.getElementsByTagName('dc:date')[0]?.textContent || 
                         item.getElementsByTagName('date')[0]?.textContent || '';
        
        const feedSource = normalizeNewsText(
          item.getElementsByTagName('source')[0]?.textContent || '',
        );
        let actualSource = normalizeNewsText(sourceName);
        if (!isOfficial) {
          actualSource = feedSource || actualSource;
        }

        let title = normalizeNewsText(
          item.getElementsByTagName('title')[0]?.textContent || '',
        );
        const sourceToRemove = feedSource || actualSource;
        
        if (sourceToRemove) {
          // 타이틀 끝에 붙은 ' - 언론사명' 제거
          if (title.endsWith(` - ${sourceToRemove}`)) {
            title = title.slice(0, -(sourceToRemove.length + 3));
          } else if (title.endsWith(`-${sourceToRemove}`)) {
            title = title.slice(0, -(sourceToRemove.length + 1));
          } else if (title.endsWith(sourceToRemove)) {
            title = title.slice(0, -sourceToRemove.length).trim();
            if (title.endsWith('-')) {
              title = title.slice(0, -1).trim();
            }
          }
          
          // 본문(description)에 등장하는 언론사 이름 일괄 제거
          desc = desc.split(sourceToRemove).join('').trim();
        }

        // 요약 최적화: description이 title과 거의 겹친다면, title 부분 제거 (구글 뉴스 RSS 특성상 title이 description 첫 부분에 반복됨)
        if (title.length > 5 && desc.includes(title)) {
          desc = desc.replace(title, '').trim();
        } else if (title.length > 10) {
           // 구글 뉴스 포맷 등에서 타이틀의 일부분만 description에 있을 경우를 위해 앞부분 매칭
           const partialTitle = title.substring(0, Math.floor(title.length * 0.7));
           if (desc.includes(partialTitle)) {
             desc = desc.replace(new RegExp(`.*${partialTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s]*`), '').trim();
           }
        }
        
        // 시작 부분에 남은 특수문자나 찌꺼기 제거 (예: '-', '...', '기자 =')
        desc = desc.replace(/^[-=·\s]+/, '');
        // "기자 =" 또는 "기자=" 등의 패턴이 앞부분에 있으면 제거 (보통 기자 이름 뒤에 옴)
        desc = desc.replace(/^[^]{0,15}기자\s*=\s*/, '');
        // 언론사 뉴스 툴팁 등으로 남은 불필요 글자 정리
        if (desc.startsWith('뉴스')) desc = desc.replace(/^뉴스\s*-?\s*/, '');
        if (desc.length < 10) desc = ''; // 내용이 너무 짧으면 없앰
        title = normalizeNewsText(title);
        desc = normalizeNewsText(desc);
        actualSource = normalizeNewsText(actualSource);

        let imageUrl = extractImageUrl(item);
        // CDATA 등 흔적 제거
        imageUrl = safeHttpUrl(imageUrl.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim());

        if (isLikelyPlaceholderImageUrl(imageUrl)) {
          imageUrl = '';
        }

        const link = safeHttpUrl(item.getElementsByTagName('link')[0]?.textContent || '');

        return {
          id: link || Math.random().toString(),
          title,
          link,
          pubDateStr,
          source: actualSource,
          description: desc,
          isOfficial,
          imageUrl
        };
      });
    } catch (err) {
      if (attempt === retries) {
        console.error(`RSS fetch error for ${url} (after ${retries + 1} attempts):`, err);
        return [];
      }
    }
  }
  return [];
}

function processAndSort(arrays: ParsedNewsItem[][]): NewsItem[] {
  const combined = arrays.flat().filter(item => item.link).sort((a, b) => {
    const d1 = new Date(a.pubDateStr).getTime();
    const d2 = new Date(b.pubDateStr).getTime();
    if (isNaN(d1)) return 1;
    if (isNaN(d2)) return -1;
    return d2 - d1;
  });

  return combined.map(item => ({
    id: item.id,
    title: item.title,
    link: item.link,
    pubDate: formatNewsPubDate(item.pubDateStr),
    source: item.source,
    description: item.description,
    isOfficial: item.isOfficial,
    imageUrl: item.imageUrl
  }));
}

// 1. 현장/지역 뉴스 (구글뉴스 + 소방방재신문)
export async function fetchLocalNews(city: string, forceRefresh = false): Promise<NewsItem[]> {
  if (!forceRefresh && localNewsCache[city] && Date.now() - localNewsCache[city].timestamp < CACHE_TTL) {
    return localNewsCache[city].data;
  }
  try {
    const [gNews, fpnNews] = await Promise.all([
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent(city + ' 소방')}`, 'Google 뉴스', false, 15),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('site:fpn119.co.kr ' + city)}`, '소방방재신문', true, 5)
    ]);
    let results = processAndSort([gNews, fpnNews]);
    
    // 구글 뉴스 차단 등 오류로 결과가 없을 때 NFA (소방청) 뉴스로 Fallback
    if (results.length === 0) {
      console.warn('Google News fetch failed or returned no results. Falling back to NFA news.');
      const nfaNews = await fetchRssAndParse(`${API_BASE}/api/news?type=nfa`, '소방청 주요뉴스(Fallback)', true, 15);
      results = processAndSort([nfaNews]);
    }

    localNewsCache[city] = { data: results, timestamp: Date.now() };
    return results;
  } catch (error) {
    console.error('Local News fetch error:', error);
    return localNewsCache[city]?.data || [];
  }
}

// 2. 정책/법안 뉴스 (소방청 + 국회 + 행안부 + 보건복지부)
export async function fetchPolicyNews(forceRefresh = false): Promise<NewsItem[]> {
  if (!forceRefresh && policyNewsCache && Date.now() - policyNewsCache.timestamp < CACHE_TTL) {
    return policyNewsCache.data;
  }
  try {
    // 4개 데이터 소스 동시 패치 (전부 구글 뉴스 고급검색 + RSS 프록시 활용)
    const [nfa, mois, mohw, assembly] = await Promise.all([
      fetchRssAndParse(`${API_BASE}/api/news?type=nfa`, '소방청(정책)', true, 8),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('행정안전부 재난 OR 행정안전부 소방 정책')}`, '행정안전부 관련', false, 4),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('보건복지부 구급 OR 보건복지부 응급')}`, '보건복지부 관련', false, 4),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('국회 소방 법안 OR 119 개정안')}`, '국회 입법 관련', false, 4),
    ]);
    const results = processAndSort([nfa, mois, mohw, assembly]);
    policyNewsCache = { data: results, timestamp: Date.now() };
    return results;
  } catch (error) {
    console.error('Policy News fetch error:', error);
    return policyNewsCache?.data || [];
  }
}
