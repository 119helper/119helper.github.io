import { useState, useRef } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

// 8단계 평가 항목 정의
const EVALUATION_STEPS = [
  {
    id: 1,
    title: '현장 도착 · 상황 파악',
    icon: 'location_on',
    description: '현장 도착 시 초기 상황 확인',
    items: [
      { key: 'building_type', label: '건물 구조', options: ['RC조', '철골조', 'PC조', '조적조', '목조', '기타'] },
      { key: 'building_use', label: '건물 용도', options: ['주거', '상업', '공장', '창고', '학교', '병원', '복합', '기타'] },
      { key: 'building_floors', label: '층수', options: ['1층', '2~3층', '4~5층', '6~10층', '11층 이상', '지하'] },
      { key: 'fire_floor', label: '화재 층', type: 'text', placeholder: '예: 3층, 지하1층' },
    ],
  },
  {
    id: 2,
    title: '인명 검색 현황',
    icon: 'person_search',
    description: '인명 피해 및 검색 상황',
    items: [
      { key: 'rescue_status', label: '인명 검색', options: ['미착수', '진행 중', '완료'] },
      { key: 'trapped_persons', label: '요구조자', options: ['없음', '1~2명', '3~5명', '다수', '미확인'] },
      { key: 'evacuated', label: '대피 현황', options: ['완료', '진행 중', '미대피', '확인 불가'] },
    ],
  },
  {
    id: 3,
    title: '화재 진행 상황',
    icon: 'local_fire_department',
    description: '연기색, 화염 범위, 진행 방향',
    items: [
      { key: 'smoke_color', label: '연기색', options: ['백색', '회색', '흑색', '황색', '없음'] },
      { key: 'flame_range', label: '화염 범위', options: ['국부', '1개실', '1개층', '다층', '전체'] },
      { key: 'fire_progress', label: '진행 상태', options: ['성장기', '최성기', '감쇠기', '진화 완료'] },
    ],
  },
  {
    id: 4,
    title: '건물 구조 안전',
    icon: 'gpp_maybe',
    description: '붕괴 위험 및 구조 안전성 평가',
    items: [
      { key: 'collapse_risk', label: '붕괴 위험', options: ['낮음', '보통', '높음', '매우 높음'] },
      { key: 'structural_damage', label: '구조 손상', options: ['없음', '경미', '중간', '심각'] },
      { key: 'access_safe', label: '진입 안전', options: ['안전', '주의', '위험', '진입 불가'] },
    ],
  },
  {
    id: 5,
    title: '수리(水利) 확보',
    icon: 'water_drop',
    description: '소방용수 확보 상태',
    items: [
      { key: 'water_supply', label: '수원 확보', options: ['확보 완료', '확보 중', '부족', '없음'] },
      { key: 'hydrant_distance', label: '소화전 거리', options: ['50m 이내', '100m 이내', '200m 이내', '200m 초과'] },
      { key: 'water_pressure', label: '수압 상태', options: ['양호', '보통', '약함', '미확인'] },
    ],
  },
  {
    id: 6,
    title: '연소 확대 위험',
    icon: 'warning',
    description: '인접 건물 및 확산 위험 평가',
    items: [
      { key: 'spread_risk', label: '확산 위험', options: ['낮음', '보통', '높음', '매우 높음'] },
      { key: 'adjacent_buildings', label: '인접 건물', options: ['없음', '이격 충분', '밀집 지역', '연소 우려'] },
      { key: 'hazmat_present', label: '위험물 존재', options: ['없음', '소량', '다량', '미확인'] },
    ],
  },
  {
    id: 7,
    title: '추가 자원 요청',
    icon: 'groups',
    description: '필요 인력·장비 판단',
    items: [
      { key: 'additional_engine', label: '추가 펌프차', options: ['불필요', '1대', '2대', '3대 이상'] },
      { key: 'additional_ladder', label: '사다리차', options: ['불필요', '필요', '긴급'] },
      { key: 'additional_rescue', label: '구조대', options: ['불필요', '필요', '긴급'] },
      { key: 'additional_ems', label: '구급대', options: ['불필요', '필요', '다수 필요'] },
    ],
  },
  {
    id: 8,
    title: '지휘 체계 확인',
    icon: 'shield_person',
    description: '현장 지휘 및 통신 체계',
    items: [
      { key: 'command_established', label: '지휘 체계', options: ['확립', '미확립', '변경 필요'] },
      { key: 'comm_status', label: '통신 상태', options: ['양호', '간헐적', '불량', '두절'] },
      { key: 'safety_officer', label: '안전관리관', options: ['배치 완료', '미배치', '교체 필요'] },
    ],
  },
];

