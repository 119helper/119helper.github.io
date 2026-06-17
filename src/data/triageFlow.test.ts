import { describe, expect, it } from 'vitest';
import { JUMPSTART_STEPS, START_STEPS, type TriageStep } from './triageFlow';
import {
  classifyJumpStart,
  classifyStart,
  type JumpStartAnswers,
  type StartAnswers,
  type TriageColor,
} from '../utils/triage';

// 현재 답변 상태에서 "다음에 보여줘야 할(아직 답 안 한, 노출 조건 충족)" 질문
function nextStep<A>(steps: TriageStep<A>[], answers: A): TriageStep<A> | null {
  return steps.find(s => s.visible(answers) && (answers as Record<string, unknown>)[s.field as string] === undefined) ?? null;
}

interface PathResult<A> {
  answers: A;
  color: TriageColor | null;
}

// 모든 yes/no 분기를 DFS로 시뮬레이션하면서 UI 흐름과 분류 로직의 정합성을 검사
function walkAllPaths<A>(
  steps: TriageStep<A>[],
  classify: (a: A) => TriageColor | null,
  answers: A = {} as A,
  results: PathResult<A>[] = [],
): PathResult<A>[] {
  const color = classify(answers);

  // 핵심 속성 1: 분류가 이미 확정됐다면 더 물어볼 질문이 없어야 한다 (과잉 질문 방지)
  if (color !== null) {
    expect(nextStep(steps, answers)).toBeNull();
    results.push({ answers, color });
    return results;
  }

  // 핵심 속성 2: 분류 미확정이면 반드시 다음 질문이 있어야 한다 (막다른 길 방지)
  const step = nextStep(steps, answers);
  expect(step).not.toBeNull();

  for (const val of [true, false]) {
    walkAllPaths(steps, classify, { ...answers, [step!.field]: val }, results);
  }
  return results;
}

describe('triage flow ↔ algorithm consistency', () => {
  it('START: every yes/no path reaches a definitive category, never over-asks', () => {
    const paths = walkAllPaths<StartAnswers>(START_STEPS, classifyStart);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p.color !== null)).toBe(true);
    // 4색 분류가 모두 도달 가능해야 한다
    const colors = new Set(paths.map(p => p.color));
    expect(colors).toEqual(new Set<TriageColor>(['red', 'yellow', 'green', 'black']));
  });

  it('JumpSTART: every yes/no path reaches a definitive category, never over-asks', () => {
    const paths = walkAllPaths<JumpStartAnswers>(JUMPSTART_STEPS, classifyJumpStart);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p.color !== null)).toBe(true);
    const colors = new Set(paths.map(p => p.color));
    expect(colors).toEqual(new Set<TriageColor>(['red', 'yellow', 'green', 'black']));
  });

  it('START: a walking patient is immediately GREEN with no further questions', () => {
    expect(classifyStart({ canWalk: true })).toBe('green');
    expect(nextStep(START_STEPS, { canWalk: true })).toBeNull();
  });

  it('START: apneic patient who does not respond to airway is BLACK', () => {
    expect(classifyStart({ canWalk: false, breathing: false, breathingAfterAirway: false })).toBe('black');
  });

  it('every step field is unique within each flow', () => {
    const startFields = START_STEPS.map(s => s.field);
    expect(new Set(startFields).size).toBe(startFields.length);
    const jumpFields = JUMPSTART_STEPS.map(s => s.field);
    expect(new Set(jumpFields).size).toBe(jumpFields.length);
  });
});
