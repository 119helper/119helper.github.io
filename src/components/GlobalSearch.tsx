import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { NavigateTarget } from '../types/navigation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { loadStoredJson } from '../services/privacySettings';
import { TAB_LABELS } from '../app/navigation';

interface SearchResultPresentation {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

type SearchResult = SearchResultPresentation & (
  | { action: 'navigate'; tab: NavigateTarget; subId?: string }
  | { action: 'building-address'; address: string }
  | { action: 'preplan'; search: string }
);

interface GlobalSearchProps {
  onNavigate: (tab: NavigateTarget, subId?: string) => void;
  onOpenBuildingAddress: (address: string) => void;
  onOpenPreplan: (search: string) => void;
}

interface StoredPreplanSearchItem {
  id: string;
  name: string;
  address: string;
  hazards: string[];
}

const PREPLAN_STORAGE_KEY = '119helper-preplans';
const SEARCH_HISTORY_STATE_KEY = '__119helperGlobalSearchOverlay';

const MENU_ITEMS: { keyword: string[]; tab: NavigateTarget; subId?: string; label: string; subtitle: string; icon: string; color: string }[] = [
  { keyword: ['대시보드', 'dashboard', '홈', '메인', '평시', '업무'], tab: 'dashboard', label: TAB_LABELS.dashboard, subtitle: '근무 준비·지역 모니터링·빠른 도구', icon: 'dashboard', color: 'text-primary' },
  { keyword: ['출동', '상황판', '현장 대응', '지휘', 'incident'], tab: 'incident', label: TAB_LABELS.incident, subtitle: '출동 시작·현장 브리핑·활동 기록', icon: 'assignment', color: 'text-red-500' },
  { keyword: ['날씨', '기상', '온도', '비', '눈', '바람', '습도', 'weather', '풍속', '예보'], tab: 'weather', label: TAB_LABELS.weather, subtitle: '실시간 날씨·예보·특보', icon: 'cloud', color: 'text-blue-400' },
  { keyword: ['시설', '조회', '소방용수', '대피소', 'AED', '화장실'], tab: 'shelter', label: TAB_LABELS.shelter, subtitle: '건축물·소방용수·대피시설 통합 조회', icon: 'location_city', color: 'text-yellow-500' },
  { keyword: ['소화전', '수도', 'hydrant', '소방용수'], tab: 'hydrants', label: '소화전', subtitle: '소화전 위치·현황', icon: 'fire_hydrant', color: 'text-red-400' },
  { keyword: ['급수탑', '저수조', '비상소화', 'water', '수원', '탱크'], tab: 'waterTowers', label: '급수탑/저수조', subtitle: '급수탑·저수조·비상소화장치', icon: 'water_pump', color: 'text-cyan-400' },
  { keyword: ['응급', '응급실', '병원', '병상', 'er', '이송'], tab: 'er', label: TAB_LABELS.er, subtitle: '실시간 가용 병상 조회', icon: 'local_hospital', color: 'text-green-400' },
  { keyword: ['건축', '건물', '대장', 'building', '층수', '구조', '면적', '용도'], tab: 'building', label: '건축물대장', subtitle: '주소 입력 → 건물 정보 즉시 조회', icon: 'apartment', color: 'text-purple-400' },
  { keyword: ['달력', '일정', '교대', '근무', 'calendar', '공휴일', '스케줄'], tab: 'calendar', label: TAB_LABELS.calendar, subtitle: '교대 근무·공휴일', icon: 'calendar_month', color: 'text-orange-400' },
  { keyword: ['계산기', '계산', 'calculator', 'calc'], tab: 'calculator', label: TAB_LABELS.calculator, subtitle: '수압·호스·공기호흡기·유해화학·단위변환', icon: 'calculate', color: 'text-amber-400' },
  { keyword: ['수압', '송수압력', '압력', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'water_pressure_calc', label: '송수압력 계산기', subtitle: '층수 입력 → 필요 송수압력 계산', icon: 'water_drop', color: 'text-blue-400' },
  { keyword: ['호스', '전개', '거리', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'hose_length_calc', label: '호스 전개 계산기', subtitle: '거리·층수 입력 → 필요 호스 본수 계산', icon: 'straighten', color: 'text-green-400' },
  { keyword: ['공기호흡기', '공기', '타이머', '잔압', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'air_tank_timer', label: '공기호흡기 타이머', subtitle: '충전 압력 기반 참고 타이머', icon: 'timer', color: 'text-amber-400' },
  { keyword: ['단위', '변환', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'unit_converter', label: '단위 변환기', subtitle: '압력·길이·온도 단위 변환', icon: 'sync_alt', color: 'text-emerald-400' },
  { keyword: ['유해', '화학', '물질', 'hazmat', '방호', '구역', '계산', 'calculator', 'calc'], tab: 'calculator', subId: 'hazmat_calc', label: '유해화학물질 계산기', subtitle: '초기 방호·이격 거리 계산', icon: 'science', color: 'text-amber-500' },
  { keyword: ['산불', 'wildfire', '화재', '진화'], tab: 'wildfire', label: TAB_LABELS.wildfire, subtitle: '실시간 산불 발생·진화 현황', icon: 'local_fire_department', color: 'text-red-500' },
  { keyword: ['타이머', '현장', '출동', '스톱워치', '교대'], tab: 'field-timer', label: TAB_LABELS['field-timer'], subtitle: '공기호흡기·교대·출동 시간 기록', icon: 'timer', color: 'text-orange-400' },
  { keyword: ['장비', '점검', '체크리스트', '개인안전장비'], tab: 'checklist', label: TAB_LABELS.checklist, subtitle: '개인안전장비 체크리스트', icon: 'check_circle', color: 'text-orange-400' },
  { keyword: ['인증', 'KFI', '소방용품', '장비 인증'], tab: 'equipment-cert', label: TAB_LABELS['equipment-cert'], subtitle: '소방장비·소방용품 인증 정보 조회', icon: 'verified', color: 'text-emerald-500' },
  { keyword: ['법률', '방어', '면책', '소송', '진술'], tab: 'law', subId: 'DEFENSE', label: TAB_LABELS.law, subtitle: '현장 대응 법률 보호 도구', icon: 'gavel', color: 'text-rose-500' },
  { keyword: ['대응', '매뉴얼', 'manual', '지침', '표준'], tab: 'manual', label: TAB_LABELS.manual, subtitle: '표준작전절차(SOP) 및 지침', icon: 'book', color: 'text-indigo-400' },
  { keyword: ['정책', '지침', '법안', 'policy', '소방청'], tab: 'policy', label: TAB_LABELS.policy, subtitle: '최신 소방 정책 및 법안', icon: 'gavel', color: 'text-blue-500' },
  { keyword: ['뉴스', 'news', '언론', '보도'], tab: 'news', label: TAB_LABELS.news, subtitle: '소방 관련 최신 언론 보도', icon: 'newspaper', color: 'text-teal-500' },
  { keyword: ['연간', '화재', '통계', 'annual'], tab: 'annual-fire', label: TAB_LABELS['annual-fire'], subtitle: '연도별 화재 발생 현황 분석', icon: 'bar_chart', color: 'text-cyan-500' },
  { keyword: ['화재', '분석', 'analysis', '피해'], tab: 'fire-analysis', label: TAB_LABELS['fire-analysis'], subtitle: '지역별/원인별 심층 분석', icon: 'insights', color: 'text-purple-500' },
  { keyword: ['지역', '화재', '피해', 'damage'], tab: 'fire-damage', label: TAB_LABELS['fire-damage'], subtitle: '시도별 화재 피해 규모', icon: 'map', color: 'text-red-400' },
  { keyword: ['위험물', '시설', 'hazmat', '제조소', '저장소', '취급소'], tab: 'hazmat', label: TAB_LABELS.hazmat, subtitle: '관내 위험물 제조소등 현황', icon: 'warning', color: 'text-orange-500' },
  { keyword: ['생활', '위해', '사고', 'consumer', 'hazards', '안전사고'], tab: 'hazards', label: TAB_LABELS.hazards, subtitle: '생활 안전사고 통계 및 분석', icon: 'health_and_safety', color: 'text-pink-500' },
  { keyword: ['다중', '이용', '업소', 'multiuse', '안전'], tab: 'multiuse', label: TAB_LABELS.multiuse, subtitle: '다중이용업소 안전관리 현황', icon: 'storefront', color: 'text-green-500' },
  { keyword: ['댐', '방류', '수문', '홍수'], tab: 'dam-discharge', label: TAB_LABELS['dam-discharge'], subtitle: '댐 방류 현황과 하류 영향 확인', icon: 'water', color: 'text-blue-500' },
  { keyword: ['항공', '드론', '헬기', '운항'], tab: 'aviation', label: TAB_LABELS.aviation, subtitle: '항공·드론 운항 안전 정보', icon: 'flight', color: 'text-cyan-500' },
  { keyword: ['대상물', '사전계획', '현장 정보', '위험요인'], tab: 'preplan', label: TAB_LABELS.preplan, subtitle: '대상물 사전계획과 현장 정보', icon: 'domain', color: 'text-violet-500' },
  { keyword: ['오프라인', 'offline', '통신', '데이터 저장'], tab: 'offline-readiness', label: TAB_LABELS['offline-readiness'], subtitle: '출동 전 오프라인 데이터 준비 상태', icon: 'offline_bolt', color: 'text-lime-600' },
  { keyword: ['환자', '분류', 'START', '트리아지'], tab: 'triage', label: TAB_LABELS.triage, subtitle: '현장 환자 분류와 이송 우선순위', icon: 'health_and_safety', color: 'text-red-500' },
  { keyword: ['활동', '타임라인', '기록', '시각'], tab: 'activity-log', label: TAB_LABELS['activity-log'], subtitle: '출동 활동 시각과 기록 확인', icon: 'history', color: 'text-slate-500' },
  { keyword: ['대원', '안전', '인원', 'PAR'], tab: 'safety-monitor', label: TAB_LABELS['safety-monitor'], subtitle: '현장 대원 안전 상태 확인', icon: 'shield', color: 'text-orange-500' },
];

function toSearchResult(item: (typeof MENU_ITEMS)[number]): SearchResult {
  return {
    id: `menu-${item.tab}-${item.subId || 'main'}`,
    title: item.label,
    subtitle: item.subtitle,
    icon: item.icon,
    action: 'navigate',
    tab: item.tab,
    subId: item.subId,
    color: item.color,
  };
}

function isHistoryStateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchHistoryState(value: unknown): boolean {
  return isHistoryStateRecord(value) && value[SEARCH_HISTORY_STATE_KEY] === true;
}

function withSearchHistoryState(value: unknown): Record<string, unknown> {
  return {
    ...(isHistoryStateRecord(value) ? value : {}),
    [SEARCH_HISTORY_STATE_KEY]: true,
  };
}

function looksLikeKoreanAddress(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!/\d/.test(normalized)) return false;

  const roadAddress = /(?:대로|로|길|번길)\s*\d+(?:-\d+)?(?:\s|$)/;
  const lotAddress = /(?:동|읍|면|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s|$)/;
  return roadAddress.test(normalized) || lotAddress.test(normalized);
}

function toStoredPreplans(value: unknown): StoredPreplanSearchItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate, index) => {
    if (!isHistoryStateRecord(candidate)) return [];

    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 120) : '';
    const address = typeof candidate.address === 'string' ? candidate.address.trim().slice(0, 200) : '';
    const hazards = Array.isArray(candidate.hazards)
      ? candidate.hazards
        .filter((hazard): hazard is string => typeof hazard === 'string')
        .map(hazard => hazard.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10)
      : [];
    if (!name && !address) return [];

    const id = typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : String(index);
    return [{ id, name, address, hazards }];
  });
}

