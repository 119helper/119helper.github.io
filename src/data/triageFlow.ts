import type { StartAnswers, JumpStartAnswers } from '../utils/triage';

export interface TriageStep<A> {
  field: keyof A;
  question: string;
  yesLabel: string; // true 선택지
  noLabel: string;  // false 선택지
  visible: (a: A) => boolean;
}

// START (성인) 질문 흐름 — 조건부 노출
export const START_STEPS: TriageStep<StartAnswers>[] = [
  {
    field: 'canWalk',
    question: '보행이 가능한가?',
    yesLabel: '보행 가능',
    noLabel: '보행 불가',
    visible: () => true,
  },
  {
    field: 'breathing',
    question: '자발 호흡이 있는가?',
    yesLabel: '호흡 있음',
    noLabel: '호흡 없음',
    visible: a => a.canWalk === false,
  },
  {
    field: 'breathingAfterAirway',
    question: '기도 개방 후 호흡이 돌아오는가?',
    yesLabel: '호흡 회복',
    noLabel: '여전히 무호흡',
    visible: a => a.canWalk === false && a.breathing === false,
  },
  {
    field: 'respRateOver30',
    question: '호흡수가 30회/분을 초과하는가?',
    yesLabel: '30회 초과',
    noLabel: '30회 이하',
    visible: a => a.canWalk === false && a.breathing === true,
  },
  {
    field: 'perfusionOk',
    question: '요골맥박 촉지 또는 모세혈관 재충혈 < 2초인가?',
    yesLabel: '관류 양호',
    noLabel: '관류 불량',
    visible: a => a.canWalk === false && a.breathing === true && a.respRateOver30 === false,
  },
  {
    field: 'obeysCommands',
    question: '간단한 지시에 따르는가?',
    yesLabel: '지시 수행',
    noLabel: '수행 못함',
    visible: a =>
      a.canWalk === false && a.breathing === true && a.respRateOver30 === false && a.perfusionOk === true,
  },
];

// JumpSTART (소아) 질문 흐름
export const JUMPSTART_STEPS: TriageStep<JumpStartAnswers>[] = [
  {
    field: 'canWalk',
    question: '보행이 가능한가?',
    yesLabel: '보행 가능',
    noLabel: '보행 불가',
    visible: () => true,
  },
  {
    field: 'breathing',
    question: '자발 호흡이 있는가?',
    yesLabel: '호흡 있음',
    noLabel: '호흡 없음',
    visible: a => a.canWalk === false,
  },
  {
    field: 'breathingAfterAirway',
    question: '기도 개방(체위) 후 호흡이 있는가?',
    yesLabel: '호흡 있음',
    noLabel: '무호흡',
    visible: a => a.canWalk === false && a.breathing === false,
  },
  {
    field: 'pulsePresent',
    question: '맥박이 촉지되는가?',
    yesLabel: '맥박 있음',
    noLabel: '맥박 없음',
    visible: a => a.canWalk === false && a.breathing === false && a.breathingAfterAirway === false,
  },
  {
    field: 'breathingAfter5Breaths',
    question: '인공호흡 5회 후 호흡이 돌아오는가?',
    yesLabel: '호흡 회복',
    noLabel: '여전히 무호흡',
    visible: a =>
      a.canWalk === false &&
      a.breathing === false &&
      a.breathingAfterAirway === false &&
      a.pulsePresent === true,
  },
  {
    field: 'respRate15to45',
    question: '호흡수가 15~45회/분 범위인가?',
    yesLabel: '정상 범위',
    noLabel: '비정상',
    visible: a => a.canWalk === false && a.breathing === true,
  },
  {
    field: 'pulsePalpable',
    question: '맥박이 촉지되는가?',
    yesLabel: '맥박 있음',
    noLabel: '맥박 없음',
    visible: a => a.canWalk === false && a.breathing === true && a.respRate15to45 === true,
  },
  {
    field: 'avpuAppropriate',
    question: 'AVPU — A/V/P(적절) 인가? (P-자세이상/U는 아니오)',
    yesLabel: 'A·V·P적절',
    noLabel: 'P부적절·U',
    visible: a =>
      a.canWalk === false &&
      a.breathing === true &&
      a.respRate15to45 === true &&
      a.pulsePalpable === true,
  },
];
