import { loadStoredJson, saveStoredJson } from './privacySettings';

export const SCHEDULE_STORAGE_KEY = '119helper-schedules';
export const SCHEDULES_UPDATED_EVENT = '119helper-schedules-updated';

export type ScheduleType = '근무' | '점검' | '교육' | '기타';

export interface Schedule {
  id: string;
  date: string;
  title: string;
  type: ScheduleType;
  memo: string;
  trackCompletion?: boolean;
  completedAt?: number;
}

const SCHEDULE_TYPES: ScheduleType[] = ['근무', '점검', '교육', '기타'];

function normalizeSchedule(value: unknown): Schedule | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Schedule>;
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.date !== 'string'
    || typeof candidate.title !== 'string'
    || !SCHEDULE_TYPES.includes(candidate.type as ScheduleType)
    || typeof candidate.memo !== 'string'
  ) {
    return null;
  }

  // 기존 일정은 읽는 과정에서 다듬거나 자르지 않는다. 사용자가 다른 일정을
  // 변경했을 때도 장문 메모와 이후 버전의 추가 필드를 그대로 보존해야 한다.
  return { ...(value as Record<string, unknown>) } as unknown as Schedule;
}

export function loadSchedules(): Schedule[] {
  return loadStoredJson<Schedule[]>(SCHEDULE_STORAGE_KEY, [], parsed => (
    Array.isArray(parsed)
      ? parsed.flatMap(value => {
          const schedule = normalizeSchedule(value);
          return schedule ? [schedule] : [];
        })
      : []
  ));
}

export function saveSchedules(schedules: Schedule[]): boolean {
  const serialized = JSON.stringify(schedules);
  saveStoredJson(SCHEDULE_STORAGE_KEY, schedules);
  try {
    return localStorage.getItem(SCHEDULE_STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}

export function isTrackedSchedule(schedule: Schedule): boolean {
  return schedule.trackCompletion === true;
}

export function isCompletedSchedule(schedule: Schedule): boolean {
  return isTrackedSchedule(schedule)
    && typeof schedule.completedAt === 'number'
    && Number.isFinite(schedule.completedAt)
    && schedule.completedAt > 0;
}
