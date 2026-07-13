import type { ActivityStage } from '../data/activityStages';
import type { LoggedActivityStamp } from '../services/activitySession';
import type { TimerState } from '../services/timerPersistence';
import { findActivityOrderIssues, type ActivityOrderIssue } from './activityOrder';

export interface IncidentCloseReview {
  reviewStages: ActivityStage[];
  recordedStageIds: Set<string>;
  missingStages: ActivityStage[];
  orderIssues: ActivityOrderIssue[];
  unfinishedTimers: TimerState[];
  stopwatchRunning: boolean;
  hasWarnings: boolean;
}

interface IncidentCloseReviewInput {
  stages: ActivityStage[];
  stamps: LoggedActivityStamp[];
  timers: TimerState[];
  stopwatchRunning: boolean;
}

export function buildIncidentCloseReview({
  stages,
  stamps,
  timers,
  stopwatchRunning,
}: IncidentCloseReviewInput): IncidentCloseReview {
  const reviewStages = stages.filter(stage => stage.id !== 'dispatch' && stage.id !== 'return');
  const recordedStageIds = new Set(stamps.map(stamp => stamp.stageId));
  const missingStages = reviewStages.filter(stage => !recordedStageIds.has(stage.id));
  const orderIssues = findActivityOrderIssues(stages, stamps);
  const unfinishedTimers = timers.filter(timer => (
    timer.isRunning || (timer.remaining > 0 && timer.remaining < timer.totalSeconds)
  ));

  return {
    reviewStages,
    recordedStageIds,
    missingStages,
    orderIssues,
    unfinishedTimers,
    stopwatchRunning,
    hasWarnings: missingStages.length > 0
      || orderIssues.length > 0
      || unfinishedTimers.length > 0
      || stopwatchRunning,
  };
}
