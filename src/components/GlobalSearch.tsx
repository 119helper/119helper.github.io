import { useState, useRef, useEffect, useMemo } from 'react';
import type { NavigateTarget } from '../types/navigation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tab: NavigateTarget;
  subId?: string;
  color: string;
}

interface GlobalSearchProps {
  onNavigate: (tab: NavigateTarget, subId?: string) => void;
}

const MENU_ITEMS: { keyword: string[]; tab: NavigateTarget; subId?: string; label: string; subtitle: string; icon: string; color: string }[] = [
  { keyword: ['대시보드', 'dashboard', '홈', '메인', '평시', '업무'], tab: 'dashboard', label: '평시 대시보드', subtitle: '근무 준비·지역 모니터링·빠른 도구', icon: 'dashboard', color: 'text-primary' },
  { keyword: ['출동', '상황판', '현장 대응', '지휘', 'incident'], tab: 'incident', label: '출동 상황판', subtitle: '출동 시작·현장 브리핑·활동 기록', icon: 'assignment', color: 'text-red-500' },
  { keyword: ['날씨', '기상', '온도', '비', '눈', '바람', '습도', 'weather', '풍속', '예보'], tab: 'weather', label: '기상 정보', subtitle: '실시간 날씨·예보·특보', icon: 'cloud', color: 'text-blue-400' },
  { keyword: ['소화전', '수도', 'hydrant', '소방용수'], tab: 'hydrants', label: '소화전', subtitle: '소화전 위치·현황', icon: 'fire_hydrant', color: 'text-red-400' },
  { keyword: ['급수탑', '저수조', '비상소화', 'water', '수원', '탱크'], tab: 'waterTowers', label: '급수탑/저수조', subtitle: '급수탑·저수조·비상소화장치', icon: 'water_pump', color: 'text-cyan-400' },
  { keyword: ['응급', '응급실', '병원', '병상', 'er', '이송'], tab: 'er', label: '응급실 현황', subtitle: '실시간 가용 병상 조회', icon: 'local_hospital', color: 'text-green-400' },
  { keyword: ['건축', '건물', '대장', 'building', '층수', '구조', '면적', '용도'], tab: 'building', label: '건축물대장', subtitle: '주소 입력 → 건물 정보 즉시 조회', icon: 'apartment', color: 'text-purple-400' },
  { keyword: ['달력', '일정', '교대', '근무', 'calendar', '공휴일', '스케줄'], tab: 'calendar', label: '달력/일정', subtitle: '교대 근무·공휴일', icon: 'calendar_month', color: 'text-orange-400' },
  { keyword: ['계산기', '계산', 'calculator', 'calc'], tab: 'calculator', label: '119 계산기', subtitle: '수압·호스·공기호흡기·유해화학·단위변환', icon: 'calculate', color: 'text-amber-400' },
  { keyword: ['수압', '송수압력', '압력', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'water_pressure_calc', label: '송수압력 계산기', subtitle: '층수 입력 → 필요 송수압력 계산', icon: 'water_drop', color: 'text-blue-400' },
  { keyword: ['호스', '전개', '거리', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'hose_length_calc', label: '호스 전개 계산기', subtitle: '거리·층수 입력 → 필요 호스 본수 계산', icon: 'straighten', color: 'text-green-400' },
  { keyword: ['공기호흡기', '공기', '타이머', '잔압', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'air_tank_timer', label: '공기호흡기 타이머', subtitle: '충전 압력 기반 참고 타이머', icon: 'timer', color: 'text-amber-400' },
  { keyword: ['단위', '변환', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'unit_converter', label: '단위 변환기', subtitle: '압력·길이·온도 단위 변환', icon: 'sync_alt', color: 'text-emerald-400' },
  { keyword: ['유해', '화학', '물질', 'hazmat', '방호', '구역', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'hazmat_calc', label: '유해화학물질 계산기', subtitle: '초기 방호·이격 거리 계산', icon: 'science', color: 'text-amber-500' },
  { keyword: ['산불', 'wildfire', '화재', '진화'], tab: 'wildfire', label: '산불 현황', subtitle: '실시간 산불 발생·진화 현황', icon: 'local_fire_department', color: 'text-red-500' },
  { keyword: ['타이머', '현장', '출동', '스톱워치', '교대'], tab: 'field-timer', label: '현장 타이머', subtitle: '공기호흡기·교대·출동 시간 기록', icon: 'timer', color: 'text-orange-400' },
  { keyword: ['장비', '점검', '체크리스트', '개인안전장비'], tab: 'checklist', label: '장비점검', subtitle: '개인안전장비 체크리스트', icon: 'check_circle', color: 'text-orange-400' },
  { keyword: ['법률', '방어', '면책', '소송', '진술'], tab: 'law', subId: 'DEFENSE', label: '실전 법률방어', subtitle: '현장 대응 법률 보호 도구', icon: 'gavel', color: 'text-rose-500' },
  { keyword: ['대응', '매뉴얼', 'manual', '지침', '표준'], tab: 'manual', label: '대응 매뉴얼', subtitle: '표준작전절차(SOP) 및 지침', icon: 'book', color: 'text-indigo-400' },
  { keyword: ['정책', '지침', '법안', 'policy', '소방청'], tab: 'policy', label: '정책/지침', subtitle: '최신 소방 정책 및 법안', icon: 'gavel', color: 'text-blue-500' },
  { keyword: ['뉴스', 'news', '언론', '보도'], tab: 'news', label: '소방 뉴스', subtitle: '소방 관련 최신 언론 보도', icon: 'newspaper', color: 'text-teal-500' },
  { keyword: ['연간', '화재', '통계', 'annual'], tab: 'annual-fire', label: '연간 화재통계', subtitle: '연도별 화재 발생 현황 분석', icon: 'bar_chart', color: 'text-cyan-500' },
  { keyword: ['화재', '분석', 'analysis', '피해'], tab: 'fire-analysis', label: '화재 분석', subtitle: '지역별/원인별 심층 분석', icon: 'insights', color: 'text-purple-500' },
  { keyword: ['지역', '화재', '피해', 'damage'], tab: 'fire-damage', label: '지역별 화재피해', subtitle: '시도별 화재 피해 규모', icon: 'map', color: 'text-red-400' },
  { keyword: ['위험물', '시설', 'hazmat', '제조소', '저장소', '취급소'], tab: 'hazmat', label: '위험물시설', subtitle: '관내 위험물 제조소등 현황', icon: 'warning', color: 'text-orange-500' },
  { keyword: ['생활', '위해', '사고', 'consumer', 'hazards', '안전사고'], tab: 'hazards', label: '생활위해사고', subtitle: '생활 안전사고 통계 및 분석', icon: 'health_and_safety', color: 'text-pink-500' },
  { keyword: ['다중', '이용', '업소', 'multiuse', '안전'], tab: 'multiuse', label: '다중이용업소', subtitle: '다중이용업소 안전관리 현황', icon: 'storefront', color: 'text-green-500' },
];

function toSearchResult(item: (typeof MENU_ITEMS)[number]): SearchResult {
  return {
    id: `menu-${item.tab}-${item.subId || 'main'}`,
    title: item.label,
    subtitle: item.subtitle,
    icon: item.icon,
    tab: item.tab,
    subId: item.subId,
    color: item.color,
  };
}

export default function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMobileSearch = () => {
    setMobileOpen(false);
    setIsOpen(false);
  };
  const mobileDialogRef = useDialogAccessibility<HTMLDivElement>(mobileOpen, closeMobileSearch, mobileTriggerRef);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 단축키 '/' 포커스
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;

      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (isTyping) return;

      e.preventDefault();
      if (window.matchMedia('(max-width: 767px)').matches) {
        setMobileOpen(true);
        window.setTimeout(() => mobileInputRef.current?.focus(), 0);
      } else {
        inputRef.current?.focus();
      }
      setIsOpen(true);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 통합 검색 (메뉴 바로가기 + 기능 키워드)
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const out: SearchResult[] = [];

    MENU_ITEMS.forEach(m => {
      if (m.keyword.some(k => k.includes(q) || q.includes(k)) || m.label.toLowerCase().includes(q)) {
        out.push(toSearchResult(m));
      }
    });

    return out.slice(0, 8);
  }, [query]);

  const displayedResults = results;

  useEffect(() => {
    setSelectedIdx(prev => {
      if (displayedResults.length === 0) return 0;
      return Math.min(prev, displayedResults.length - 1);
    });
  }, [displayedResults.length]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (displayedResults.length === 0) return;
      setSelectedIdx(prev => Math.min(prev + 1, displayedResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (displayedResults.length === 0) return;
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && displayedResults[selectedIdx]) {
      e.preventDefault();
      handleSelect(displayedResults[selectedIdx]);
    } else if (e.key === 'Escape') {
      if (mobileOpen) closeMobileSearch();
      else setIsOpen(false);
    }
  };

  const clearQuery = () => {
    setQuery('');
    setSelectedIdx(0);
    setIsOpen(true);
    window.requestAnimationFrame(() => (mobileOpen ? mobileInputRef.current : inputRef.current)?.focus());
  };

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.tab, result.subId);
    setQuery('');
    setIsOpen(false);
    setMobileOpen(false);
  };

  const renderResults = (mobile = false) => (
    <div className={mobile ? 'mt-3 overflow-y-auto max-h-[60vh]' : 'absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50'}>
      {displayedResults.length > 0 && (
        <>
          <div className="px-3 py-2 border-b border-outline-variant/10 flex items-center justify-between">
            <span role="status" aria-live="polite" className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              {displayedResults.length}개 결과
            </span>
          </div>
          {displayedResults.map((result, index) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIdx(index)}
              aria-current={index === selectedIdx ? 'true' : undefined}
              className={`flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors ${
                index === selectedIdx ? 'bg-primary/10' : 'hover:bg-surface-container/50'
              }`}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-lg ${result.color}`}>{result.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="text-sm font-bold text-on-surface truncate block">{result.title}</span>
                <span className="text-[11px] text-on-surface-variant truncate block">{result.subtitle}</span>
              </span>
              <span aria-hidden="true" className="material-symbols-outlined text-base text-on-surface-variant">arrow_forward</span>
            </button>
          ))}
        </>
      )}

      {isOpen && query.trim() && displayedResults.length === 0 && (
        <div role="status" className="p-6 text-center">
          <span aria-hidden="true" className="material-symbols-outlined text-2xl text-outline/40">search_off</span>
          <p className="mt-1 text-sm font-bold text-on-surface">‘{query.trim()}’ 검색 결과가 없습니다</p>
          <p className="mt-1 text-xs text-on-surface-variant">날씨, 산불, 계산기처럼 기능 이름으로 검색해 보세요.</p>
          <button
            type="button"
            onClick={clearQuery}
            className="mt-3 min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-on-primary hover:bg-primary/90"
          >
            검색어 지우기
          </button>
        </div>
      )}

      {!query.trim() && displayedResults.length === 0 && (
        <div className="p-6 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-2xl text-outline/40">manage_search</span>
          <p className="text-sm mt-1">기능 이름을 검색해 바로 이동하세요.</p>
          <p className="text-[11px] mt-1">날씨, 산불, 계산기처럼 입력해 보세요.</p>
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative shrink-0 md:w-80 md:ml-4">
      <button
        ref={mobileTriggerRef}
        type="button"
        aria-label="기능 검색 열기"
        onClick={() => {
          setMobileOpen(true);
          setIsOpen(true);
          window.setTimeout(() => mobileInputRef.current?.focus(), 0);
        }}
        className="md:hidden w-11 h-11 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container"
      >
        <span className="material-symbols-outlined text-xl">search</span>
      </button>

      <div className="hidden md:block relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
        <input
          ref={inputRef}
          aria-label="기능 검색"
          className="w-full pl-9 pr-4 py-2 bg-surface-container border-none rounded-full text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/30 focus:outline-none"
          placeholder="메뉴 바로가기 검색 (예: 날씨, 산불, 계산기)..."
          type="search"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); setSelectedIdx(0); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {!query && (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-outline border border-outline-variant/30 rounded px-1.5 py-0.5 font-mono">/</kbd>
        )}
        {isOpen && renderResults(false)}
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-3 safe-area-top" onClick={closeMobileSearch}>
          <div ref={mobileDialogRef} role="dialog" aria-modal="true" aria-label="기능 검색" tabIndex={-1} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl p-3 mt-2" onClick={event => event.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
                <input
                  ref={mobileInputRef}
                  data-dialog-initial-focus
                  aria-label="기능 검색"
                  className="w-full h-12 pl-10 pr-3 bg-surface-container rounded-xl text-base text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/30 focus:outline-none"
                  placeholder="날씨, 산불, 계산기…"
                  type="search"
                  value={query}
                  onChange={event => { setQuery(event.target.value); setIsOpen(true); setSelectedIdx(0); }}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <button type="button" aria-label="기능 검색 닫기" onClick={closeMobileSearch} className="w-12 h-12 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {renderResults(true)}
          </div>
        </div>
      )}
    </div>
  );
}
