import { useState, useCallback } from 'react';

// ─── SOP 데이터 ───
interface SOPStep {
  text: string;
  critical?: boolean; // 생명 관련 필수 단계
}

interface SOPData {
  id: string;
  title: string;
  icon: string;
  color: string;
  steps: SOPStep[];
}

const SOP_LIST: SOPData[] = [
  {
    id: 'building-fire',
    title: '일반 건물화재',
    icon: 'apartment',
    color: 'text-red-400',
    steps: [
      { text: '현장 도착 보고 (위치, 건물 구조, 화재 규모)', critical: true },
      { text: '지휘 체계 확립 (현장 지휘관 지정)' },
      { text: '인명 검색 실시 (요구조자 확인)', critical: true },
      { text: '화점 확인 및 진입 경로 결정' },
      { text: '안전관리관 배치 (2-in 2-out 원칙)', critical: true },
      { text: '소방용수 확보 (소화전 연결)' },
      { text: '주수 개시 (화점 직접 공격 또는 방어적 전술)' },
      { text: '연소 확대 방지 (인접 건물 경계 주수)' },
      { text: '배연 작업 (자연배연 또는 강제배연)' },
      { text: '잔화 정리 및 재발화 방지' },
      { text: '현장 보존 (화재 원인 조사용)' },
      { text: '최종 보고 및 철수' },
    ]
  },
  {
    id: 'highrise-fire',
    title: '고층 건물화재',
    icon: 'domain',
    color: 'text-orange-400',
    steps: [
      { text: '현장 도착 보고 (건물명, 층수, 화재 층)', critical: true },
      { text: '건물 관계자 접촉 (소방시설 현황 파악)' },
      { text: '비상용 승강기 확보 (화재 2개층 아래까지)' },
      { text: '전층 방송 (대피 안내)', critical: true },
      { text: '옥내소화전/연결송수관 확인 및 가압' },
      { text: '전진지휘소 설치 (화재 2개층 아래)' },
      { text: '인명 검색 (화재층 + 직상층 우선)', critical: true },
      { text: '사다리차 전개 (외부 구조 대비)' },
      { text: '스프링클러 작동 확인' },
      { text: '연결송수관 통한 옥내 주수' },
      { text: '상층부 연기 확산 감시' },
      { text: '교대 인력 배치 (장시간 작전 대비)' },
      { text: '최종 보고 및 철수' },
    ]
  },
  {
    id: 'underground-fire',
    title: '지하화재',
    icon: 'subway',
    color: 'text-purple-400',
    steps: [
      { text: '현장 도착 보고 (지하 깊이, 출입구 위치)', critical: true },
      { text: '지상 출입구 모두 확인 (배연/진입 경로)' },
      { text: '공기호흡기 착용 필수 (유독가스)', critical: true },
      { text: '열화상카메라 준비' },
      { text: '안전관리관 배치 (진입 대원 관리)', critical: true },
      { text: '무전 중계기 설치 (지하 통신 불량 대비)' },
      { text: '배연 작업 (지상 출입구 활용)' },
      { text: '인명 검색 (바닥 기어가며 검색)', critical: true },
      { text: '주수 시 감전 주의 (전기 차단 확인)' },
      { text: '퇴로 확보 (로프 라인 설치)' },
      { text: '교대 인력 15분 간격 투입' },
      { text: '최종 보고 및 철수' },
    ]
  },
  {
    id: 'vehicle-fire',
    title: '차량화재',
    icon: 'directions_car',
    color: 'text-blue-400',
    steps: [
      { text: '풍상측 접근 (바람 등지고)', critical: true },
      { text: '차량 연료 종류 확인 (가솔린/LPG/EV)', critical: true },
      { text: '교통 통제 요청' },
      { text: '2차 사고 방지 (안전 삼각대)' },
      { text: '인명 확인 (차량 내 탑승자)', critical: true },
      { text: 'EV 차량 시 고전압 주의 (600V 이상)' },
      { text: 'LPG 차량 시 폭발 경계 (안전거리 확보)' },
      { text: '엔진룸 화재 시 보닛 일부만 개방 후 주수' },
      { text: '하부 주수로 연료 화재 진압' },
      { text: '잔화 정리 및 재발화 감시' },
      { text: '견인 요청 및 현장 정리' },
    ]
  },
  {
    id: 'hazmat-fire',
    title: '위험물/화학 화재',
    icon: 'science',
    color: 'text-yellow-400',
    steps: [
      { text: '풍상측 접근 + 안전거리 확보', critical: true },
      { text: '물질 확인 (UN번호, GHS 라벨, MSDS)', critical: true },
      { text: '개인보호장비 착용 (화학보호복)', critical: true },
      { text: '제독/제염 구역 설정' },
      { text: '대피 구역 설정 (풍향 고려)', critical: true },
      { text: '물 사용 가능 여부 확인 (금수성 물질 주의)' },
      { text: '포소화약제 또는 건식소화기 사용 판단' },
      { text: '누출 차단 (가능한 경우)' },
      { text: '환경오염 방지 (유출 차단)' },
      { text: '관계 기관 통보 (환경부, 화학물질안전원)' },
      { text: '제염 후 철수' },
    ]
  },
  {
    id: 'gas-leak',
    title: '가스누출',
    icon: 'propane',
    color: 'text-green-400',
    steps: [
      { text: '현장 접근 시 전기 스파크 발생 금지', critical: true },
      { text: '가스 검지기로 농도 측정', critical: true },
      { text: '폭발 하한계(LEL) 확인 (메탄 5%, LPG 2.1%)' },
      { text: '주변 화기 사용 중지 + 전기 차단' },
      { text: '대피 구역 설정 (최소 50m)', critical: true },
      { text: '가스 밸브 차단 (가능한 경우)' },
      { text: '도시가스사 긴급 연락' },
      { text: '강제 환기 (스파크 방지 장비 사용)' },
      { text: '농도 재측정 후 안전 확인' },
      { text: '원인 확인 후 가스사에 인계' },
    ]
  },
  {
    id: 'forest-fire',
    title: '산림화재',
    icon: 'forest',
    color: 'text-emerald-400',
    steps: [
      { text: '풍향/풍속 확인 (확산 방향 예측)', critical: true },
      { text: '산림청/지자체 합동 대응 요청' },
      { text: '접근 도로 및 급수원 확인' },
      { text: '주민 대피 (화재 진행 방향)', critical: true },
      { text: '방화선 구축 (진행 방향 앞)' },
      { text: '헬기 요청 (대면적 시)' },
      { text: '비화 감시 (불씨 날림 주의)' },
      { text: '등산객/입산자 확인', critical: true },
      { text: '진화 후 잔불 감시 (24시간)' },
      { text: '재발화 방지 순찰' },
    ]
  },
  {
    id: 'electrical-fire',
    title: '전기화재',
    icon: 'bolt',
    color: 'text-sky-400',
    steps: [
      { text: '감전 위험 — 전원 차단 최우선', critical: true },
      { text: '한전 긴급 요청 (단전)', critical: true },
      { text: '전원 차단 전 물 주수 금지', critical: true },
      { text: 'C급 소화기 사용 (CO2, 분말)' },
      { text: '변압기 화재 시 절연유 누출 주의' },
      { text: '전원 차단 확인 후 일반 주수 가능' },
      { text: '잔화 정리 시 감전 주의 (절연 장갑)' },
      { text: '한전 확인 후 현장 인계' },
    ]
  },
];

