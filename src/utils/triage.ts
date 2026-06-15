// 다수사상자(MCI) 중증도 분류 — START(성인) / JumpSTART(소아) 순수 로직.
// 분류 결과: red(긴급) > yellow(응급) > green(경증/비응급) > black(사망/지연).

export type TriageColor = 'red' | 'yellow' | 'green' | 'black';

export const TRIAGE_META: Record<TriageColor, { label: string; tag: string; color: string }> = {
  red: { label: '긴급', tag: 'I', color: 'red' },
  yellow: { label: '응급', tag: 'II', color: 'yellow' },
  green: { label: '경증', tag: 'III', color: 'green' },
  black: { label: '사망/지연', tag: '0', color: 'gray' },
};

// ── START (성인) ──────────────────────────────────────────────
export interface StartAnswers {
  canWalk?: boolean;
  breathing?: boolean;            // 자발호흡
  breathingAfterAirway?: boolean; // 기도개방 후 호흡 (breathing === false 일 때만)
  respRateOver30?: boolean;       // 호흡수 30회/분 초과 (breathing === true 일 때만)
  perfusionOk?: boolean;          // 요골맥박 촉지 또는 모세혈관 재충혈 < 2초
  obeysCommands?: boolean;        // 지시 수행
}

/**
 * START 알고리즘. 분류에 필요한 답이 부족하면 null.
 */
export function classifyStart(a: StartAnswers): TriageColor | null {
  if (a.canWalk === undefined) return null;
  if (a.canWalk) return 'green';

  if (a.breathing === undefined) return null;
  if (!a.breathing) {
    if (a.breathingAfterAirway === undefined) return null;
    return a.breathingAfterAirway ? 'red' : 'black';
  }

  if (a.respRateOver30 === undefined) return null;
  if (a.respRateOver30) return 'red';

  if (a.perfusionOk === undefined) return null;
  if (!a.perfusionOk) return 'red';

  if (a.obeysCommands === undefined) return null;
  return a.obeysCommands ? 'yellow' : 'red';
}

// ── JumpSTART (소아) ─────────────────────────────────────────
export interface JumpStartAnswers {
  canWalk?: boolean;
  breathing?: boolean;
  breathingAfterAirway?: boolean;   // breathing === false
  pulsePresent?: boolean;           // breathing===false && breathingAfterAirway===false
  breathingAfter5Breaths?: boolean; // pulsePresent === true
  respRate15to45?: boolean;         // breathing === true (정상 15~45회/분)
  pulsePalpable?: boolean;          // breathing === true && respRate15to45 === true
  avpuAppropriate?: boolean;        // A/V/P(적절) → true, P(부적절)/U → false
}

/**
 * JumpSTART 알고리즘(소아). 분류에 필요한 답이 부족하면 null.
 */
export function classifyJumpStart(a: JumpStartAnswers): TriageColor | null {
  if (a.canWalk === undefined) return null;
  if (a.canWalk) return 'green';

  if (a.breathing === undefined) return null;
  if (!a.breathing) {
    if (a.breathingAfterAirway === undefined) return null;
    if (a.breathingAfterAirway) return 'red';

    if (a.pulsePresent === undefined) return null;
    if (!a.pulsePresent) return 'black';

    if (a.breathingAfter5Breaths === undefined) return null;
    return a.breathingAfter5Breaths ? 'red' : 'black';
  }

  if (a.respRate15to45 === undefined) return null;
  if (!a.respRate15to45) return 'red';

  if (a.pulsePalpable === undefined) return null;
  if (!a.pulsePalpable) return 'red';

  if (a.avpuAppropriate === undefined) return null;
  return a.avpuAppropriate ? 'yellow' : 'red';
}
