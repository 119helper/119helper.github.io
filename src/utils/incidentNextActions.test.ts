import { describe, expect, it } from 'vitest';
import type { IncidentNextActionContext } from './incidentNextActions';
import {
  buildIncidentNextActions,
  currentIncidentNextActions,
} from './incidentNextActions';

function context(overrides: Partial<IncidentNextActionContext> = {}): IncidentNextActionContext {
  return {
    type: 'fire',
    title: '상가 화재',
    note: '',
    activityLabels: [],
    ...overrides,
  };
}

describe('incident next actions', () => {
  it.each([
    ['fire', ['building', 'fire-water', 'road']],
    ['ems', ['triage', 'hospital', 'ems-protocol']],
    ['rescue', ['hazards', 'building', 'road']],
    ['support', ['road', 'building', 'fire-water']],
  ] as const)('shows the first operational checks for %s', (type, expected) => {
    const actions = buildIncidentNextActions(context({ type }));
    expect(currentIncidentNextActions(actions).map(action => action.id)).toEqual(expected);
  });

  it('uses title and note hazards to move relevant checks to the front without duplication', () => {
    const actions = buildIncidentNextActions(context({
      type: 'support',
      title: '야산 지원 출동',
      note: '가스 누출 및 부상자 다수',
    }));

    expect(actions.map(action => action.id)).toEqual([
      'hazmat',
      'wildfire',
      'triage',
      'road',
      'building',
      'fire-water',
      'activity-log',
    ]);
    expect(actions[0].target).toEqual({
      kind: 'tab',
      tab: 'calculator',
      subId: 'hazmat_calc',
    });
  });

  it('advances reviewed and selected checks while preserving the remaining order', () => {
    const actions = buildIncidentNextActions(context({
      activityLabels: ['건축물 열람'],
      selections: {
        fireWater: {
          id: 'FW-1',
          selectedAt: 2_000,
          type: '소화전',
          address: '서울 중구',
          status: '정상',
          sourceDate: '2026-05-07',
        },
      },
    }));

    expect(actions.filter(action => action.completed).map(action => action.id)).toEqual([
      'building',
      'fire-water',
    ]);
    expect(currentIncidentNextActions(actions).map(action => action.id)).toEqual(['road', 'hazards']);
  });

  it('does not treat a generic poisoning incident as a chemical spill', () => {
    const actions = buildIncidentNextActions(context({
      type: 'ems',
      title: '약물 중독 구급',
    }));

    expect(actions.slice(0, 2).map(action => action.id)).toEqual(['triage', 'hazards']);
    expect(actions.some(action => action.id === 'hazmat')).toBe(false);
  });

  it('treats a recorded patient as completing the patient-board check', () => {
    const actions = buildIncidentNextActions(context({ type: 'ems', hasTriagePatients: true }));
    expect(actions.find(action => action.id === 'triage')?.completed).toBe(true);
    expect(currentIncidentNextActions(actions)[0]?.id).toBe('hospital');
  });
});
