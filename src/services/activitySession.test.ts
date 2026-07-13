// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVITY_SESSION_KEY,
  appendActivityEvent,
  loadActivitySession,
  recordActivityStage,
  startActivityFromIncident,
} from './activitySession';

describe('activitySession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts the matching activity preset and records dispatch automatically', () => {
    startActivityFromIncident({
      type: 'ems',
      title: '광주 환자 이송',
      note: '의식 저하',
      startedAt: 1234,
    });

    const session = loadActivitySession();
    expect(session.presetId).toBe('ems');
    expect(session.title).toBe('광주 환자 이송');
    expect(session.stamps).toEqual([
      expect.objectContaining({ stageId: 'dispatch', label: '출동', time: 1234 }),
    ]);
  });

  it('appends incident tool activity without removing the dispatch stamp', () => {
    startActivityFromIncident({ type: 'fire', title: '상가 화재', startedAt: 1000 });
    appendActivityEvent('소방용수 열람', 2000);

    const stored = JSON.parse(localStorage.getItem(ACTIVITY_SESSION_KEY) || '{}');
    expect(stored.stamps).toHaveLength(2);
    expect(stored.stamps[1]).toEqual(expect.objectContaining({ label: '소방용수 열람', time: 2000 }));
  });

  it('records a named activity stage only once', () => {
    startActivityFromIncident({ type: 'fire', title: '상가 화재', startedAt: 1000 });

    expect(recordActivityStage('arrival', '현장도착', 2000).recorded).toBe(true);
    expect(recordActivityStage('arrival', '현장도착', 3000).recorded).toBe(false);

    const arrivals = loadActivitySession().stamps.filter(stamp => stamp.stageId === 'arrival');
    expect(arrivals).toEqual([
      expect.objectContaining({ label: '현장도착', time: 2000 }),
    ]);
  });

  it('keeps support incidents on the support activity preset', () => {
    const session = startActivityFromIncident({ type: 'support', title: '급수 지원', startedAt: 1000 });
    expect(session.presetId).toBe('support');
  });
});
