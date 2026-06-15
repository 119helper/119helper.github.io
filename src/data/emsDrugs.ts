// 구급 약물 참고 데이터(정적). 체중기반 용량 자동계산용.
// ⚠️ 참고용 — 실제 투약은 의료지도·표준지침·현장 판단을 우선한다. 사용 전 최신 지침 확인 필수.
// 출처: 소방청 119구급대원 현장응급처치 표준지침 / 대한심폐소생협회(KACPR) 가이드라인 공개본 기반.

export interface EmsDrug {
  id: string;
  name: string;
  indication: string;       // 적응증
  dosePerKg: number;        // 체중당 용량
  unit: string;             // 용량 단위 (mg, mcg, mEq, mL 등)
  concentration: number;    // 농도 (unit / mL) — 0이면 용적 계산 생략
  concentrationLabel: string;
  maxDose: number | null;   // 1회 최대 용량 (단위 동일), 없으면 null
  route: string;            // 투여 경로
  pediatric: boolean;       // 소아 적용 가능 여부
  notes?: string;
  source: string;
  revisedYear: number;
}

const SOURCE = '소방청 구급대원 표준지침 / KACPR';
const YEAR = 2023;

export const EMS_DRUGS: EmsDrug[] = [
  {
    id: 'epinephrine-cardiac',
    name: '에피네프린 (심정지)',
    indication: '심정지 — 무맥성 전기활동/무수축, 제세동 불응성 VF/pVT',
    dosePerKg: 0.01,
    unit: 'mg',
    concentration: 0.1,
    concentrationLabel: '1:10,000 (0.1mg/mL)',
    maxDose: 1,
    route: 'IV/IO',
    pediatric: true,
    notes: '3~5분마다 반복. 성인 표준 1회 1mg.',
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'epinephrine-anaphylaxis',
    name: '에피네프린 (아나필락시스)',
    indication: '아나필락시스 — 근육주사',
    dosePerKg: 0.01,
    unit: 'mg',
    concentration: 1,
    concentrationLabel: '1:1,000 (1mg/mL)',
    maxDose: 0.5,
    route: 'IM (대퇴부 외측)',
    pediatric: true,
    notes: '성인 최대 0.5mg, 소아 최대 0.3mg. 5~15분 간격 반복 가능.',
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'amiodarone',
    name: '아미오다론',
    indication: '제세동 불응성 VF/무맥성 VT',
    dosePerKg: 5,
    unit: 'mg',
    concentration: 50,
    concentrationLabel: '50mg/mL',
    maxDose: 300,
    route: 'IV/IO',
    pediatric: true,
    notes: '성인 초회 300mg. 소아 5mg/kg.',
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'midazolam',
    name: '미다졸람',
    indication: '경련(발작) 조절',
    dosePerKg: 0.1,
    unit: 'mg',
    concentration: 5,
    concentrationLabel: '5mg/mL',
    maxDose: 5,
    route: 'IV/IM/비강',
    pediatric: true,
    notes: '호흡억제 주의. 경로별 용량 차이 확인.',
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'dextrose10',
    name: '포도당 10% (저혈당)',
    indication: '증상성 저혈당',
    dosePerKg: 5,
    unit: 'mL',
    concentration: 0,
    concentrationLabel: '10% 용액',
    maxDose: null,
    route: 'IV',
    pediatric: true,
    notes: '소아 5mL/kg(10% DW). 혈당 재측정.',
    source: SOURCE,
    revisedYear: YEAR,
  },
  {
    id: 'naloxone',
    name: '날록손',
    indication: '아편계(마약) 중독 — 호흡억제',
    dosePerKg: 0.1,
    unit: 'mg',
    concentration: 0.4,
    concentrationLabel: '0.4mg/mL',
    maxDose: 2,
    route: 'IV/IM/비강',
    pediatric: true,
    notes: '효과 없으면 2~3분 간격 반복. 성인 통상 0.4~2mg.',
    source: SOURCE,
    revisedYear: YEAR,
  },
];
