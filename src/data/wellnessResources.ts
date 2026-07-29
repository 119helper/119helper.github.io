// 소방대원 심신건강·트라우마 상담 안내(정적). 외부 링크/번호는 표기만 하며 앱은 연결을 강제하지 않는다.
// 번호·기관명은 변경될 수 있으니 사용 전 확인 권장.

export interface WellnessResource {
  id: string;
  name: string;
  desc: string;
  phone?: string;
  url?: string;
  category: 'trauma' | 'counsel' | 'emergency';
}

export const WELLNESS_RESOURCES: WellnessResource[] = [
  {
    id: 'firefighter-mental-health-center',
    name: '소방청 소방심신건강증진 사업 / 마음건강센터',
    desc: '소방공무원 대상 심리상담·트라우마 관리. 소속 본부 마음건강 담당 또는 권역 센터로 연계.',
    category: 'counsel',
  },
  {
    id: 'national-trauma-center',
    name: '국가트라우마센터',
    desc: '재난·사고 경험자의 심리적 응급처치 및 트라우마 상담 정보 제공.',
    url: 'https://www.nct.go.kr',
    category: 'trauma',
  },
  {
    id: 'mental-health-helpline',
    name: '정신건강상담전화',
    desc: '24시간 정신건강 위기상담 (전국 공통).',
    phone: '1577-0199',
    category: 'emergency',
  },
  {
    id: 'lifeline',
    name: '자살예방상담전화',
    desc: '24시간 자살·위기 상담.',
    phone: '109',
    category: 'emergency',
  },
];

export interface StressCheckQuestion {
  id: string;
  text: string;
}

// 간이 스트레스 자가체크(참고용). 0(전혀 아니다)~3(매우 그렇다) 4점 척도.
export const STRESS_CHECK_QUESTIONS: StressCheckQuestion[] = [
  { id: 'q1', text: '최근 출동 장면이 자꾸 떠오르거나 꿈에 나타난다' },
  { id: 'q2', text: '사소한 일에도 쉽게 놀라거나 예민해진다' },
  { id: 'q3', text: '잠들기 어렵거나 자주 깬다' },
  { id: 'q4', text: '특정 현장·상황을 피하고 싶다' },
  { id: 'q5', text: '무기력하거나 감정이 무뎌진 느낌이 든다' },
  { id: 'q6', text: '집중이 잘 되지 않는다' },
];

export interface StressCheckResult {
  score: number;
  max: number;
  level: 'unvalidated';
  label: string;
  advice: string;
}

export function evaluateStressCheck(answers: number[]): StressCheckResult {
  const score = answers.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const max = STRESS_CHECK_QUESTIONS.length * 3;
  return {
    score,
    max,
    level: 'unvalidated',
    label: '비검증 참고 점수',
    advice: '이 6문항과 점수에는 검증된 임상 절단점이 없습니다. 점수로 상태를 판단하지 말고, 불편감이 지속되거나 위기 상황이면 전문 상담과 소속 기관 지원 절차를 이용하세요.',
  };
}
