export const DISPLAY_SETTINGS_KEY = '119helper-display-settings';

export interface DisplaySettings {
  fieldReadabilityMode: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fieldReadabilityMode: false,
};

export function normalizeDisplaySettings(value: unknown): DisplaySettings {
  if (!value || typeof value !== 'object') return DEFAULT_DISPLAY_SETTINGS;
  const settings = value as Partial<DisplaySettings>;
  return { fieldReadabilityMode: settings.fieldReadabilityMode === true };
}

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    return raw ? normalizeDisplaySettings(JSON.parse(raw)) : DEFAULT_DISPLAY_SETTINGS;
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(normalizeDisplaySettings(settings)));
  } catch {
    // Display preferences are best-effort.
  }
}
