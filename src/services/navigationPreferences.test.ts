import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAVIGATION_PREFERENCES,
  normalizeNavigationPreferences,
  recordRecentNavigation,
  setWorkPreset,
  toggleNavigationFavorite,
} from './navigationPreferences';

describe('navigationPreferences', () => {
  it('filters damaged and unknown stored values', () => {
    expect(normalizeNavigationPreferences({
      preset: 'unknown',
      favorites: ['weather', 'weather', 'not-a-tab'],
      recents: ['er', null, 'triage'],
    })).toEqual({
      preset: 'incident',
      favorites: ['weather'],
      recents: ['er', 'triage'],
    });
  });

  it('keeps favorites unique and capped', () => {
    let preferences = DEFAULT_NAVIGATION_PREFERENCES;
    for (const tab of ['weather', 'er', 'triage', 'calendar', 'law', 'policy', 'incident'] as const) {
      preferences = toggleNavigationFavorite(preferences, tab);
    }
    expect(preferences.favorites).toEqual(['incident', 'policy', 'law', 'calendar', 'triage', 'er']);
    expect(toggleNavigationFavorite(preferences, 'law').favorites).not.toContain('law');
  });

  it('records the latest distinct routes and changes work preset', () => {
    let preferences = setWorkPreset(DEFAULT_NAVIGATION_PREFERENCES, 'ems');
    preferences = recordRecentNavigation(preferences, 'weather');
    preferences = recordRecentNavigation(preferences, 'er');
    preferences = recordRecentNavigation(preferences, 'weather');
    expect(preferences.preset).toBe('ems');
    expect(preferences.recents).toEqual(['weather', 'er']);
  });
});
