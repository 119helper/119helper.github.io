// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  isCompletedSchedule,
  isTrackedSchedule,
  loadSchedules,
  saveSchedules,
} from './scheduleStore';

describe('scheduleStore', () => {
  beforeEach(() => localStorage.clear());

  it('loads a v1 calendar event without turning it into overdue work or rewriting storage', () => {
    const raw = JSON.stringify([{
      id: 'legacy-1',
      date: '2026-07-30',
      title: ' 기존 교육 일정 ',
      type: '교육',
      memo: '',
    }]);
    localStorage.setItem('119helper-schedules', raw);

    const [schedule] = loadSchedules();

    expect(schedule).toMatchObject({
      id: 'legacy-1',
      title: ' 기존 교육 일정 ',
    });
    expect(isTrackedSchedule(schedule!)).toBe(false);
    expect(isCompletedSchedule(schedule!)).toBe(false);
    expect(localStorage.getItem('119helper-schedules')).toBe(raw);
  });

  it('keeps valid v2 completion state and drops malformed records safely', () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([
      {
        id: 'done-1',
        date: '2026-07-31',
        title: '완료 업무',
        type: '점검',
        memo: '',
        trackCompletion: true,
        completedAt: 1234,
      },
      {
        id: 'broken',
        date: 'not-a-date',
        title: '손상 일정',
        type: '알 수 없음',
        memo: '',
      },
      null,
    ]));

    const schedules = loadSchedules();

    expect(schedules).toHaveLength(1);
    expect(isTrackedSchedule(schedules[0]!)).toBe(true);
    expect(isCompletedSchedule(schedules[0]!)).toBe(true);
  });

  it('preserves but ignores a completion timestamp when tracking is disabled', () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([{
      id: 'event-1',
      date: '2026-07-31',
      title: '달력 행사',
      type: '근무',
      memo: '',
      completedAt: 1234,
    }]));

    const [schedule] = loadSchedules();

    expect(schedule?.completedAt).toBe(1234);
    expect(isCompletedSchedule(schedule!)).toBe(false);
  });

  it('preserves legacy long text and unknown fields when the list is saved again', () => {
    const original = {
      id: 'legacy-long',
      date: '기존-비정규-날짜',
      title: ` 앞뒤 공백 ${'제목'.repeat(120)} `,
      type: '기타',
      memo: ` ${'장문 메모'.repeat(1_100)} `,
      legacyMetadata: {
        owner: '재국',
        version: 7,
      },
    };
    localStorage.setItem('119helper-schedules', JSON.stringify([original]));

    const schedules = loadSchedules();
    expect(saveSchedules(schedules)).toBe(true);

    expect(JSON.parse(localStorage.getItem('119helper-schedules') ?? '[]')[0]).toEqual(original);
  });
});
