// 열압박(Heat Stress) 추정 유틸.
// 흑구온도계 미측정 환경이므로 기온·습도 기반의 "간이 WBGT 추정식"을 사용한다.
// (호주 기상국 등에서 통용되는 근사식) — 실제 측정값과 차이가 있을 수 있어 참고용이다.

export type HeatLevel = 'low' | 'caution' | 'warning' | 'danger' | 'extreme';

export interface HeatStressResult {
  wbgt: number;          // 추정 WBGT (°C)
  level: HeatLevel;
  label: string;         // 한글 등급명
  color: string;         // Tailwind 색상 토큰 계열
  workMinutes: number;   // 권장 연속 작업 시간(분) / 시간당
  restMinutes: number;   // 권장 휴식 시간(분) / 시간당
  advice: string;
}

/**
 * 수증기압(hPa) 계산 — Tetens 식.
 */
function vapourPressureHpa(tempC: number, humidityPct: number): number {
  const saturation = 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return (humidityPct / 100) * saturation;
}

/**
 * 간이 WBGT 추정 (그늘/실내 근사). 햇빛·복사열은 반영되지 않으므로 옥외 직사광에서는 과소평가될 수 있다.
 * @returns 추정 WBGT(°C), 입력이 비정상이면 null
 */
export function estimateWbgt(tempC: number, humidityPct: number): number | null {
  if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) return null;
  if (humidityPct < 0 || humidityPct > 100) return null;

  const e = vapourPressureHpa(tempC, humidityPct);
  const wbgt = 0.567 * tempC + 0.393 * e + 3.94;
  return Math.round(wbgt * 10) / 10;
}

/**
 * 추정 WBGT를 5단계 등급 + 권장 작업/휴식 비율로 분류한다.
 * 구간은 고용노동부·기상청 폭염 단계 및 일반 작업장 가이드를 단순화한 값이다(중등도 작업 기준).
 */
export function classifyHeatStress(wbgt: number): HeatStressResult {
  let level: HeatLevel;
  let label: string;
  let color: string;
  let workMinutes: number;
  let restMinutes: number;
  let advice: string;

  if (wbgt < 25) {
    level = 'low';
    label = '관심';
    color = 'green';
    workMinutes = 60;
    restMinutes = 0;
    advice = '정상 활동 가능. 수분을 규칙적으로 섭취하세요.';
  } else if (wbgt < 28) {
    level = 'caution';
    label = '주의';
    color = 'yellow';
    workMinutes = 45;
    restMinutes = 15;
    advice = '시간당 15분 휴식 권장. 갈증을 느끼기 전에 물을 마시세요.';
  } else if (wbgt < 30) {
    level = 'warning';
    label = '경고';
    color = 'orange';
    workMinutes = 30;
    restMinutes = 30;
    advice = '작업·휴식 1:1 권장. 그늘에서 체온을 낮추고 2인 1조로 상태를 확인하세요.';
  } else if (wbgt < 32) {
    level = 'danger';
    label = '위험';
    color = 'red';
    workMinutes = 15;
    restMinutes = 45;
    advice = '연속작업 15분 이내. 보냉조끼·냉각 적극 활용, 열사병 징후를 즉시 보고하세요.';
  } else {
    level = 'extreme';
    label = '매우 위험';
    color = 'purple';
    workMinutes = 10;
    restMinutes = 50;
    advice = '필수 활동만 최소 인원으로. 교대 주기를 단축하고 의무·구급 대기 상태를 유지하세요.';
  }

  return { wbgt, level, label, color, workMinutes, restMinutes, advice };
}
