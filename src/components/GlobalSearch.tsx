import { useState, useRef, useEffect } from 'react';

type TabId = 'dashboard' | 'hydrants' | 'waterTowers' | 'er' | 'building' | 'weather' | 'calculator' | 'memo' | 'calendar';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tab: TabId;
  color: string;
}

interface GlobalSearchProps {
  onNavigate: (tab: TabId) => void;
}

export default function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // 통합 검색 (메뉴 바로가기 + 기능 키워드)
  const results: SearchResult[] = (() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const out: SearchResult[] = [];

    // 메뉴 항목 (탭 이름 + 관련 키워드 검색)
    const menuMap: { keyword: string[]; tab: TabId; label: string; subtitle: string; icon: string; color: string }[] = [
      { keyword: ['대시보드', 'dashboard', '홈', '메인'], tab: 'dashboard', label: '대시보드', subtitle: '종합 현황 보기', icon: 'dashboard', color: 'text-primary' },
      { keyword: ['날씨', '기상', '온도', '비', '눈', '바람', '습도', 'weather', '풍속', '예보'], tab: 'weather', label: '기상 정보', subtitle: '실시간 날씨·예보·특보', icon: 'cloud', color: 'text-blue-400' },
      { keyword: ['소화전', '수도', 'hydrant', '소방용수'], tab: 'hydrants', label: '소화전', subtitle: '소화전 위치·현황', icon: 'fire_hydrant', color: 'text-red-400' },
      { keyword: ['급수탑', '저수조', '비상소화', 'water', '수원', '탱크'], tab: 'waterTowers', label: '급수탑/저수조', subtitle: '급수탑·저수조·비상소화장치', icon: 'water_pump', color: 'text-cyan-400' },
      { keyword: ['응급', '응급실', '병원', '병상', 'er', '이송'], tab: 'er', label: '응급실 현황', subtitle: '실시간 가용 병상 조회', icon: 'local_hospital', color: 'text-green-400' },
      { keyword: ['건축', '건물', '대장', 'building', '층수', '구조', '면적', '용도'], tab: 'building', label: '건축물대장', subtitle: '주소 입력 → 건물 정보 즉시 조회', icon: 'apartment', color: 'text-purple-400' },
      { keyword: ['계산', '수압', '호스', '공기', 'calc', '마찰', '호흡기', '유해', '화학', 'hazmat'], tab: 'calculator', label: '소방 계산기', subtitle: '수압·호스·공기호흡기·Hazmat', icon: 'calculate', color: 'text-amber-400' },
      { keyword: ['달력', '일정', '교대', '근무', 'calendar', '공휴일', '스케줄'], tab: 'calendar', label: '달력/일정', subtitle: '교대 근무·공휴일', icon: 'calendar_month', color: 'text-orange-400' },
      { keyword: ['메모', '노트', 'memo', 'note', '인수인계', '기록'], tab: 'memo', label: '메모장', subtitle: '현장 메모·인수인계', icon: 'sticky_note_2', color: 'text-pink-400' },
    ];
    menuMap.forEach(m => {
      if (m.keyword.some(k => k.includes(q) || q.includes(k)) || m.label.toLowerCase().includes(q)) {
        out.push({
          id: `menu-${m.tab}`,
          title: m.label,
          subtitle: m.subtitle,
          icon: m.icon,
          tab: m.tab,
          color: m.color,
        });
      }
    });

    return out.slice(0, 8);
  })();

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.tab);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-80 ml-4 hidden md:block">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
      <input
        className="w-full pl-9 pr-4 py-2 bg-surface-container border-none rounded-full text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/30 focus:outline-none"
        placeholder="주소, 건물명, 응급실 검색..."
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true); setSelectedIdx(0); }}
        onFocus={() => query && setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {/* Shortcut hint */}
      {!query && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-outline border border-outline-variant/30 rounded px-1.5 py-0.5 font-mono">
          /
        </kbd>
      )}

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-outline-variant/10">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">{results.length}개 결과</span>
          </div>
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                i === selectedIdx ? 'bg-primary/10' : 'hover:bg-surface-container/50'
              }`}
            >
              <span className={`material-symbols-outlined text-lg ${r.color}`}>{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-surface truncate">{r.title}</p>
                <p className="text-[11px] text-on-surface-variant truncate">{r.subtitle}</p>
              </div>
              {i === selectedIdx && (
                <kbd className="text-[9px] text-outline border border-outline-variant/30 rounded px-1 py-0.5 font-mono shrink-0">↵</kbd>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && query.trim() && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 p-6 text-center">
          <span className="material-symbols-outlined text-2xl text-outline/40">search_off</span>
          <p className="text-sm text-on-surface-variant mt-1">검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  );
}
