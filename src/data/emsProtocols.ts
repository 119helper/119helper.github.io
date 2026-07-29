// 증상별 응급처치 프로토콜 참고 데이터(정적).
// ⚠️ 참고용 — 실제 처치는 의료지도·표준지침·현장 판단을 우선한다.
// 운용 기준: 소방청 119구급대원 현장응급처치 표준지침 2023년 개정본.
// 2026-07-29 확인 결과 소방청이 공개한 현장 표준지침의 최신 개정본은 2023년판이다.
// KACPR은 별도의 2025 심폐소생술 가이드라인을 공개했으므로 모든 항목의 공통 출처로 표기하지 않는다.

export type ProtocolCategory = '심정지' | '아나필락시스' | '경련' | '중독' | '분만' | '외상';

export interface EmsProtocol {
  id: string;
  title: string;
  category: ProtocolCategory;
  steps: string[];
  cautions: string[];
  source: string;
  revisedYear: number;
}

export const EMS_SOURCE_INFO = {
  operationalBaseline: '소방청 119구급대원 현장응급처치 표준지침',
  baselineYear: 2023,
  latestCprGuideline: '대한심폐소생협회 2025년 한국 심폐소생술 가이드라인',
  lastChecked: '2026-07-29',
  nfaUrl: 'https://www.nfa.go.kr/nfa/publicrelations/legalinformation/archives/?cntId=50&mode=view',
  kacprUrl: 'https://www.kacpr.org/download/2025%EB%85%84%20%ED%95%9C%EA%B5%AD%20%EC%8B%AC%ED%8F%90%EC%86%8C%EC%83%9D%EC%88%A0%20%EA%B0%80%EC%9D%B4%EB%93%9C%EB%9D%BC%EC%9D%B8.pdf',
} as const;

const SOURCE = EMS_SOURCE_INFO.operationalBaseline;
const YEAR = 2023;

export const EMS_PROTOCOLS: EmsProtocol[] = [
  {
    id: 'cardiac-arrest',
    title: '성인 심정지 (BLS/ACLS)',
    category: '심정지',
    steps: [
      '반응·호흡 확인 → 무반응·무호흡/비정상호흡이면 심정지 선언, 119 추가자원 요청',
      '즉시 가슴압박 시작 (속도 100~120회/분, 깊이 5~6cm, 완전 이완)',
      'AED/제세동기 부착 → 리듬 분석, 제세동 적응 리듬이면 즉시 제세동',
      '30:2 또는 비동기 환기 (기도확보 후 6초당 1회 환기)',
      '2분마다 압박 교대 및 리듬 재분석, 가역적 원인(5H5T) 교정',
      '의료지도에 따라 에피네프린/아미오다론 투여',
    ],
    cautions: [
      '압박 중단 최소화 (10초 이내)',
      '과환기 금지',
      '소아·익수·외상성 심정지는 별도 프로토콜 확인',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'anaphylaxis',
    title: '아나필락시스',
    category: '아나필락시스',
    steps: [
      '원인 노출 중단, 기도·호흡·순환 평가',
      '에피네프린 근육주사(대퇴부 외측) — 지체 없이',
      '앙와위 + 하지거상 (호흡곤란 시 좌위 허용)',
      '고농도 산소 투여, 필요 시 보조환기',
      '의료지도에 따라 수액·기관지확장제 고려',
      '5~15분 무반응 시 에피네프린 재투여',
    ],
    cautions: [
      '에피네프린 투여 지연이 가장 흔한 사망 요인',
      '이중상(biphasic) 반응 가능 — 호전돼도 이송·관찰 필수',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'seizure',
    title: '경련(발작) 지속',
    category: '경련',
    steps: [
      '주변 위험물 제거, 머리 보호, 손상 방지 (억지로 붙잡지 않음)',
      '기도 확보 — 측위, 흡인 준비',
      '산소 투여, 혈당 측정 (저혈당 교정)',
      '5분 이상 지속 또는 반복 시 의료지도 하 미다졸람 투여 고려',
      '발작 후 회복자세, 활력징후·산소포화도 감시',
    ],
    cautions: [
      '입에 이물질·손가락 삽입 금지',
      '벤조디아제핀 투여 시 호흡억제 감시',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'opioid-overdose',
    title: '아편계(마약) 중독',
    category: '중독',
    steps: [
      '안전 확보, 기도·호흡 평가 (호흡억제·동공축소·의식저하)',
      '기도확보 및 보조환기(BVM), 고농도 산소',
      '의료지도에 따라 날록손 투여 (IV/IM/비강)',
      '효과 부족 시 2~3분 간격 반복',
      '재중독(반감기 차이) 대비 지속 감시·이송',
    ],
    cautions: [
      '날록손 투여 후 급성 금단·공격성 가능',
      '환기가 우선, 날록손은 보조',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'childbirth',
    title: '응급 분만',
    category: '분만',
    steps: [
      '분만 임박 징후 평가(배림·진통 간격), 청결한 환경 확보',
      '산모 체위·호흡 유도, 아두 만출 시 천천히 지지',
      '신생아 기도 확보·보온·건조, 자극으로 호흡 유도',
      'APGAR 평가(1분·5분), 필요 시 신생아 소생술',
      '제대 관리 및 태반 만출 관찰, 산모 출혈 감시',
    ],
    cautions: [
      '제대탈출·둔위 등 이상분만은 즉시 의료지도',
      '신생아 저체온 방지',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'major-trauma',
    title: '중증 외상 (1차 평가)',
    category: '외상',
    steps: [
      'C-ABC: 치명적 외부출혈 압박지혈 → 기도(경추보호) → 호흡 → 순환',
      '경추 보호 및 전신 고정 적응증 평가',
      '긴장성 기흉·대량출혈 등 즉각 위협 처치',
      '고농도 산소, 보온, 쇼크 처치',
      '신속 이송(적정 외상센터) 및 사전연락',
    ],
    cautions: [
      '현장 체류 최소화(플래티넘 10분)',
      '저체온·저혈압·산증 악순환 차단',
    ],
    source: SOURCE,
    revisedYear: YEAR,
  },
];