export default function SOPChecklist() {
  const [selectedSOP, setSelectedSOP] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [timestamps, setTimestamps] = useState<Record<string, Date>>({});

  const currentSOP = SOP_LIST.find(s => s.id === selectedSOP);

  const toggleCheck = useCallback((stepKey: string) => {
    setChecked(prev => {
      const newChecked = { ...prev, [stepKey]: !prev[stepKey] };
      if (!prev[stepKey]) {
        setTimestamps(ts => ({ ...ts, [stepKey]: new Date() }));
      }
      return newChecked;
    });
  }, []);

  const resetChecks = () => {
    if (!currentSOP) return;
    if (window.confirm('체크 내용을 초기화하시겠습니까?')) {
      const keys = currentSOP.steps.map((_, i) => `${currentSOP.id}-${i}`);
      setChecked(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
      setTimestamps(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
    }
  };

  const getProgress = (sop: SOPData): number => {
    const total = sop.steps.length;
    const done = sop.steps.filter((_, i) => checked[`${sop.id}-${i}`]).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const copyReport = async () => {
    if (!currentSOP) return;
    const ts = new Date().toLocaleString('ko-KR');
    let text = `📋 SOP 체크리스트: ${currentSOP.title}\n📅 ${ts}\n${'─'.repeat(30)}\n\n`;

    currentSOP.steps.forEach((step, i) => {
      const key = `${currentSOP.id}-${i}`;
      const isDone = checked[key];
      const time = timestamps[key];
      const emoji = isDone ? '✅' : step.critical ? '⚠️' : '⬜';
      text += `${emoji} ${step.text}`;
      if (time) text += ` (${time.toLocaleTimeString('ko-KR')})`;
      text += '\n';
    });

    const progress = getProgress(currentSOP);
    text += `\n${'─'.repeat(30)}\n진행률: ${progress}%\n`;

    try {
      await navigator.clipboard.writeText(text);
      alert('체크리스트가 복사되었습니다.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/10 rounded-xl">
              <span className="material-symbols-outlined text-green-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>checklist</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">현장 대응 체크리스트</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                화재 유형별 표준작전절차 (SOP)
              </p>
            </div>
          </div>
          {currentSOP && (
            <div className="flex gap-2">
              <button onClick={resetChecks}
                className="bg-surface-container text-on-surface-variant px-3 py-2 rounded-lg text-sm font-bold hover:bg-surface-container-high transition-colors flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">restart_alt</span>
                초기화
              </button>
              <button onClick={copyReport}
                className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">content_copy</span>
                복사
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SOP 선택 그리드 */}
      {!selectedSOP && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SOP_LIST.map(sop => {
            const progress = getProgress(sop);
            return (
              <button
                key={sop.id}
                onClick={() => setSelectedSOP(sop.id)}
                className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-left hover:border-primary/30 hover:scale-[1.02] transition-all group relative overflow-hidden"
              >
                {progress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`material-symbols-outlined ${sop.color} text-2xl`}>{sop.icon}</span>
                </div>
                <p className="text-sm font-bold text-on-surface">{sop.title}</p>
                <p className="text-[10px] text-on-surface-variant mt-1">{sop.steps.length}단계</p>
                {progress > 0 && (
                  <p className="text-[10px] text-green-400 font-bold mt-1">{progress}% 완료</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 선택된 SOP 체크리스트 */}
      {currentSOP && (
        <>
          <button
            onClick={() => setSelectedSOP(null)}
            className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            다른 SOP 선택
          </button>

          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            {/* SOP 헤더 */}
            <div className="p-5 border-b border-outline-variant/10 bg-surface-container/30">
              <div className="flex items-center gap-3 mb-3">
                <span className={`material-symbols-outlined ${currentSOP.color} text-2xl`}>{currentSOP.icon}</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-on-surface">{currentSOP.title}</h3>
                  <p className="text-xs text-on-surface-variant">
                    {currentSOP.steps.filter((_, i) => checked[`${currentSOP.id}-${i}`]).length} / {currentSOP.steps.length} 완료
                  </p>
                </div>
                <span className="text-2xl font-black text-green-400 font-headline">
                  {getProgress(currentSOP)}%
                </span>
              </div>
              {/* 진행 바 */}
              <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${getProgress(currentSOP)}%` }}
                />
              </div>
            </div>

            {/* 단계 리스트 */}
            <div className="divide-y divide-outline-variant/10">
              {currentSOP.steps.map((step, i) => {
                const key = `${currentSOP.id}-${i}`;
                const isDone = checked[key];
                const time = timestamps[key];

                return (
                  <button
                    key={i}
                    onClick={() => toggleCheck(key)}
                    className={`w-full text-left p-4 transition-all flex items-start gap-3 ${
                      isDone ? 'bg-green-500/5' : step.critical ? 'bg-red-500/5' : 'hover:bg-surface-container/30'
                    }`}
                  >
                    {/* 체크박스 */}
                    <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                      isDone
                        ? 'bg-green-500 border-green-500'
                        : step.critical
                          ? 'border-red-400/50'
                          : 'border-outline-variant/30'
                    }`}>
                      {isDone && <span className="material-symbols-outlined text-white text-sm">check</span>}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className={`text-sm font-medium ${isDone ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                          {step.text}
                        </span>
                        {step.critical && !isDone && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                            필수
                          </span>
                        )}
                      </div>
                      {time && (
                        <p className="text-[10px] text-green-400 mt-1">
                          ✓ {time.toLocaleTimeString('ko-KR')}
                        </p>
                      )}
                    </div>

                    {/* 번호 */}
                    <span className="text-xs text-on-surface-variant/50 font-mono shrink-0">{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
