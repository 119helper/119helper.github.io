import { useState, useEffect } from 'react';
import { fetchPolicyNews, type NewsItem } from '../services/newsApi';

type PolicyCategory = 'assembly' | 'nfa' | 'mois' | 'mohw' | 'default';

const getPolicyCategory = (source: string = '', title: string = ''): PolicyCategory => {
  if (source.includes('국회') || title.includes('법안') || title.includes('개정')) return 'assembly';
  if (source.includes('소방청')) return 'nfa';
  if (source.includes('행정안전부')) return 'mois';
  if (source.includes('보건복지부')) return 'mohw';
  return 'default';
};

const categoryTheme = {
  assembly: {
    gradient: "from-purple-500 to-indigo-500",
    icon: "account_balance",
    iconColor: "text-purple-500/10 dark:text-purple-400/5",
    badge: "border-purple-500/30 text-purple-700 dark:text-purple-400 bg-purple-500/10",
  },
  nfa: {
    gradient: "from-red-500 to-orange-500",
    icon: "local_fire_department",
    iconColor: "text-red-500/10 dark:text-red-400/5",
    badge: "border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/10",
  },
  mois: {
    gradient: "from-blue-500 to-sky-500",
    icon: "admin_panel_settings",
    iconColor: "text-blue-500/10 dark:text-blue-400/5",
    badge: "border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/10",
  },
  mohw: {
    gradient: "from-emerald-500 to-teal-500",
    icon: "health_and_safety",
    iconColor: "text-emerald-500/10 dark:text-emerald-400/5",
    badge: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10",
  },
  default: {
    gradient: "from-gray-600 to-gray-400 dark:from-gray-400 dark:to-gray-600",
    icon: "gavel",
    iconColor: "text-on-surface/5",
    badge: "border-outline-variant text-on-surface-variant bg-surface-variant/30",
  }
};

export default function PolicyDashboard() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNews = async (forceRefresh = false) => {
    setLoading(true);
    const data = await fetchPolicyNews(forceRefresh);
    setNews(data);
    setLoading(false);
  };

  useEffect(() => {
    loadNews();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface font-headline">정부 정책 및 입법 동향</h1>
            <p className="text-sm text-on-surface-variant font-medium mt-1">소방청, 행정안전부, 보건복지부 지침 및 국회 입법예고</p>
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
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="mt-4 text-on-surface-variant text-sm font-medium">전 부처 정책 정보를 수집 중입니다...</p>
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-20 bg-surface-container rounded-2xl border border-outline-variant/20">
          <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl mb-3">search_off</span>
          <p className="text-on-surface-variant">현재 불러올 수 있는 정책 뉴스가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 md:grid-flow-row-dense">
          {news.map((item, idx) => {
            const category = getPolicyCategory(item.source, item.title);
            const theme = categoryTheme[category];
            const isHero = idx === 0;

            return (
              <a 
                key={item.id} 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`
                  relative bg-surface-container-lowest border border-outline-variant/40 rounded-[2rem] overflow-hidden group 
                  hover:border-indigo-500/40 hover:ring-1 hover:ring-indigo-500/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5
                  transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex flex-col
                  ${isHero ? 'md:col-span-4 lg:col-span-4 md:flex-row' : 'col-span-1 md:col-span-2 lg:col-span-2'}
                `}
              >
                {/* 하이테크 상단 글로우 바 */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${theme.gradient} opacity-50 group-hover:opacity-100 transition-opacity`}></div>

                {/* 이미지 영역 (있을 경우만) */}
                {item.imageUrl && (
                  <div className={`
                    relative z-10 overflow-hidden bg-surface-container shrink-0
                    ${isHero ? 'w-full md:w-1/2 h-64 md:h-auto border-b md:border-b-0 md:border-r border-outline-variant/20' : 'w-full h-48 sm:h-44 border-b border-outline-variant/20'}
                  `}>
                    <img 
                      src={item.imageUrl} 
                      alt="" 
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      onError={(e) => {
                        e.currentTarget.parentElement!.style.display = 'none';
                      }}
                    />
                    {/* 데스크톱 영웅 카드용 이너 오버레이 (텍스트로 넘어가는 경계 부드럽게) */}
                    {isHero && (
                      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-container-lowest to-transparent hidden md:block"></div>
                    )}
                  </div>
                )}

                {/* 콘텐츠 영역 */}
                <div className={`p-6 md:p-8 flex-1 flex flex-col relative z-20 ${isHero && !item.imageUrl ? 'justify-center' : ''}`}>
                  
                  {/* 거대 백그라운드 워터마크 마이크로 인터랙션 */}
                  <span className={`material-symbols-outlined absolute pointer-events-none z-0 ${theme.iconColor} transform -rotate-12 group-hover:scale-110 group-hover:rotate-0 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isHero ? '-bottom-10 -right-10 text-[200px]' : '-bottom-6 -right-6 text-[120px]'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                    {theme.icon}
                  </span>
                  
                  {/* 메타데이터(뱃지, 시간) */}
                  <div className="flex flex-wrap items-center gap-3 mb-5 relative z-10">
                    <span className={`px-3 py-1 text-[11px] font-black rounded-full border border-solid ${theme.badge} uppercase tracking-wider shadow-sm`}>
                      {item.isOfficial ? <span className="material-symbols-outlined text-[11px] align-text-bottom mr-1" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span> : null}
                      {item.source}
                    </span>
                    <span className="text-[12px] font-bold text-on-surface-variant flex items-center gap-1 opacity-70">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {item.pubDate}
                    </span>
                  </div>
                  
                  {/* 제목 타이포그래피 극대화 */}
                  <h3 className={`
                    font-extrabold text-on-surface leading-tight tracking-tight mb-4 relative z-10
                    ${isHero ? 'text-[22px] md:text-[28px]' : 'text-[18px] line-clamp-3'}
                    group-hover:bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:${theme.gradient} transition-all duration-300
                  `} dangerouslySetInnerHTML={{ __html: item.title }} />
                  
                  {/* 본문 설명 */}
                  <p className={`
                    text-on-surface-variant font-medium leading-relaxed relative z-10 opacity-80
                    ${isHero ? 'text-[15px] line-clamp-4' : 'text-[14px] line-clamp-2'}
                  `}>
                    {item.description}
                  </p>

                  {/* 하단 바로가기 (모던 버튼) */}
                  <div className="mt-auto pt-6 flex items-center justify-between relative z-10">
                    <span className="text-[13px] font-bold text-on-surface opacity-50 group-hover:opacity-100 transition-opacity duration-300">원문 확인하기</span>
                    <div className="w-10 h-10 rounded-full border border-outline-variant/40 flex items-center justify-center bg-surface hover:bg-indigo-500 group-hover:border-indigo-500 group-hover:text-white text-on-surface-variant transition-all duration-300 transform group-hover:translate-x-1 shadow-sm">
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </div>
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

