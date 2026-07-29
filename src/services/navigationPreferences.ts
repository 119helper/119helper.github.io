import { loadStoredJson, saveStoredJson } from './privacySettings';
import { isTabId, type TabId } from '../types/navigation';

export const NAVIGATION_PREFERENCES_KEY = '119helper-navigation-preferences';
const MAX_FAVORITES = 6;

export interface NavigationPreferences {
  favorites: TabId[];
}

export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferences = {
  favorites: [],
};

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
    return { ...DEFAULT_NAVIGATION_PREFERENCES, favorites: [] };
  }

  const candidate = value as Partial<NavigationPreferences>;
  return {
    favorites: normalizeTabs(candidate.favorites, MAX_FAVORITES),
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
