import { describe, expect, it } from 'vitest';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import type { LoggedActivityStamp } from '../services/activitySession';
import { findActivityOrderIssues } from './activityOrder';

const stamp = (stageId: string, label: string, time: number): LoggedActivityStamp => ({
  stageId,
  label,
  time,
  lat: null,
  lon: null,
});

const emsStages = ACTIVITY_PRESETS.find(preset => preset.id === 'ems')!.stages;

describe('findActivityOrderIssues', () => {
  it('accepts recorded stages that follow preset time order', () => {
    const issues = findActivityOrderIssues(emsStages, [
      stamp('dispatch', '출동', 1000),
      stamp('arrival', '현장도착', 2000),
      stamp('transport', '이송개시', 3000),
      stamp('hospital', '병원도착', 4000),
    ]);

    expect(issues).toEqual([]);
  });

  it('warns when a later preset stage has an earlier timestamp', () => {
    const issues = findActivityOrderIssues(emsStages, [
      stamp('dispatch', '출동', 1000),
      stamp('transport', '이송개시', 4000),
      stamp('hospital', '병원도착', 3000),
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        id: 'transport:hospital',
        message: '‘병원도착’ 시각이 ‘이송개시’보다 빠릅니다.',
      }),
    ]);
  });

  it('ignores missing preset stages and unrelated automatic events', () => {
    const issues = findActivityOrderIssues(emsStages, [
      stamp('dispatch', '출동', 1000),
      stamp('auto-1', '응급실 열람', 5000),
      stamp('hospital', '병원도착', 6000),
    ]);

    expect(issues).toEqual([]);
  });
});
