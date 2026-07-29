import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMultiUseFacilities, isStaleDataError } from '../services/apiClient';

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
  '고시원': { icon: '🏠', color: 'text-orange-700 dark:text-orange-300', barColor: 'bg-orange-700 dark:bg-orange-400' },
  '노래연습장': { icon: '🎤', color: 'text-purple-700 dark:text-purple-300', barColor: 'bg-purple-700 dark:bg-purple-400' },
  'PC방': { icon: '💻', color: 'text-cyan-700 dark:text-cyan-300', barColor: 'bg-cyan-700 dark:bg-cyan-400' },
  '골프연습장': { icon: '⛳', color: 'text-green-700 dark:text-green-300', barColor: 'bg-green-700 dark:bg-green-400' },
  '단란주점': { icon: '🍻', color: 'text-amber-700 dark:text-amber-300', barColor: 'bg-amber-700 dark:bg-amber-400' },
  '유흥주점': { icon: '🎶', color: 'text-pink-700 dark:text-pink-300', barColor: 'bg-pink-700 dark:bg-pink-400' },
  '학원': { icon: '📚', color: 'text-indigo-700 dark:text-indigo-300', barColor: 'bg-indigo-700 dark:bg-indigo-400' },
  '휴게음식점': { icon: '☕', color: 'text-amber-700 dark:text-yellow-300', barColor: 'bg-amber-700 dark:bg-yellow-400' },
  '일반음식점': { icon: '🍽️', color: 'text-red-700 dark:text-red-300', barColor: 'bg-red-700 dark:bg-red-400' },
  '게임제공업': { icon: '🎮', color: 'text-emerald-700 dark:text-emerald-300', barColor: 'bg-emerald-700 dark:bg-emerald-400' },
  '산후조리원': { icon: '👶', color: 'text-rose-700 dark:text-rose-300', barColor: 'bg-rose-700 dark:bg-rose-400' },
  '안마시술소': { icon: '💆', color: 'text-teal-700 dark:text-teal-300', barColor: 'bg-teal-700 dark:bg-teal-400' },
  '찜질방': { icon: '♨️', color: 'text-orange-700 dark:text-orange-300', barColor: 'bg-orange-700 dark:bg-orange-400' },
  '사우나': { icon: '🧖', color: 'text-red-700 dark:text-red-300', barColor: 'bg-red-700 dark:bg-red-400' },
  '목욕장업': { icon: '🛁', color: 'text-sky-700 dark:text-sky-300', barColor: 'bg-sky-700 dark:bg-sky-400' },
  '콜라텍업': { icon: '💃', color: 'text-fuchsia-700 dark:text-fuchsia-300', barColor: 'bg-fuchsia-700 dark:bg-fuchsia-400' },
  '키즈카페업': { icon: '🧸', color: 'text-lime-800 dark:text-lime-300', barColor: 'bg-lime-800 dark:bg-lime-400' },
  '공유주방업': { icon: '🍳', color: 'text-amber-700 dark:text-amber-300', barColor: 'bg-amber-700 dark:bg-amber-400' },
  '실내사격장업': { icon: '🎯', color: 'text-gray-700 dark:text-gray-300', barColor: 'bg-gray-700 dark:bg-gray-400' },
  '멀티미디어문화컨텐츠설비 제공업': { icon: '🖥️', color: 'text-violet-700 dark:text-violet-300', barColor: 'bg-violet-700 dark:bg-violet-400' },
  '권총사격장': { icon: '🎯', color: 'text-slate-700 dark:text-slate-300', barColor: 'bg-slate-700 dark:bg-slate-400' },
  '만화카페업': { icon: '📖', color: 'text-amber-700 dark:text-yellow-300', barColor: 'bg-amber-700 dark:bg-yellow-400' },
  '방탈출카페업': { icon: '🔐', color: 'text-red-700 dark:text-red-300', barColor: 'bg-red-700 dark:bg-red-400' },
  '복합영상물': { icon: '📺', color: 'text-blue-700 dark:text-blue-300', barColor: 'bg-blue-700 dark:bg-blue-400' },
  '복합유통업': { icon: '🏬', color: 'text-indigo-700 dark:text-indigo-300', barColor: 'bg-indigo-700 dark:bg-indigo-400' },
  '비디오물감상': { icon: '📼', color: 'text-purple-700 dark:text-purple-300', barColor: 'bg-purple-700 dark:bg-purple-400' },
  '비디오소극장': { icon: '🎬', color: 'text-pink-700 dark:text-pink-300', barColor: 'bg-pink-700 dark:bg-pink-400' },
  '수면방업': { icon: '😴', color: 'text-blue-700 dark:text-blue-300', barColor: 'bg-blue-700 dark:bg-blue-400' },
  '영화상영관': { icon: '🎥', color: 'text-red-700 dark:text-red-300', barColor: 'bg-red-700 dark:bg-red-400' },
  '전화방': { icon: '☎️', color: 'text-green-700 dark:text-green-300', barColor: 'bg-green-700 dark:bg-green-400' },
  '제과영업점': { icon: '🍰', color: 'text-pink-700 dark:text-pink-300', barColor: 'bg-pink-700 dark:bg-pink-400' },
};

