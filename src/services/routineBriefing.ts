import { CHECKLIST_SECTIONS } from '../data/equipmentChecklist';
import { loadStoredJson } from './privacySettings';
import { loadEquipmentChecklistForDate, localDateKey } from './equipmentChecklistState';

const MAX_VISIBLE_LABEL_LENGTH = 80;

interface StoredSchedule {
  date: string;
  title: string;
}

interface StoredPrePlan {
  name: string;
  updatedAt: number;
}

export interface RoutineBriefingSnapshot {
  todayScheduleCount: number;
  todayScheduleTitle: string | null;
  noteCount: number;
  prePlanCount: number;
  recentPrePlanName: string | null;
  checklistChecked: number;
  checklistTotal: number;
  checklistProgress: number;
}

function visibleLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, MAX_VISIBLE_LABEL_LENGTH);
  return normalized || null;
}

function hasMeaningfulStoredPrePlan(candidate: Record<string, unknown>): boolean {
  const hasText = ['name', 'address', 'accessNotes']
    .some(key => visibleLabel(candidate[key]) !== null);
  const hasTag = ['hazards', 'facilities'].some(key => (
    Array.isArray(candidate[key])
    && candidate[key].some(value => visibleLabel(value) !== null)
  ));
  const hasContact = Array.isArray(candidate.contacts) && candidate.contacts.some(contact => (
    contact !== null
    && typeof contact === 'object'
    && Object.values(contact).some(value => visibleLabel(value) !== null)
  ));
  const hasPhoto = Array.isArray(candidate.photoKeys) && candidate.photoKeys.length > 0;

  return hasText || hasTag || hasContact || hasPhoto;
}

function storedSchedules(): StoredSchedule[] {
  return loadStoredJson<StoredSchedule[]>('119helper-schedules', [], parsed => (
    Array.isArray(parsed)
      ? parsed.flatMap(value => {
          if (!value || typeof value !== 'object') return [];
          const candidate = value as Partial<StoredSchedule>;
          const title = visibleLabel(candidate.title);
          return typeof candidate.date === 'string' && title
            ? [{ date: candidate.date, title }]
            : [];
        })
      : []
  ));
}

function storedNoteCount(): number {
  return loadStoredJson<number>('119helper-notes', 0, parsed => (
    Array.isArray(parsed)
      ? parsed.filter(value => value !== null && typeof value === 'object').length
      : 0
  ));
}

function storedPrePlans(): StoredPrePlan[] {
  return loadStoredJson<StoredPrePlan[]>('119helper-preplans', [], parsed => (
    Array.isArray(parsed)
      ? parsed.flatMap(value => {
          if (!value || typeof value !== 'object') return [];
          const candidate = value as Record<string, unknown>;
          if (!hasMeaningfulStoredPrePlan(candidate)) return [];
          const name = visibleLabel(candidate.name) ?? '';
          const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : 0;
          return [{ name, updatedAt }];
        })
      : []
  ));
}

export function loadRoutineBriefing(now = Date.now()): RoutineBriefingSnapshot {
  const today = localDateKey(now);
  const todaySchedules = storedSchedules().filter(schedule => schedule.date === today);
  const prePlans = storedPrePlans();
  const recentNamedPrePlan = [...prePlans]
    .filter(plan => plan.name)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const checklist = loadEquipmentChecklistForDate(now);
  const checklistIds = CHECKLIST_SECTIONS.flatMap(section => section.items.map(item => item.id));
  const checklistChecked = checklistIds.filter(id => checklist[id] === true).length;
  const checklistTotal = checklistIds.length;

  return {
    todayScheduleCount: todaySchedules.length,
    todayScheduleTitle: todaySchedules[0]?.title ?? null,
    noteCount: storedNoteCount(),
    prePlanCount: prePlans.length,
    recentPrePlanName: recentNamedPrePlan?.name ?? null,
    checklistChecked,
    checklistTotal,
    checklistProgress: checklistTotal === 0
      ? 0
      : Math.round((checklistChecked / checklistTotal) * 100),
  };
}
