import type { ActivityStage } from '../data/activityStages';
import type { LoggedActivityStamp } from '../services/activitySession';

export interface ActivityOrderPoint {
  stageId: string;
  label: string;
  time: number;
}

export interface ActivityOrderIssue {
  id: string;
  expectedBefore: ActivityOrderPoint;
  expectedAfter: ActivityOrderPoint;
  message: string;
}

export function findActivityOrderIssues(
  stages: ActivityStage[],
  stamps: LoggedActivityStamp[],
): ActivityOrderIssue[] {
  const stampByStage = new Map(stamps.map(stamp => [stamp.stageId, stamp]));
  const recordedStages = stages.flatMap<ActivityOrderPoint>(stage => {
    const stamp = stampByStage.get(stage.id);
    return stamp ? [{ stageId: stage.id, label: stage.label, time: stamp.time }] : [];
  });

  const issues: ActivityOrderIssue[] = [];
  for (let index = 1; index < recordedStages.length; index += 1) {
    const expectedBefore = recordedStages[index - 1];
    const expectedAfter = recordedStages[index];
    if (expectedBefore.time <= expectedAfter.time) continue;

    issues.push({
      id: `${expectedBefore.stageId}:${expectedAfter.stageId}`,
      expectedBefore,
      expectedAfter,
      message: `‘${expectedAfter.label}’ 시각이 ‘${expectedBefore.label}’보다 빠릅니다.`,
    });
  }
  return issues;
}