function getMeta(type: string) {
  return TYPE_META[type] || { icon: '🏢', color: 'text-gray-700 dark:text-gray-300', barColor: 'bg-gray-700 dark:bg-gray-400' };
}

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  if (typeof value === 'string') {
    const n = Number(value.replaceAll(',', '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
};

interface TypeStat {
  type: string;
  count: number;
  icon: string;
  color: string;
  barColor: string;
}

type MultiUseItem = Record<string, unknown>;

const extractItems = (value: unknown): MultiUseItem[] => {
  if (Array.isArray(value)) return value as MultiUseItem[];
  if (value && typeof value === 'object' && 'items' in value) {
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) ? items as MultiUseItem[] : [];
  }
  return [];
};

interface MultiUseViewProps {
  city: string;
}

export default function MultiUseView({ city }: MultiUseViewProps) {
  const [stats, setStats] = useState<TypeStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    setLoading(true);
    setApiError(null);
    setWarning(null);
    try {
      const ctprvn = cityToCtprvn[city];

      if (!ctprvn) {
        setApiError(`지원하지 않는 지역입니다: ${city}`);
        setStats([]);
        setTotal(0);
        return;
      }

      const data = await fetchMultiUseFacilities(ctprvn);
      if (seq !== requestSeqRef.current) return;

      const items = extractItems(data);
      
      const shortName = (cityShort[city] || '서울').trim();
      const cityItem = items.find((item) => {
        const hq = String(item['소방본부'] || '').replace(/\s/g, '');
        return hq.includes(shortName);
      });

      const combined: Record<string, number> = {};
      if (cityItem) {
        Object.entries(cityItem).forEach(([key, val]) => {
          const count = toNumber(val);
          if (
            count > 0 &&
            !['순번', '연도'].includes(key) &&
            !key.includes('소방본부') &&
            !key.includes('관할')
          ) {
            combined[key] = count;
          }
        });
      }

      const sorted = Object.entries(combined)
        .map(([type, count]) => ({ type, count, ...getMeta(type) }))
        .sort((a, b) => b.count - a.count);
      
      setStats(sorted);
      setTotal(sorted.reduce((sum, s) => sum + s.count, 0));
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;

      if (isStaleDataError(err)) {
        const items = extractItems(err.cachedData);
        const shortName = (cityShort[city] || '서울').trim();
        const cityItem = items.find((item) => {
          const hq = String(item['소방본부'] || '').replace(/\s/g, '');
          return hq.includes(shortName);
        });

        const combined: Record<string, number> = {};
        if (cityItem) {
          Object.entries(cityItem).forEach(([key, val]) => {
            const count = toNumber(val);
            if (count > 0 && !['순번', '연도'].includes(key) && !key.includes('소방본부') && !key.includes('관할')) {
              combined[key] = count;
            }
          });
        }
        const sorted = Object.entries(combined)
          .map(([type, count]) => ({ type, count, ...getMeta(type) }))
          .sort((a, b) => b.count - a.count);
        
        setStats(sorted);
        setTotal(sorted.reduce((sum, s) => sum + s.count, 0));
        setWarning(err.message);
      } else {
        setApiError(err instanceof Error ? err.message : '다중이용업소 데이터를 불러올 수 없습니다.');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
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
          <p className="text-[11px] text-on-surface-variant mt-1">
            <a
              href="https://www.data.go.kr/data/15083979/fileData.do"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-primary"
            >
              소방청 공식 OpenAPI·CSV
            </a>
            {' '}· 영업상태 ‘정상’ 실시간 집계 · API 오류 시 2025-09-15 검증값
          </p>
        </div>
        <button type="button" onClick={fetchData} disabled={loading}
          className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          새로고침
        </button>
      </div>

      {/* API 경고 (캐시 데이터 사용 시) */}
      {!loading && warning && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-yellow-400">warning</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-300">최신 데이터 갱신 실패</p>
            <p className="text-xs text-yellow-200/80 mt-1">{warning} 마지막으로 성공한 데이터를 표시 중입니다.</p>
          </div>
        </div>
      )}

      {/* API 에러 */}
      {!loading && apiError && stats.length === 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-red-700 dark:text-red-300 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">다중이용업소 API 연결 실패</h3>
          <p className="text-sm text-red-800 dark:text-red-200 max-w-lg mx-auto mb-1">{apiError}</p>
          <button type="button" onClick={fetchData}
            className="mt-3 bg-error text-on-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/90 transition-colors inline-flex items-center gap-2">
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

      {/* 데이터 없음 */}
      {!loading && !apiError && stats.length === 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/50 mb-2 block">
            search_off
          </span>
          <p className="text-sm font-bold text-on-surface">해당 지역의 다중이용업소 통계를 찾을 수 없습니다.</p>
          <p className="text-xs text-on-surface-variant mt-1">
            API 응답의 소방본부 명칭 또는 제공 연도를 확인하세요.
          </p>
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