type EvalStatus = '미입력' | '양호' | '주의' | '위험';

const ITEM_STATUS_RULES: Record<string, Partial<Record<string, EvalStatus>>> = {
  trapped_persons: {
    '없음': '양호',
    '1~2명': '주의',
    '3~5명': '위험',
    '다수': '위험',
    '미확인': '주의',
  },
  structural_damage: {
    '없음': '양호',
    '경미': '양호',
    '중간': '주의',
    '심각': '위험',
  },
  adjacent_buildings: {
    '없음': '양호',
    '이격 충분': '양호',
    '밀집 지역': '주의',
    '연소 우려': '위험',
  },
  hazmat_present: {
    '없음': '양호',
    '소량': '주의',
    '다량': '위험',
    '미확인': '주의',
  },
  water_supply: {
    '확보 완료': '양호',
    '확보 중': '주의',
    '부족': '위험',
    '없음': '위험',
  },
};

function getItemStatus(value: string | undefined): EvalStatus {
  if (!value) return '미입력';
  const dangerWords = ['높음', '매우 높음', '심각', '위험', '진입 불가', '다량', '불량', '두절', '없음', '부족', '미대피', '미확립', '흑색', '최성기', '다층', '전체', '밀집', '연소', '긴급', '교체'];
  const cautionWords = ['보통', '주의', '중간', '진행 중', '미착수', '미확인', '약함', '간헐적', '미배치', '회색', '성장기', '1개층'];
  
  if (dangerWords.some(w => value.includes(w))) return '위험';
  if (cautionWords.some(w => value.includes(w))) return '주의';
  return '양호';
}

function getItemStatusByKey(key: string, value?: string): EvalStatus {
  if (!value) return '미입력';

  const rule = ITEM_STATUS_RULES[key];
  if (rule && rule[value]) return rule[value]!;

  return getItemStatus(value);
}

function getStepStatus(stepId: number, values: Record<string, string>): EvalStatus {
  const step = EVALUATION_STEPS.find(s => s.id === stepId);
  if (!step) return '미입력';
  
  const answered = step.items.filter(item => values[item.key]);
  if (answered.length === 0) return '미입력';

  const statuses = answered.map(item => getItemStatusByKey(item.key, values[item.key]));
  if (statuses.includes('위험')) return '위험';
  if (statuses.includes('주의')) return '주의';
  return '양호';
}