function getStoredPreplans(): StoredPreplanSearchItem[] {
  return loadStoredJson<StoredPreplanSearchItem[]>(
    PREPLAN_STORAGE_KEY,
    [],
    toStoredPreplans,
  );
}

const FIELD_MANUAL_KEYWORDS = [
  'sop',
  '리튬 배터리',
  '리튬',
  '전기차',
  '화학',
  '가스',
  '차량',
];

const FIELD_MANUAL_SOP_TARGETS: Record<string, { id: string; title: string }> = {
  '리튬 배터리': { id: 'vehicle-fire', title: '차량화재' },
  '리튬': { id: 'vehicle-fire', title: '차량화재' },
  '전기차': { id: 'vehicle-fire', title: '차량화재' },
  '차량': { id: 'vehicle-fire', title: '차량화재' },
  '화학': { id: 'hazmat-fire', title: '위험물/화학 화재' },
  '가스': { id: 'gas-leak', title: '가스누출' },
};

export default function GlobalSearch({
  onNavigate,
  onOpenBuildingAddress,
  onOpenPreplan,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [storedPreplans, setStoredPreplans] = useState<StoredPreplanSearchItem[]>(() => getStoredPreplans());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const searchHistoryActiveRef = useRef(false);
  const pendingSelectionRef = useRef<(() => void) | null>(null);

  const openSearchHistory = useCallback(() => {
    if (!isSearchHistoryState(window.history.state)) {
      window.history.pushState(
        withSearchHistoryState(window.history.state),
        '',
        window.location.href,
      );
    }
    searchHistoryActiveRef.current = true;
  }, []);

  const openDesktopSearch = useCallback(() => {
    openSearchHistory();
    setIsOpen(true);
  }, [openSearchHistory]);

  const openMobileSearch = useCallback(() => {
    openSearchHistory();
    setMobileOpen(true);
    setIsOpen(true);
    window.setTimeout(() => mobileInputRef.current?.focus(), 0);
  }, [openSearchHistory]);

  const closeSearch = useCallback(() => {
    setMobileOpen(false);
    setIsOpen(false);
    pendingSelectionRef.current = null;

    if (searchHistoryActiveRef.current && isSearchHistoryState(window.history.state)) {
      searchHistoryActiveRef.current = false;
      window.history.back();
    } else {
      searchHistoryActiveRef.current = false;
    }
  }, []);
  const mobileDialogRef = useDialogAccessibility<HTMLDivElement>(mobileOpen, closeSearch, mobileTriggerRef);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      if (!searchHistoryActiveRef.current && pendingSelectionRef.current === null) return;

      searchHistoryActiveRef.current = false;
      setMobileOpen(false);
      setIsOpen(false);
      const pendingSelection = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      if (pendingSelection) {
        // App의 popstate 라우트 동기화가 끝난 뒤 선택한 목적지로 이동한다.
        window.setTimeout(pendingSelection, 0);
      }
    };

    window.addEventListener('popstate', handleHistoryNavigation);
    return () => window.removeEventListener('popstate', handleHistoryNavigation);
  }, []);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeSearch]);

  useEffect(() => {
    if (isOpen) setStoredPreplans(getStoredPreplans());
  }, [isOpen]);

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
        openMobileSearch();
      } else {
        inputRef.current?.focus();
        openDesktopSearch();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openDesktopSearch, openMobileSearch]);

  // 통합 검색 (메뉴 바로가기 + 기능 키워드)
  const results = useMemo<SearchResult[]>(() => {
    const rawQuery = query.trim();
    if (!rawQuery) return [];

    const q = rawQuery.toLowerCase();
    const out: SearchResult[] = [];

    if (looksLikeKoreanAddress(rawQuery)) {
      out.push({
        id: 'building-address-query',
        title: '건축물대장으로 조회',
        subtitle: `‘${rawQuery}’ 주소를 입력한 상태로 시설조회 > 건축물을 엽니다.`,
        icon: 'apartment',
        color: 'text-purple-400',
        action: 'building-address',
        address: rawQuery,
      });
    }

    storedPreplans
      .filter(plan => (
        plan.name.toLowerCase().includes(q)
        || plan.address.toLowerCase().includes(q)
        || plan.hazards.some(hazard => hazard.toLowerCase().includes(q))
      ))
      .slice(0, 3)
      .forEach(plan => {
        const hazardSummary = plan.hazards.length > 0
          ? `위험요소: ${plan.hazards.join(', ')}`
          : '위험요소 미입력';
        out.push({
          id: `preplan-${plan.id}`,
          title: `저장 대상물 · ${plan.name || '이름 미입력'}`,
          subtitle: `${plan.address || '주소 미입력'} · ${hazardSummary}`,
          icon: 'fact_check',
          color: 'text-orange-400',
          action: 'preplan',
          search: plan.name || plan.address,
        });
      });

    const fieldKeyword = FIELD_MANUAL_KEYWORDS.find(keyword => q.includes(keyword));
    if (fieldKeyword) {
      const directSop = FIELD_MANUAL_SOP_TARGETS[fieldKeyword];
      out.push({
        id: 'manual-sop-field-query',
        title: directSop ? `${directSop.title} SOP 참고표 열기` : 'SOP 체크리스트 열기',
        subtitle: fieldKeyword === 'sop'
          ? '현장 유형별 참고 목록에서 항목을 직접 선택하고 기관 공식 지침을 우선하세요.'
          : `‘${fieldKeyword}’ 관련 ${directSop?.title ?? 'SOP'} 참고표를 열며 기관 공식 지침을 우선하세요.`,
        icon: 'checklist',
        color: 'text-indigo-400',
        action: 'navigate',
        tab: 'manual',
        subId: directSop ? `sop:${directSop.id}` : 'sop',
      });
    }

    MENU_ITEMS.forEach(m => {
      if (m.keyword.some(k => k.includes(q) || q.includes(k)) || m.label.toLowerCase().includes(q)) {
        out.push(toSearchResult(m));
      }
    });

    const seen = new Set<string>();
    return out.filter(result => {
      if (seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    }).slice(0, 8);
  }, [query, storedPreplans]);

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
      closeSearch();
    }
  };

  const clearQuery = () => {
    setQuery('');
    setSelectedIdx(0);
    setIsOpen(true);
    window.requestAnimationFrame(() => (mobileOpen ? mobileInputRef.current : inputRef.current)?.focus());
  };

  const handleSelect = useCallback((result: SearchResult) => {
    const completeSelection = () => {
      if (result.action === 'building-address') {
        onOpenBuildingAddress(result.address);
      } else if (result.action === 'preplan') {
        onOpenPreplan(result.search);
      } else {
        onNavigate(result.tab, result.subId);
      }
      setQuery('');
    };

    setIsOpen(false);
    setMobileOpen(false);

    if (searchHistoryActiveRef.current && isSearchHistoryState(window.history.state)) {
      pendingSelectionRef.current = completeSelection;
      searchHistoryActiveRef.current = false;
      window.history.back();
      return;
    }

    searchHistoryActiveRef.current = false;
    completeSelection();
  }, [onNavigate, onOpenBuildingAddress, onOpenPreplan]);

  const handleResultClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const resultIndex = Number(event.currentTarget.dataset.resultIndex);
    const result = displayedResults[resultIndex];
    if (result) handleSelect(result);
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
              data-result-index={index}
              onClick={handleResultClick}
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
        onClick={openMobileSearch}
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
          onFocus={openDesktopSearch}
          onKeyDown={handleKeyDown}
        />
        {!query && (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-outline border border-outline-variant/30 rounded px-1.5 py-0.5 font-mono">/</kbd>
        )}
        {isOpen && renderResults(false)}
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-3 safe-area-top" onClick={closeSearch}>
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
              <button type="button" aria-label="기능 검색 닫기" onClick={closeSearch} className="w-12 h-12 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
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
