const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';

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
const CACHE_TTL = 3 * 60 * 1000; // 3분 캐시

const localNewsCache: Record<string, CacheEntry> = {};
let policyNewsCache: CacheEntry | null = null;
const alertCache: Record<string, { data: NewsItem | null; timestamp: number }> = {};

async function fetchRssAndParse(url: string, sourceName: string, isOfficial: boolean, limit: number, retries = 2): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s 대기
      }
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        if (attempt < retries) continue;
        return [];
      }
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const itemNodes = xmlDoc.getElementsByTagName('item');
      const items = [];
      for (let i = 0; i < Math.min(itemNodes.length, limit); i++) {
        items.push(itemNodes[i]);
      }
      
      // 빈 응답이면 재시도
      if (items.length === 0 && attempt < retries) continue;

      return items.map(item => {
        let desc = item.getElementsByTagName('description')[0]?.textContent || '';
        desc = desc.replace(/<[^>]+>/g, '')
                   .replace(/&nbsp;/gi, ' ')
                   .replace(/&quot;/gi, '"')
                   .replace(/&amp;/gi, '&')
                   .replace(/&lt;/gi, '<')
                   .replace(/&gt;/gi, '>')
                   .replace(/&#39;|&apos;/gi, "'")
                   .trim();
        
        let pubDateStr = item.getElementsByTagName('pubDate')[0]?.textContent || 
                         item.getElementsByTagName('dc:date')[0]?.textContent || 
                         item.getElementsByTagName('date')[0]?.textContent || '';
        
        let feedSource = item.getElementsByTagName('source')[0]?.textContent || '';
        let actualSource = sourceName;
        if (!isOfficial) {
          actualSource = feedSource || sourceName;
        }

        let title = item.getElementsByTagName('title')[0]?.textContent || '';
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

        let imageUrl = item.getElementsByTagName('imageUrl')[0]?.textContent || '';
        // CDATA 등 흔적 제거
        imageUrl = imageUrl.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim();

        return {
          id: item.getElementsByTagName('link')[0]?.textContent || Math.random().toString(),
          title,
          link: item.getElementsByTagName('link')[0]?.textContent || '',
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

function processAndSort(arrays: any[][]): NewsItem[] {
  const combined = arrays.flat().sort((a, b) => {
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
    pubDate: new Date(item.pubDateStr).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }),
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
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('행정안전부 재난 OR 행정안전부 소방 정책')}`, '행정안전부', true, 4),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('보건복지부 구급 OR 보건복지부 응급')}`, '보건복지부', true, 4),
      fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent('국회 소방 법안 OR 119 개정안')}`, '국회(입법)', true, 4),
    ]);
    const results = processAndSort([nfa, mois, mohw, assembly]);
    policyNewsCache = { data: results, timestamp: Date.now() };
    return results;
  } catch (error) {
    console.error('Policy News fetch error:', error);
    return policyNewsCache?.data || [];
  }
}

// 3. 기상특보 글로벌 배너용 단일 파싱
export async function fetchWeatherAlerts(city?: string, forceRefresh = false): Promise<NewsItem | null> {
  const cacheKey = city || 'ALL';
  if (!forceRefresh && alertCache[cacheKey] && Date.now() - alertCache[cacheKey].timestamp < CACHE_TTL) {
    return alertCache[cacheKey].data;
  }
  try {
    const query = city ? `기상특보 OR 날씨특보 발효 ${city}` : '기상특보 OR 날씨특보 발효';
    const alerts = await fetchRssAndParse(`${API_BASE}/api/news?type=google&query=${encodeURIComponent(query)}`, '기상청 특보', true, 3);
    const sorted = processAndSort([alerts]);
    let finalResult: NewsItem | null = null;
    if (sorted.length > 0) {
      // 12시간 이내의 특보만 유효하다고 판단
      const recent = new Date().getTime() - new Date(alerts[0].pubDateStr).getTime();
      if (recent < 12 * 60 * 60 * 1000) {
        finalResult = sorted[0];
      }
    }
    alertCache[cacheKey] = { data: finalResult, timestamp: Date.now() };
    return finalResult;
  } catch (error) {
    return alertCache[cacheKey]?.data || null;
  }
}
