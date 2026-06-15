import type { EmsDrug } from '../data/emsDrugs';

export interface DrugDoseResult {
  doseAmount: number;     // 투여 용량 (drug.unit)
  volumeMl: number | null; // 용적 (mL), 농도 0이면 null
  cappedByMax: boolean;   // 최대용량 상한이 적용됐는지
}

/**
 * 체중기반 약물 용량 계산. 최대용량 상한을 적용하고 농도로 용적(mL)을 산출한다.
 * @returns 비정상 입력(체중 0 이하/비정상)이면 null
 */
export function calculateDrugDose(drug: EmsDrug, weightKg: number): DrugDoseResult | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 300) return null;

  const raw = drug.dosePerKg * weightKg;
  const cappedByMax = drug.maxDose !== null && raw > drug.maxDose;
  const doseAmount = cappedByMax ? drug.maxDose! : raw;
  const rounded = Math.round(doseAmount * 1000) / 1000;

  const volumeMl =
    drug.concentration > 0 ? Math.round((doseAmount / drug.concentration) * 100) / 100 : null;

  return { doseAmount: rounded, volumeMl, cappedByMax };
}

// ── GCS (Glasgow Coma Scale) ──────────────────────────────────
export interface GcsResult {
  total: number;
  severity: '경증' | '중등도' | '중증';
}

/**
 * GCS 합산. eye 1~4, verbal 1~5, motor 1~6 범위를 벗어나면 null.
 */
export function calculateGCS(eye: number, verbal: number, motor: number): GcsResult | null {
  if (!inRange(eye, 1, 4) || !inRange(verbal, 1, 5) || !inRange(motor, 1, 6)) return null;
  const total = eye + verbal + motor;
  const severity = total >= 13 ? '경증' : total >= 9 ? '중등도' : '중증';
  return { total, severity };
}

// ── APGAR ─────────────────────────────────────────────────────
export interface ApgarScores {
  appearance: number; // 피부색
  pulse: number;      // 심박수
  grimace: number;    // 반사
  activity: number;   // 근긴장도
  respiration: number; // 호흡
}

export interface ApgarResult {
  total: number;
  status: '양호' | '중등도 곤란' | '심한 곤란';
}

/**
 * APGAR 점수 합산. 각 항목 0~2 범위를 벗어나면 null.
 */
export function calculateAPGAR(scores: ApgarScores): ApgarResult | null {
  const values = [scores.appearance, scores.pulse, scores.grimace, scores.activity, scores.respiration];
  if (values.some(v => !inRange(v, 0, 2))) return null;
  const total = values.reduce((a, b) => a + b, 0);
  const status = total >= 7 ? '양호' : total >= 4 ? '중등도 곤란' : '심한 곤란';
  return { total, status };
}

function inRange(v: number, min: number, max: number): boolean {
  return Number.isInteger(v) && v >= min && v <= max;
}
