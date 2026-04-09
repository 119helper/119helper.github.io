import { useState, useCallback, useRef, useEffect } from 'react';
import {
  searchLaw,
  getLawDetail,
  FIRE_LAW_PRESETS,
  type LawSearchItem,
  type LawDetailResponse,
  type LawArticle,
  type LawParagraph,
  type LawSubItem,
} from '../services/lawApi';
import LawDefenseShield from './LawDefenseShield';

// ── 헬퍼: 배열 보장 ──
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// ── 조문 내용에서 HTML 태그 / 엔터 정리 ──
function cleanText(s?: string): string {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();
}

export default function LawDashboard() {
  const [activeTab, setActiveTab] = useState<'SEARCH' | 'DEFENSE'>('SEARCH');
  
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LawSearchItem[]>([]);
  const [totalCnt, setTotalCnt] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 본문 뷰
  const [detail, setDetail] = useState<LawDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  // ── 검색 ──
  const doSearch = useCallback(async (q: string, p = 1) => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setDetail(null);
    try {
      const res = await searchLaw(q.trim(), p);
      setItems(res.items);
      setTotalCnt(res.totalCnt);
      setPage(p);
      setQuery(q);
    } catch (e: any) {
      setError(e.message || '검색 실패');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, 1);
  };

  // ── 본문 로드 ──
  const loadDetail = useCallback(async (mst: string) => {
    setDetailLoading(true);
    setDetailError('');
    setExpandedArticles(new Set());
    try {
      const res = await getLawDetail(mst);
      setDetail(res);
    } catch (e: any) {
      setDetailError(e.message || '본문 로드 실패');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleArticle = (joNo: string) => {
    setExpandedArticles(prev => {
      const next = new Set(prev);
      if (next.has(joNo)) next.delete(joNo);
      else next.add(joNo);
      return next;
    });
  };

  const expandAll = () => {
    const articles = asArray(detail?.법령?.조문?.조문단위);
    setExpandedArticles(new Set(articles.map(a => a.조문번호)));
  };

  const collapseAll = () => setExpandedArticles(new Set());

  // 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── 본문 정보 파싱 ──
  const info = detail?.법령?.기본정보;
  const articles = asArray(detail?.법령?.조문?.조문단위);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface flex items-center gap-2 font-headline">
            <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
            관련 법령
          </h2>
          <p className="text-on-surface-variant text-sm mt-1">
            소방 관련 법률·시행령 등과 현장 실전 법률 방어망(판례)을 조회합니다
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex bg-surface-container-low p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('SEARCH')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
              activeTab === 'SEARCH' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            법령 검색
          </button>
          <button
            onClick={() => setActiveTab('DEFENSE')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'DEFENSE' ? 'bg-amber-500 text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">shield_spark</span>
            실전 법률 방어망
          </button>
        </div>
      </div>

      {activeTab === 'DEFENSE' ? (
        <LawDefenseShield />
      ) : detail && !detailLoading ? (
        <div className="space-y-5">
          {/* 뒤로가기 + 법령 기본정보 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setDetail(null)}
                className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-lg">arrow_back</span>
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-extrabold text-on-surface truncate">
                  {info?.법령명_한글 || '법령'}
                </h3>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {info?.법령구분명 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      {info.법령구분명}
                    </span>
                  )}
                  {info?.소관부처명 && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                      {info.소관부처명}
                    </span>
                  )}
                  {info?.시행일자 && (
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      시행 {info.시행일자.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                    </span>
                  )}
                  {info?.제개정구분명 && (
                    <span className="text-[10px] text-on-surface-variant">
                      ({info.제개정구분명})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 전체 펼치기/접기 */}
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors"
              >
                전체 펼치기
              </button>
              <button
                onClick={collapseAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant font-bold hover:bg-surface-container-highest transition-colors"
              >
                전체 접기
              </button>
              <span className="text-xs text-on-surface-variant self-center ml-2">
                총 {articles.length}개 조문
              </span>
            </div>
          </div>

          {/* 조문 목록 */}
          <div className="space-y-2">
            {articles.map((article: LawArticle) => {
              const joNo = article.조문번호;
              const isOpen = expandedArticles.has(joNo);
              const title = article.조문제목 ? cleanText(article.조문제목) : '';
              const content = cleanText(article.조문내용);
              const paragraphs = asArray(article.항);
              const joLabel = joNo ? `제${parseInt(joNo)}조` : '';
              const hasDeleteMark = article.조문여부 === 'N';

              return (
                <div
                  key={joNo}
                  className={`bg-surface-container-lowest border rounded-xl overflow-hidden transition-colors ${
                    hasDeleteMark
                      ? 'border-outline-variant/5 opacity-50'
                      : isOpen
                        ? 'border-amber-500/30 shadow-sm'
                        : 'border-outline-variant/10 hover:border-outline-variant/30'
                  }`}
                >
                  <button
                    onClick={() => toggleArticle(joNo)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      isOpen ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {joLabel}
                    </span>
                    <span className="text-sm font-bold text-on-surface flex-1 truncate">
                      {title || (hasDeleteMark ? '삭제' : content.substring(0, 60) + (content.length > 60 ? '…' : ''))}
                    </span>
                    <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-outline-variant/10">
                      {/* 조문 본문 */}
                      {content && (
                        <p className="text-sm text-on-surface leading-relaxed mt-3 whitespace-pre-wrap">
                          {content}
                        </p>
                      )}

                      {/* 항 */}
                      {paragraphs.length > 0 && (
                        <div className="mt-3 space-y-2 pl-4 border-l-2 border-amber-500/20">
                          {paragraphs.map((para: LawParagraph) => {
                            const subItems = asArray(para.호);
                            return (
                              <div key={para.항번호}>
                                <p className="text-sm text-on-surface leading-relaxed">
                                  <span className="text-amber-600 dark:text-amber-400 font-bold mr-1">
                                    &#9312;{parseInt(para.항번호) > 1 ? String.fromCodePoint(9311 + parseInt(para.항번호)) : ''}
                                  </span>
                                  {cleanText(para.항내용)}
                                </p>
                                {/* 호 */}
                                {subItems.length > 0 && (
                                  <div className="mt-1 ml-4 space-y-1">
                                    {subItems.map((ho: LawSubItem) => (
                                      <p key={ho.호번호} className="text-xs text-on-surface-variant leading-relaxed">
                                        <span className="font-bold mr-1">{parseInt(ho.호번호)}.</span>
                                        {cleanText(ho.호내용)}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {detailError && (
            <div className="bg-error/10 text-error rounded-xl p-4 text-sm font-bold text-center">
              {detailError}
            </div>
          )}
        </div>
      ) : (
        /* ── 검색 모드 ── */
        <div className="space-y-5">
          {/* 빠른 검색 칩 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-amber-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              소방 관련 핵심 법령
            </p>
            <div className="flex flex-wrap gap-2">
              {FIRE_LAW_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => { setQuery(preset.query); doSearch(preset.query, 1); }}
                  className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all ${
                    query === preset.query
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300 shadow-sm'
                      : 'bg-surface-container border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high hover:border-outline-variant/30'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 검색창 */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="법령명을 입력하세요 (예: 소방기본법, 위험물)"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-medium placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-amber-500/20"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              ) : '검색'}
            </button>
          </form>

          {/* 에러 */}
          {error && (
            <div className="bg-error/10 border border-error/20 text-error rounded-xl p-4 text-sm font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">warning</span>
              {error}
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl animate-spin mb-4 text-amber-400">progress_activity</span>
              <p className="text-sm">법령 검색 중...</p>
            </div>
          )}

          {/* 검색 결과 리스트 */}
          {!loading && items.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-on-surface-variant font-bold">
                총 <span className="text-amber-500">{totalCnt.toLocaleString()}</span>건
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map(item => (
                  <button
                    key={item.법령일련번호}
                    onClick={() => loadDetail(item.법령일련번호)}
                    disabled={detailLoading}
                    className="group text-left bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 hover:shadow-lg hover:border-amber-500/30 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-extrabold text-on-surface group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                          {item.법령명한글}
                        </h4>
                        {item.법령약칭명 && item.법령약칭명 !== item.법령명한글 && (
                          <p className="text-xs text-on-surface-variant mt-0.5 truncate">약칭: {item.법령약칭명}</p>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                        item.법령구분명 === '법률'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : item.법령구분명 === '대통령령'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                            : 'bg-surface-container-high text-on-surface-variant'
                      }`}>
                        {item.법령구분명}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[10px] text-on-surface-variant">
                      {item.소관부처명 && (
                        <span className="flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">account_balance</span>
                          {item.소관부처명}
                        </span>
                      )}
                      {item.시행일자 && (
                        <span className="flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">event</span>
                          시행 {item.시행일자.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                        </span>
                      )}
                      {item.제개정구분명 && (
                        <span>{item.제개정구분명}</span>
                      )}
                    </div>

                    <div className="mt-2 text-right">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5 justify-end group-hover:underline">
                        <span className="material-symbols-outlined text-[14px]">article</span>
                        조문 보기
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* 페이지네이션 */}
              {totalCnt > 20 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => doSearch(query, page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-surface-container-high text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-highest transition-colors"
                  >
                    이전
                  </button>
                  <span className="text-xs text-on-surface-variant font-mono">
                    {page} / {Math.ceil(totalCnt / 20)}
                  </span>
                  <button
                    onClick={() => doSearch(query, page + 1)}
                    disabled={page >= Math.ceil(totalCnt / 20)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-surface-container-high text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-highest transition-colors"
                  >
                    다음
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 빈 결과 */}
          {!loading && !error && items.length === 0 && query && (
            <div className="py-16 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/20">
              <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
              <p className="text-sm">검색 결과가 없습니다</p>
            </div>
          )}

          {/* 초기 안내 */}
          {!loading && !error && items.length === 0 && !query && (
            <div className="py-16 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/20">
              <span className="material-symbols-outlined text-5xl mb-3 text-amber-400/50" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
              <p className="text-sm font-bold">위 빠른 검색 버튼을 누르거나 법령을 검색하세요</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">법제처 국가법령정보센터 데이터 기반</p>
            </div>
          )}
        </div>
      )}

      {/* 본문 로딩 오버레이 */}
      {detailLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-2xl text-center">
            <span className="material-symbols-outlined text-4xl animate-spin text-amber-400 mb-3 block">progress_activity</span>
            <p className="text-sm font-bold text-on-surface">법령 본문을 불러오는 중...</p>
            <p className="text-xs text-on-surface-variant mt-1">조문이 많은 법률은 시간이 걸릴 수 있습니다</p>
          </div>
        </div>
      )}
    </div>
  );
}
