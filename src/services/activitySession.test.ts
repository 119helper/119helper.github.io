// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVITY_SESSION_KEY,
  appendActivityEvent,
  loadActivitySession,
  recordActivityStage,
  removeActivityStage,
  saveActivitySession,
  startActivityFromIncident,
  updateActivityStageTime,
} from './activitySession';

describe('activitySession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts the matching activity preset and records dispatch automatically', () => {
    startActivityFromIncident({
      incidentId: 'incident-1234',
      type: 'ems',
      title: '광주 환자 이송',
      note: '의식 저하',
      startedAt: 1234,
      location: { lat: 35.1595, lng: 126.8526 },
    });

    const session = loadActivitySession();
    expect(session.presetId).toBe('ems');
    expect(session.incidentId).toBe('incident-1234');
    expect(session.title).toBe('광주 환자 이송');
    expect(session.stamps).toEqual([
      expect.objectContaining({
        stageId: 'dispatch',
        label: '출동',
        time: 1234,
        lat: 35.1595,
        lon: 126.8526,
      }),
    ]);
  });

  it('appends incident tool activity without removing the dispatch stamp', () => {
    startActivityFromIncident({ type: 'fire', title: '상가 화재', startedAt: 1000 });
    appendActivityEvent('소방용수 열람', 2000);

    const stored = JSON.parse(localStorage.getItem(ACTIVITY_SESSION_KEY) || '{}');
    expect(stored.stamps).toHaveLength(2);
    expect(stored.stamps[1]).toEqual(expect.objectContaining({ label: '소방용수 열람', time: 2000 }));
  });

  it('does not append a delayed event to a different incident', () => {
    const current = startActivityFromIncident({
      incidentId: 'incident-current',
      type: 'fire',
      title: '상가 화재',
      startedAt: 1000,
    });

    expect(appendActivityEvent('이전 출동 변화', 2000, 'incident-old')).toEqual(current);
    expect(loadActivitySession().stamps).toHaveLength(1);
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

  it('updates a recorded stage time without losing its GPS coordinates', () => {
    startActivityFromIncident({ type: 'fire', title: '상가 화재', startedAt: 1000 });
    saveActivitySession({
      ...loadActivitySession(),
      stamps: [
        ...loadActivitySession().stamps,
        { stageId: 'arrival', label: '현장도착', time: 2000, lat: 37.5, lon: 126.9 },
      ],
    });

    expect(updateActivityStageTime('arrival', 2500, 3000).changed).toBe(true);
    expect(loadActivitySession().stamps.find(stamp => stamp.stageId === 'arrival')).toMatchObject({
      time: 2500,
      lat: 37.5,
      lon: 126.9,
    });
  });

  it('rejects future stage times and protects the dispatch record from deletion', () => {
    startActivityFromIncident({ type: 'ems', title: '환자 이송', startedAt: 1000 });
    recordActivityStage('arrival', '현장도착', 2000);

    expect(updateActivityStageTime('arrival', 4000, 3000).changed).toBe(false);
    expect(removeActivityStage('dispatch').changed).toBe(false);
    expect(loadActivitySession().stamps.map(stamp => stamp.stageId)).toContain('dispatch');
  });

  it('removes a mistaken non-dispatch stage record', () => {
    startActivityFromIncident({ type: 'rescue', title: '구조 출동', startedAt: 1000 });
    recordActivityStage('arrival', '현장도착', 2000);

    expect(removeActivityStage('arrival').changed).toBe(true);
    expect(loadActivitySession().stamps.map(stamp => stamp.stageId)).toEqual(['dispatch']);
  });
});
