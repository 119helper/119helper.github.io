import { loadStoredJson, saveStoredJson } from './privacySettings';
import { isTabId, type TabId } from '../types/navigation';

export const NAVIGATION_PREFERENCES_KEY = '119helper-navigation-preferences';
const MAX_FAVORITES = 6;
const MAX_RECENTS = 4;

export type WorkPresetId = 'incident' | 'ems' | 'prevention' | 'admin';

export interface WorkPreset {
  id: WorkPresetId;
  label: string;
  icon: string;
  description: string;
  shortcuts: TabId[];
}

export interface NavigationPreferences {
  preset: WorkPresetId;
  favorites: TabId[];
  recents: TabId[];
}

export const WORK_PRESETS: WorkPreset[] = [
  {
    id: 'incident',
    label: '출동',
    icon: 'emergency_home',
    description: '상황판·타이머·대원 안전·시설',
    shortcuts: ['incident', 'field-timer', 'safety-monitor', 'shelter'],
  },
  {
    id: 'ems',
    label: '구급',
    icon: 'ambulance',
    description: '응급처치·중증도·응급실·활동 기록',
    shortcuts: ['ems-protocol', 'triage', 'er', 'activity-log'],
  },
  {
    id: 'prevention',
    label: '예방',
    icon: 'fact_check',
    description: '대상물·장비점검·인증·매뉴얼',
    shortcuts: ['preplan', 'checklist', 'equipment-cert', 'manual'],
  },
  {
    id: 'admin',
    label: '행정',
    icon: 'work',
    description: '일정·법률·지침·통계',
    shortcuts: ['calendar', 'law', 'policy', 'annual-fire'],
  },
];

export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferences = {
  preset: 'incident',
  favorites: [],
  recents: [],
};

const validPresets = new Set<WorkPresetId>(WORK_PRESETS.map(preset => preset.id));

function normalizeTabs(value: unknown, limit: number): TabId[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<TabId>();
  for (const item of value) {
    if (typeof item === 'string' && isTabId(item)) unique.add(item);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

export function normalizeNavigationPreferences(value: unknown): NavigationPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_NAVIGATION_PREFERENCES, favorites: [], recents: [] };
  }

  const candidate = value as Partial<NavigationPreferences>;
  return {
    preset: typeof candidate.preset === 'string' && validPresets.has(candidate.preset as WorkPresetId)
      ? candidate.preset as WorkPresetId
      : DEFAULT_NAVIGATION_PREFERENCES.preset,
    favorites: normalizeTabs(candidate.favorites, MAX_FAVORITES),
    recents: normalizeTabs(candidate.recents, MAX_RECENTS),
  };
}

export function loadNavigationPreferences(): NavigationPreferences {
  return loadStoredJson(
    NAVIGATION_PREFERENCES_KEY,
    DEFAULT_NAVIGATION_PREFERENCES,
    normalizeNavigationPreferences,
  );
}

export function saveNavigationPreferences(preferences: NavigationPreferences): void {
  saveStoredJson(NAVIGATION_PREFERENCES_KEY, normalizeNavigationPreferences(preferences));
}

export function setWorkPreset(
  preferences: NavigationPreferences,
  preset: WorkPresetId,
): NavigationPreferences {
  return normalizeNavigationPreferences({ ...preferences, preset });
}

export function toggleNavigationFavorite(
  preferences: NavigationPreferences,
  tab: TabId,
): NavigationPreferences {
  const exists = preferences.favorites.includes(tab);
  const favorites = exists
    ? preferences.favorites.filter(item => item !== tab)
    : [tab, ...preferences.favorites.filter(item => item !== tab)].slice(0, MAX_FAVORITES);
  return normalizeNavigationPreferences({ ...preferences, favorites });
}

export function recordRecentNavigation(
  preferences: NavigationPreferences,
  tab: TabId,
): NavigationPreferences {
  const recents = [tab, ...preferences.recents.filter(item => item !== tab)].slice(0, MAX_RECENTS);
  return normalizeNavigationPreferences({ ...preferences, recents });
}
