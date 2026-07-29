import { describe, expect, it } from 'vitest';
import { EQUIPMENT_CHECKLIST_TOTAL, CHECKLIST_SECTIONS } from './equipmentChecklist';
import { ERG_CHEMICALS, ERG_DATA_STATUS } from './ergChemicals';
import {
  STRESS_CHECK_QUESTIONS,
  evaluateStressCheck,
} from './wellnessResources';

describe('operational reference completeness guards', () => {
  it('does not present unverified ERG rows as edition-verified', () => {
    expect(Object.keys(ERG_CHEMICALS)).toHaveLength(30);
    expect(ERG_DATA_STATUS.verificationStatus).toBe('item-by-item-comparison-pending');
    expect(ERG_DATA_STATUS.referenceEdition).toBe('PHMSA ERG 2024');
  });

  it('does not hard-code one SCBA fill pressure for every device', () => {
    const labels = CHECKLIST_SECTIONS.flatMap(section => section.items.map(item => item.label));
    expect(labels).toHaveLength(EQUIPMENT_CHECKLIST_TOTAL);
    expect(labels.join(' ')).not.toContain('250bar');
    expect(labels.join(' ')).toContain('제조사·소속 기관 기준');
  });

  it('keeps the six-question wellness score non-diagnostic at every score', () => {
    const low = evaluateStressCheck(STRESS_CHECK_QUESTIONS.map(() => 0));
    const high = evaluateStressCheck(STRESS_CHECK_QUESTIONS.map(() => 3));

    expect(low.level).toBe('unvalidated');
    expect(high.level).toBe('unvalidated');
    expect(low.label).toBe('비검증 참고 점수');
    expect(high.label).toBe('비검증 참고 점수');
    expect(high.advice).toContain('검증된 임상 절단점이 없습니다');
  });
});
