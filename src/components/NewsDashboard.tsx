import { useState, useEffect } from 'react';
import { fetchLocalNews, type NewsItem } from '../services/newsApi';

type NewsCategory = 'fire' | 'rescue' | 'medical' | 'default';

const getNewsCategory = (title: string = '', desc: string = ''): NewsCategory => {
  const text = (title + ' ' + desc).toLowerCase();
  
  if (/(화재|불|진압|소방관|소방차|발화|잔불|화망)/.test(text)) return 'fire';
  if (/(구조|사고|고립|붕괴|실종|수색|추락|재난|태풍|지진)/.test(text)) return 'rescue';
  if (/(구급|환자|응급|이송|병원|심정지|위급|부상)/.test(text)) return 'medical';
  return 'default';
};

const categoryTheme = {
  fire: {
    gradient: "from-orange-500/40 via-red-500/20 to-transparent",
    icon: "local_fire_department",
    iconColor: "text-red-500/10",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  rescue: {
    gradient: "from-yellow-400/40 via-amber-500/20 to-transparent",
    icon: "warning",
    iconColor: "text-amber-500/10",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  medical: {
    gradient: "from-cyan-400/40 via-blue-500/20 to-transparent",
    icon: "medical_services",
    iconColor: "text-blue-500/10",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  default: {
    gradient: "from-primary/30 via-surface-variant/20 to-transparent",
    icon: "newspaper",
    iconColor: "text-primary/10",
    badge: "bg-primary/15 text-primary",
  }
};

interface NewsDashboardProps {
  city: string;
}

export default function NewsDashboard({ city }: NewsDashboardProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 시/도 한글명 매핑 (App.tsx에서 넘겨받는 값이 seoul, busan 같은 영문 key일 수 있으므로)
  const cityNames: Record<string, string> = {
    seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
    gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
  };
  const displayCity = cityNames[city] || city;

  const loadNews = async (forceRefresh = false) => {
    setLoading(true);
    const data = await fetchLocalNews(displayCity, forceRefresh);
    setNews(data);
    setLoading(false);
  };

  useEffect(() => {
    loadNews();
  }, [displayCity]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>newspaper</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface font-headline">{displayCity} 소방 뉴스</h1>
            <p className="text-sm text-on-surface-variant font-medium mt-1">지역 소방서 및 구조 관련 최신 뉴스</p>
          </div>
        </div>
        <button 
          onClick={() => loadNews(true)}
          className="p-2 rounded-full bg-surface-variant text-on-surface hover:bg-surface-tint hover:text-white transition-colors flex items-center shadow-sm"
          title="새로고침"
        >
          <span className={`material-symbols-outlined ${loading && news.length === 0 ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-on-surface-variant text-sm font-medium">뉴스 데이터를 불러오는 중...</p>
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-20 bg-surface-container rounded-2xl border border-outline-variant/20">
          <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl mb-3">article</span>
          <p className="text-on-surface-variant">관련 뉴스를 찾을 수 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {news.map((item) => {
            const category = getNewsCategory(item.title, item.description);
            const theme = categoryTheme[category];
            
            return (
              <a 
                key={item.id} 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="relative bg-surface-container-lowest/80 backdrop-blur-xl hover:bg-surface-container-lowest transition-all duration-300 rounded-3xl border border-outline-variant/30 overflow-hidden flex flex-col group hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5"
              >
                {/* 동적 매쉬 그라데이션 오라(Glow) */}
                <div className={`absolute -top-16 -right-16 w-56 h-56 bg-gradient-to-bl ${theme.gradient} rounded-full blur-[40px] opacity-70 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
                
                {/* 큼직한 워터마크 모노톤 아이콘 */}
                <span className={`material-symbols-outlined absolute -bottom-4 right-2 text-9xl ${theme.iconColor} transform rotate-12 group-hover:scale-110 group-hover:rotate-0 transition-all duration-500 pointer-events-none`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {theme.icon}
                </span>

                <div className="p-6 flex-1 relative z-10">
                  <div className="flex items-center justify-between mb-4 text-xs font-bold">
                    <span className={`${theme.badge} px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm`}>
                      {item.isOfficial ? <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span> : null}
                      {item.source}
                    </span>
                    <span className="text-on-surface-variant flex items-center gap-1 bg-surface-variant/30 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {item.pubDate}
                    </span>
                  </div>
                  
                  <h3 className="font-extrabold text-on-surface text-[17px] leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-3" dangerouslySetInnerHTML={{ __html: item.title }} />
                  
                  <p className="text-[13px] text-on-surface-variant line-clamp-3 leading-relaxed font-medium">
                    {item.description}
                  </p>
                </div>
                
                <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface/50 backdrop-blur-md flex items-center justify-between relative z-10 group-hover:bg-primary/5 transition-colors">
                  <span className="text-xs font-extrabold text-primary group-hover:underline">기사 원문 보기</span>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transform group-hover:translate-x-2 shadow-md transition-all">
                     <span className="material-symbols-outlined text-on-primary text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
