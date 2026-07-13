import { describe, expect, it } from 'vitest';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import type { LoggedActivityStamp } from '../services/activitySession';
import type { TimerState } from '../services/timerPersistence';
import { buildIncidentCloseReview } from './incidentCloseReview';

const emsStages = ACTIVITY_PRESETS.find(preset => preset.id === 'ems')!.stages;
const stamp = (stageId: string, time: number): LoggedActivityStamp => ({
  stageId,
  label: stageId,
  time,
  lat: null,
  lon: null,
});
const timer = (overrides: Partial<TimerState> = {}): TimerState => ({
  id: 1,
  label: '30분',
  totalSeconds: 1800,
  remaining: 1800,
  isRunning: false,
  startedAt: null,
  endsAt: null,
  ...overrides,
});

describe('buildIncidentCloseReview', () => {
  it('summarizes missing stages and unfinished timers without requiring return', () => {
    const review = buildIncidentCloseReview({
      stages: emsStages,
      stamps: [stamp('dispatch', 1000), stamp('arrival', 2000)],
      timers: [timer({ remaining: 1200 })],
      stopwatchRunning: false,
    });

    expect(review.reviewStages.map(stage => stage.id)).not.toContain('return');
    expect(review.missingStages.map(stage => stage.id)).toEqual(['contact', 'treatment', 'transport', 'hospital']);
    expect(review.unfinishedTimers).toHaveLength(1);
    expect(review.hasWarnings).toBe(true);
  });

  it('does not warn for a completed timer or a fully ordered activity record', () => {
    const review = buildIncidentCloseReview({
      stages: emsStages,
      stamps: [
        stamp('dispatch', 1000),
        stamp('arrival', 2000),
        stamp('contact', 3000),
        stamp('treatment', 4000),
        stamp('transport', 5000),
        stamp('hospital', 6000),
      ],
      timers: [timer({ remaining: 0 })],
      stopwatchRunning: false,
    });

    expect(review.missingStages).toEqual([]);
    expect(review.orderIssues).toEqual([]);
    expect(review.unfinishedTimers).toEqual([]);
    expect(review.hasWarnings).toBe(false);
  });

  it('includes out-of-order stages and a running stopwatch in warnings', () => {
    const review = buildIncidentCloseReview({
      stages: emsStages,
      stamps: [stamp('dispatch', 1000), stamp('transport', 4000), stamp('hospital', 3000)],
      timers: [],
      stopwatchRunning: true,
    });

    expect(review.orderIssues).toHaveLength(1);
    expect(review.stopwatchRunning).toBe(true);
    expect(review.hasWarnings).toBe(true);
  });
});
