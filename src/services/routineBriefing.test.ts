// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRIVACY_SETTINGS, savePrivacySettings } from './privacySettings';
import { loadRoutineBriefing } from './routineBriefing';

describe('loadRoutineBriefing', () => {
  beforeEach(() => localStorage.clear());

  it('summarizes routine state without exposing notes, addresses, contacts, or schedule memos', () => {
    const now = new Date(2026, 6, 31, 9, 30).getTime();
    localStorage.setItem('119helper-schedules', JSON.stringify([
      {
        id: 'today-1',
        date: '2026-07-31',
        title: '  월간 장비 점검 회의  ',
        type: '점검',
        memo: '회의 암호와 상세 참석자',
      },
      {
        id: 'tomorrow-1',
        date: '2026-08-01',
        title: '내일 교육',
        type: '교육',
        memo: '',
      },
    ]));
    localStorage.setItem('119helper-notes', JSON.stringify([
      { id: 'note-1', text: '민감한 개인 메모', color: 'yellow', createdAt: 'now' },
      { id: 'note-empty', text: '   ', color: 'blue', createdAt: 'now' },
    ]));
    localStorage.setItem('119helper-preplans', JSON.stringify([
      {
        id: 'plan-old',
        name: '이전 대상물',
        address: '노출하면 안 되는 주소',
        contacts: [{ name: '관계인', phone: '010-0000-0000' }],
        updatedAt: 100,
      },
      {
        id: 'plan-new',
        name: '최근 대상물',
        address: '다른 민감 주소',
        contacts: [],
        updatedAt: 200,
      },
      {
        id: 'legacy-empty-plan',
        name: '',
        address: '',
        hazards: [],
        facilities: [],
        contacts: [],
        photoKeys: [],
        accessNotes: '',
        updatedAt: 300,
      },
    ]));
    localStorage.setItem('119helper-equipment-checklist', JSON.stringify({
      'scba-1': true,
      'ppe-1': true,
      'retired-item': true,
    }));
    localStorage.setItem('119helper-equipment-checklist-date', JSON.stringify('2026-07-31'));

    const snapshot = loadRoutineBriefing(now);

    expect(snapshot).toMatchObject({
      todayScheduleCount: 1,
      todayScheduleTitle: '월간 장비 점검 회의',
      noteCount: 2,
      prePlanCount: 2,
      recentPrePlanName: '최근 대상물',
      checklistChecked: 2,
      checklistTotal: 13,
      checklistProgress: 15,
    });
    expect(JSON.stringify(snapshot)).not.toContain('민감한 개인 메모');
    expect(JSON.stringify(snapshot)).not.toContain('노출하면 안 되는 주소');
    expect(JSON.stringify(snapshot)).not.toContain('010-0000-0000');
    expect(JSON.stringify(snapshot)).not.toContain('회의 암호');
  });

  it('treats a checklist without today date as not yet checked', () => {
    const now = new Date(2026, 6, 31, 9, 30).getTime();
    localStorage.setItem('119helper-equipment-checklist', JSON.stringify({
      'scba-1': true,
      'ppe-1': true,
    }));
    localStorage.setItem('119helper-equipment-checklist-date', JSON.stringify('2026-07-30'));

    expect(loadRoutineBriefing(now)).toMatchObject({
      checklistChecked: 0,
      checklistTotal: 13,
      checklistProgress: 0,
    });
  });

  it('returns an empty briefing and removes routine data in public-device mode', () => {
    savePrivacySettings({
      ...DEFAULT_PRIVACY_SETTINGS,
      publicDeviceMode: true,
    });
    localStorage.setItem('119helper-schedules', JSON.stringify([
      { date: '2026-07-31', title: '노출 금지 일정' },
    ]));
    localStorage.setItem('119helper-notes', JSON.stringify([
      { text: '노출 금지 메모' },
    ]));

    expect(loadRoutineBriefing(new Date(2026, 6, 31).getTime())).toMatchObject({
      todayScheduleCount: 0,
      todayScheduleTitle: null,
      noteCount: 0,
      prePlanCount: 0,
      recentPrePlanName: null,
      checklistChecked: 0,
    });
    expect(localStorage.getItem('119helper-schedules')).toBeNull();
    expect(localStorage.getItem('119helper-notes')).toBeNull();
  });
});
