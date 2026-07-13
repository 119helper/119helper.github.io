// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_KEY,
  loadDisplaySettings,
  normalizeDisplaySettings,
  saveDisplaySettings,
} from './displaySettings';

describe('displaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('falls back safely for malformed values', () => {
    expect(normalizeDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    localStorage.setItem(DISPLAY_SETTINGS_KEY, '{broken');
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('persists field readability mode', () => {
    saveDisplaySettings({ fieldReadabilityMode: true });
    expect(loadDisplaySettings()).toEqual({ fieldReadabilityMode: true });
  });
});
