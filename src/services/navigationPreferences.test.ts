import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAVIGATION_PREFERENCES,
  normalizeNavigationPreferences,
  toggleNavigationFavorite,
} from './navigationPreferences';

describe('navigationPreferences', () => {
  it('filters damaged and unknown stored values', () => {
    expect(normalizeNavigationPreferences({
      preset: 'unknown',
      favorites: ['weather', 'weather', 'not-a-tab'],
      recents: ['er', null, 'triage'],
    })).toEqual({
      favorites: ['weather'],
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
});
