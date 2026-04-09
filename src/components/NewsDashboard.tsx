import { useState, useEffect } from 'react';
import { fetchLocalNews, type NewsItem } from '../services/newsApi';

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((item) => (
            <a 
              key={item.id} 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-surface-container-low hover:bg-surface-container transition-colors rounded-2xl border border-outline-variant/20 overflow-hidden flex flex-col group"
            >
              <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className={`${item.isOfficial ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-primary/10 text-primary'} px-2.5 py-1 rounded-full font-bold flex items-center gap-1`}>
                    {item.isOfficial && <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>}
                    {item.source}
                  </span>
                  <span className="text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    {item.pubDate}
                  </span>
                </div>
                <h3 className="font-bold text-on-surface text-md leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-2" dangerouslySetInnerHTML={{ __html: item.title }} />
                <p className="text-xs text-on-surface-variant line-clamp-3 leading-relaxed">
                  {item.description}
                </p>
              </div>
              <div className="p-4 border-t border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between">
                <span className="text-[11px] font-bold text-primary group-hover:underline">기사 원문 보기</span>
                <span className="material-symbols-outlined text-primary text-sm transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