const STATUS_STYLES: Record<EvalStatus, { bg: string; text: string; dot: string; border: string }> = {
  '미입력': { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', dot: 'bg-on-surface-variant/30', border: 'border-outline-variant/20' },
  '양호': { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-400', border: 'border-green-500/30' },
  '주의': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', border: 'border-yellow-500/30' },
  '위험': { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400 animate-pulse', border: 'border-red-500/30' },
};

const STORAGE_KEY = '119helper-field-assessment';

export default function FieldAssessment() {
  const [values, setValues, resetValues] = useLocalStorageState<Record<string, string>>(STORAGE_KEY, {});
  const [activeStep, setActiveStep] = useState(1);
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const handleSelect = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: prev[key] === value ? '' : value }));
  };

  const handleTextChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const completedSteps = EVALUATION_STEPS.filter(step =>
    step.items.some(item => values[item.key])
  ).length;

  const handleReset = () => {
    if (window.confirm('평가 내용을 모두 초기화하시겠습니까?')) {
      resetValues();
      setActiveStep(1);
      setShowSummary(false);
    }
  };

  const generateSummaryText = () => {
    const timestamp = new Date().toLocaleString('ko-KR');
    let text = `📋 현장 평가 보고서\n⏰ ${timestamp}\n${'─'.repeat(30)}\n\n`;

    EVALUATION_STEPS.forEach(step => {
      const status = getStepStatus(step.id, values);
      const emoji = status === '양호' ? '🟢' : status === '주의' ? '🟡' : '🔴';
      text += `${emoji} [${step.id}단계] ${step.title}\n`;
      step.items.forEach(item => {
        const val = values[item.key] || '미입력';
        text += `   └ ${item.label}: ${val}\n`;
      });
      text += '\n';
    });

    const overallDanger = EVALUATION_STEPS.filter(s => getStepStatus(s.id, values) === '위험').length;
    const overallCaution = EVALUATION_STEPS.filter(s => getStepStatus(s.id, values) === '주의').length;
    const overallGood = EVALUATION_STEPS.filter(s => getStepStatus(s.id, values) === '양호').length;
    text += `${'─'.repeat(30)}\n`;
    text += `종합: 위험 ${overallDanger}건 | 주의 ${overallCaution}건 | 양호 ${overallGood}건\n`;

    return text;
  };

  const handleCopy = async () => {
    const text = generateSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      alert('평가 보고서가 클립보드에 복사되었습니다.');
    } catch {
      // 폴백: 텍스트 영역에 복사
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      alert(ok ? '평가 보고서가 복사되었습니다.' : '복사에 실패했습니다.');
    }
  };

  const handleShare = async () => {
    const text = generateSummaryText();
    if (navigator.share) {
      try {
        await navigator.share({ title: '현장 평가 보고서', text });
      } catch { /* 사용자 취소 */ }
    } else {
      handleCopy();
    }
  };

  const currentStep = EVALUATION_STEPS.find(s => s.id === activeStep) || EVALUATION_STEPS[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl">
              <span className="material-symbols-outlined text-red-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">현장 평가 (팔단기)</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                8단계 현장 진행 평가 · {completedSteps}/8 단계 입력됨
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleReset}
              className="bg-surface-container text-on-surface-variant px-3 py-2 rounded-lg text-sm font-bold hover:bg-surface-container-high transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-lg">restart_alt</span>
              초기화
            </button>
            <button type="button" onClick={() => setShowSummary(!showSummary)}
              className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-lg">summarize</span>
              {showSummary ? '입력으로' : '종합 보기'}
            </button>
          </div>
        </div>

        {/* 진행 바 */}
        <div className="flex gap-1.5 mt-4">
          {EVALUATION_STEPS.map(step => {
            const status = getStepStatus(step.id, values);
            const hasData = step.items.some(item => values[item.key]);
            const style = STATUS_STYLES[status];
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => { setActiveStep(step.id); setShowSummary(false); }}
                className={`flex-1 h-2 rounded-full transition-all ${
                  activeStep === step.id && !showSummary
                    ? 'bg-primary scale-y-150'
                    : hasData
                      ? style.dot
                      : 'bg-surface-container-high'
                }`}
                title={`${step.id}단계: ${step.title}`}
              />
            );
          })}
        </div>
      </div>

      {/* 종합 요약 */}
      {showSummary ? (
        <div ref={summaryRef} className="space-y-3">
          {/* 종합 상태 카드 */}
          <div className="grid grid-cols-3 gap-3">
            {(['양호', '주의', '위험'] as EvalStatus[]).map(status => {
              const count = EVALUATION_STEPS.filter(s => getStepStatus(s.id, values) === status).length;
              const style = STATUS_STYLES[status];
              return (
                <div key={status} className={`${style.bg} border ${style.border} rounded-xl p-4 text-center`}>
                  <p className={`text-3xl font-black ${style.text} font-headline`}>{count}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{status}</p>
                </div>
              );
            })}
          </div>

          {/* 각 단계 요약 */}
          {EVALUATION_STEPS.map(step => {
            const status = getStepStatus(step.id, values);
            const style = STATUS_STYLES[status];
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => { setActiveStep(step.id); setShowSummary(false); }}
                className={`w-full text-left ${style.bg} border ${style.border} rounded-xl p-4 hover:scale-[1.01] transition-all`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full ${style.dot} flex items-center justify-center text-white text-sm font-black`}>
                    {step.id}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined ${style.text} text-lg`}>{step.icon}</span>
                      <span className="text-sm font-bold text-on-surface">{step.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${style.bg} ${style.text} border ${style.border}`}>
                        {status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                      {step.items.map(item => (
                        <span key={item.key} className="text-xs text-on-surface-variant">
                          {item.label}: <span className="font-bold text-on-surface">{values[item.key] || '─'}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* 공유 버튼 */}
          <div className="flex gap-3">
            <button type="button" onClick={handleCopy}
              className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined text-lg">content_copy</span>
              보고서 복사
            </button>
            <button type="button" onClick={handleShare}
              className="flex-1 bg-secondary-container text-on-secondary-container py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-secondary-container/80 transition-colors">
              <span className="material-symbols-outlined text-lg">share</span>
              공유
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 단계 네비 */}
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {EVALUATION_STEPS.map(step => {
              const status = getStepStatus(step.id, values);
              const isActive = activeStep === step.id;
              const hasData = step.items.some(item => values[item.key]);
              const style = STATUS_STYLES[status];
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                      : hasData
                        ? `${style.bg} ${style.text} border ${style.border}`
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isActive ? 'bg-on-primary/20 text-on-primary' : hasData ? `${style.dot} text-white` : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {step.id}
                  </span>
                  {step.title.split(' · ')[0]}
                </button>
              );
            })}
          </div>

          {/* 현재 단계 입력 폼 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-outline-variant/10 bg-surface-container/30">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">{currentStep.icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">
                    {currentStep.id}단계: {currentStep.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant">{currentStep.description}</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {currentStep.items.map(item => (
                <div key={item.key}>
                  <label className="text-sm font-bold text-on-surface mb-2 block">{item.label}</label>
                  {'type' in item && item.type === 'text' ? (
                    <input
                      type="text"
                      value={values[item.key] || ''}
                      onChange={e => handleTextChange(item.key, e.target.value)}
                      placeholder={'placeholder' in item ? (item.placeholder as string) : ''}
                      className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {'options' in item && (item.options as string[]).map(opt => {
                        const isSelected = values[item.key] === opt;
                        const optStatus = getItemStatusByKey(item.key, opt);
                        const optStyle = STATUS_STYLES[optStatus];
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleSelect(item.key, opt)}
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                              isSelected
                                ? `${optStyle.bg} ${optStyle.text} border-2 ${optStyle.border} scale-105 shadow-lg`
                                : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                            }`}
                          >
                            {isSelected && <span className={`inline-block w-2 h-2 rounded-full ${optStyle.dot} mr-1.5`} />}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 다음/이전 네비 */}
            <div className="p-4 border-t border-outline-variant/10 bg-surface-container/20 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
                disabled={activeStep === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
                이전
              </button>
              <span className="text-xs text-on-surface-variant font-bold">{activeStep} / 8</span>
              {activeStep < 8 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep(prev => Math.min(8, prev + 1))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  다음
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSummary(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  종합 보기
                  <span className="material-symbols-outlined text-lg">summarize</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
