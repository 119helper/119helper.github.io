import { useState, useMemo } from 'react';

// ─── 데이터 ───
const SECTIONS = [
  {
    id: 'fire-level',
    title: '화재 대응단계',
    icon: 'local_fire_department',
    color: 'text-red-400',
    items: [
      { code: '대응1단계', desc: '소방차 4~8대 출동, 일반 건물화재 · 소규모 화재', detail: '펌프차 2~4, 물탱크차 1~2, 구급차 1' },
      { code: '대응2단계', desc: '소방차 10~15대, 중규모 화재 · 인명피해 우려', detail: '펌프차 5~7, 물탱크차 3~4, 사다리차 1, 구조대 1' },
      { code: '대응3단계', desc: '소방차 20대 이상, 대형 화재 · 다수 인명피해', detail: '인접 소방서 지원, 구조대 2개 이상' },
      { code: '대응4단계', desc: '전 소방력 투입, 재난급 화재', detail: '타 시도 지원 요청, 군 지원 가능' },
    ]
  },
  {
    id: 'situation',
    title: '상황 보고 코드',
    icon: 'campaign',
    color: 'text-orange-400',
    items: [
      { code: '상황 A', desc: '화재 진압 완료', detail: '잔화 정리 중, 인원 철수 가능' },
      { code: '상황 B', desc: '화재 진행 중 (진압 중)', detail: '추가 인력/장비 불필요' },
      { code: '상황 C', desc: '화재 확대 중', detail: '추가 지원 필요' },
      { code: '오버', desc: '교신 종료', detail: '보고 끝' },
      { code: '로저/알겠음', desc: '수신 확인', detail: '지시 이해, 수행 예정' },
      { code: '네거티브', desc: '불가/부정', detail: '수행 불가 또는 해당 없음' },
      { code: '고', desc: '출동 개시', detail: '차량 출발' },
      { code: '도착', desc: '현장 도착', detail: '현장 도착 보고' },
      { code: '귀서', desc: '소방서 복귀', detail: '현장 철수, 복귀 중' },
    ]
  },
  {
    id: 'phonetic',
    title: '무전 숫자 읽기',
    icon: 'dialpad',
    color: 'text-blue-400',
    items: [
      { code: '0', desc: '공 (영)', detail: '혼동 방지: "공"으로 읽음' },
      { code: '1', desc: '하나', detail: '' },
      { code: '2', desc: '둘', detail: '' },
      { code: '3', desc: '셋 (삼)', detail: '' },
      { code: '4', desc: '넷', detail: '' },
      { code: '5', desc: '다섯 (오)', detail: '' },
      { code: '6', desc: '여섯', detail: '' },
      { code: '7', desc: '일곱', detail: '' },
      { code: '8', desc: '여덟 (팔)', detail: '' },
      { code: '9', desc: '아홉 (구)', detail: '' },
    ]
  },
  {
    id: 'report',
    title: '상황 보고 양식',
    icon: 'description',
    color: 'text-green-400',
    items: [
      { code: '최초 보고', desc: '화재 발생 최초 보고', detail: '① 위치 ② 건물구조/용도 ③ 연기/화염 상태 ④ 인명피해 여부 ⑤ 현장 지휘자 성명' },
      { code: '중간 보고', desc: '진행 상황 중간 보고', detail: '① 화재 진행 상황 ② 진압 현황 ③ 인명 검색 현황 ④ 추가 지원 필요 여부' },
      { code: '최종 보고', desc: '화재 진압 완료 보고', detail: '① 진압 완료 시각 ② 피해 규모 ③ 인명피해 현황 ④ 잔화 정리 상태 ⑤ 화재 원인 추정' },
      { code: '인명 보고', desc: '인명 상황 보고', detail: '① 사망자 수 ② 부상자 수 (중상/경상) ③ 이송 병원 ④ 실종자 수 ⑤ 대피 현황' },
    ]
  },
  {
    id: 'signal',
    title: '경보 신호',
    icon: 'notifications_active',
    color: 'text-purple-400',
    items: [
      { code: '비상 퇴출 신호', desc: '호각 3회 연속 또는 사이렌 단속', detail: '전 대원 즉시 퇴출. 건물 붕괴 위험, 급격한 화세 확대 시' },
      { code: '위험 경고', desc: '호각 2회 반복', detail: '위험 상황 발생, 주의 필요' },
      { code: '집합 신호', desc: '호각 1회 장음', detail: '지휘관 앞 집합' },
      { code: 'MAYDAY', desc: '대원 위급 상황', detail: '대원이 고립/부상. 즉시 구조 투입. "메이데이 메이데이 메이데이" 3회 반복' },
    ]
  },
  {
    id: 'terms',
    title: '현장 용어',
    icon: 'menu_book',
    color: 'text-cyan-400',
    items: [
      { code: '플래시오버', desc: 'Flashover — 전실 화재', detail: '실내 온도 500~600°C 도달 시 모든 가연물 동시 착화. 생존 불가 상태.' },
      { code: '백드래프트', desc: 'Backdraft — 역화', detail: '밀폐 공간에 산소 유입 시 폭발적 연소. 문 개방 전 반드시 열기/연기 확인.' },
      { code: '롤오버', desc: 'Rollover — 천장 화염', detail: '천장부 고온 가스 착화. 플래시오버 전조.' },
      { code: 'RICS', desc: '고속분무 냉각기법', detail: '실내 진입 전 천장부 고온가스를 고속분무로 냉각' },
      { code: '방어적 전술', desc: 'Defensive — 외부 진압', detail: '내부 진입 불가 시 외부에서만 주수' },
      { code: '공격적 전술', desc: 'Offensive — 내부 진입', detail: '내부 진입 가능 시 화점 직접 공격' },
      { code: '2-in 2-out', desc: '진입 안전 원칙', detail: '2명 이상 진입 시 외부 대기조 2명 필수' },
      { code: 'RIT', desc: 'Rapid Intervention Team', detail: '긴급 구출팀 — MAYDAY 시 즉시 투입' },
    ]
  },
];

