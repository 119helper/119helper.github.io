import { useState, useEffect, useCallback } from 'react';
import { fetchMultiUseFacilities } from '../services/apiClient';

const cityShort: Record<string, string> = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천',
  gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', jeju: '제주',
};

const cityToCtprvn: Record<string, string> = {
  seoul: '서울특별시', busan: '부산광역시', daegu: '대구광역시', incheon: '인천광역시',
  gwangju: '광주광역시', daejeon: '대전광역시', ulsan: '울산광역시', sejong: '세종특별자치시', jeju: '제주특별자치도',
};

// 업종별 아이콘/색상 매핑
const TYPE_META: Record<string, { icon: string; color: string; barColor: string }> = {
  '고시원': { icon: '🏠', color: 'text-orange-400', barColor: 'bg-orange-400' },
  '노래연습장': { icon: '🎤', color: 'text-purple-400', barColor: 'bg-purple-400' },
  'PC방': { icon: '💻', color: 'text-cyan-400', barColor: 'bg-cyan-400' },
  '골프연습장': { icon: '⛳', color: 'text-green-400', barColor: 'bg-green-400' },
  '단란주점': { icon: '🍻', color: 'text-amber-400', barColor: 'bg-amber-400' },
  '유흥주점': { icon: '🎶', color: 'text-pink-400', barColor: 'bg-pink-400' },
  '학원': { icon: '📚', color: 'text-indigo-400', barColor: 'bg-indigo-400' },
  '휴게음식점': { icon: '☕', color: 'text-yellow-400', barColor: 'bg-yellow-400' },
  '일반음식점': { icon: '🍽️', color: 'text-red-400', barColor: 'bg-red-400' },
  '게임제공업': { icon: '🎮', color: 'text-emerald-400', barColor: 'bg-emerald-400' },
  '산후조리원': { icon: '👶', color: 'text-rose-400', barColor: 'bg-rose-400' },
  '안마시술소': { icon: '💆', color: 'text-teal-400', barColor: 'bg-teal-400' },
  '찜질방': { icon: '♨️', color: 'text-orange-500', barColor: 'bg-orange-500' },
  '사우나': { icon: '🧖', color: 'text-red-300', barColor: 'bg-red-300' },
  '목욕장업': { icon: '🛁', color: 'text-sky-400', barColor: 'bg-sky-400' },
  '콜라텍업': { icon: '💃', color: 'text-fuchsia-400', barColor: 'bg-fuchsia-400' },
  '키즈카페업': { icon: '🧸', color: 'text-lime-400', barColor: 'bg-lime-400' },
  '공유주방업': { icon: '🍳', color: 'text-amber-300', barColor: 'bg-amber-300' },
  '실내사격장업': { icon: '🎯', color: 'text-gray-400', barColor: 'bg-gray-400' },
  '멀티미디어문화컨텐츠설비 제공업': { icon: '🖥️', color: 'text-violet-400', barColor: 'bg-violet-400' },
};

function getMeta(type: string) {
  return TYPE_META[type] || { icon: '🏢', color: 'text-gray-400', barColor: 'bg-gray-400' };
}

interface TypeStat {
  type: string;
  count: number;
  icon: string;
  color: string;
  barColor: string;
}

interface MultiUseViewProps {
  city: string;
}

export default function MultiUseView({ city }: MultiUseViewProps) {
  const [stats, setStats] = useState<TypeStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await fetchMultiUseFacilities(cityToCtprvn[city] || '서울특별시');
      // API 응답: [ { "PC방": 1195, "노래연습장": 500, ... } ] — 업종별 통계
      const items = Array.isArray(data) ? data : (data as any)?.items || [];
      
      // 통계 데이터 파싱 — 각 항목이 업종:개수 형태
      const combined: Record<string, number> = {};
      items.forEach((item: any) => {
        Object.entries(item).forEach(([key, val]) => {
          if (typeof val === 'number' && val > 0) {
            // '소방본부' 같은 메타 필드 제외
            if (!['순번', '연도'].includes(key) && !key.includes('소방본부') && !key.includes('관할')) {
              combined[key] = (combined[key] || 0) + Number(val);
            }
          }
        });
      });

      const sorted = Object.entries(combined)
        .map(([type, count]) => ({ type, count, ...getMeta(type) }))
        .sort((a, b) => b.count - a.count);
      
      setStats(sorted);
      setTotal(sorted.reduce((sum, s) => sum + s.count, 0));
    } catch (e: any) {
      setApiError(e?.message || '다중이용업소 데이터를 불러올 수 없습니다.');
    }
    setLoading(false);
  }, [city]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxCount = stats.length > 0 ? stats[0].count : 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🏢 다중이용업소 현황</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 다중이용업소 정보 서비스 · <span className="text-primary font-bold">{cityShort[city] || city}</span>
            {!loading && !apiError && <span className="ml-2">· 총 <span className="font-bold text-primary">{total.toLocaleString()}</span>개소</span>}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          새로고침
        </button>
      </div>

      {/* API 에러 */}
      {!loading && apiError && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-red-400/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">다중이용업소 API 연결 실패</h3>
          <p className="text-sm text-red-300/80 max-w-lg mx-auto mb-1">{apiError}</p>
          <button onClick={fetchData}
            className="mt-3 bg-red-500/20 text-red-300 px-5 py-2 rounded-lg text-sm font-bold hover:bg-red-500/30 transition-colors inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">refresh</span>
            다시 시도
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-12 flex items-center justify-center gap-3">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-sm text-on-surface-variant">데이터 로딩 중...</span>
        </div>
      )}

      {/* 통계 카드 그리드 */}
      {!loading && !apiError && stats.length > 0 && (
        <>
          {/* Top-level stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {stats.map(s => (
              <div key={s.type}
                className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 hover:border-primary/30 transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-xs text-on-surface-variant font-medium truncate flex-1">{s.type}</span>
                </div>
                <p className="text-2xl font-black text-on-surface font-headline tabular-nums">{s.count.toLocaleString()}</p>
                <div className="mt-2 h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full ${s.barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(3, (s.count / maxCount) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1 text-right">
                  {((s.count / total) * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>

          {/* 막대 차트 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
            <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">bar_chart</span>
              업종별 분포
            </h3>
            <div className="space-y-2.5">
              {stats.map(s => (
                <div key={s.type} className="flex items-center gap-3">
                  <span className="text-base w-6 text-center flex-shrink-0">{s.icon}</span>
                  <span className="text-xs text-on-surface-variant w-32 sm:w-44 truncate flex-shrink-0 font-medium">{s.type}</span>
                  <div className="flex-1 h-6 bg-surface-container rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full ${s.barColor}/60 rounded-lg transition-all duration-700`}
                      style={{ width: `${Math.max(2, (s.count / maxCount) * 100)}%` }}
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold text-on-surface tabular-nums">
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