export default function RadioCodes() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item =>
        item.code.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.detail.toLowerCase().includes(q)
      )
    })).filter(s => s.items.length > 0);
  }, [search]);

  const visibleSections = activeSection
    ? filtered.filter(s => s.id === activeSection)
    : filtered;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            <span className="material-symbols-outlined text-blue-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>radio</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">무전 코드 · 현장 용어</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">화재 대응단계, 상황 보고, 경보 신호, 용어 사전</p>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="코드, 용어, 설명 검색..."
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <button
          onClick={() => setActiveSection(null)}
          className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
            !activeSection ? 'bg-primary text-on-primary shadow-lg' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          전체
        </button>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
              activeSection === s.id ? 'bg-primary text-on-primary shadow-lg' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{s.icon}</span>
            {s.title}
          </button>
        ))}
      </div>

      {/* 컨텐츠 */}
      {visibleSections.map(section => (
        <div key={section.id} className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-outline-variant/10 bg-surface-container/30 flex items-center gap-2">
            <span className={`material-symbols-outlined ${section.color} text-lg`}>{section.icon}</span>
            <h3 className="text-sm font-bold text-on-surface">{section.title}</h3>
            <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">{section.items.length}</span>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {section.items.map(item => {
              const isExpanded = expandedItem === `${section.id}-${item.code}`;
              return (
                <button
                  key={item.code}
                  onClick={() => setExpandedItem(isExpanded ? null : `${section.id}-${item.code}`)}
                  className="w-full text-left p-4 hover:bg-surface-container/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-sm font-black ${section.color} bg-surface-container px-2.5 py-1 rounded-lg whitespace-nowrap`}>
                      {item.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface font-medium">{item.desc}</p>
                      {isExpanded && item.detail && (
                        <p className="text-xs text-on-surface-variant mt-2 leading-relaxed bg-surface-container/50 rounded-lg p-3">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    <span className={`material-symbols-outlined text-on-surface-variant text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
