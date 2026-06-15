export type TabId =
  | 'dashboard'
  | 'shelter'
  | 'er'
  | 'weather'
  | 'calculator'
  | 'calendar'
  | 'emergency'
  | 'fire-analysis'
  | 'multiuse'
  | 'hazmat'
  | 'annual-fire'
  | 'fire-damage'
  | 'hazards'
  | 'manual'
  | 'field-timer'
  | 'news'
  | 'policy'
  | 'wildfire'
  | 'law'
  | 'checklist'
  | 'equipment-cert'
  | 'ems-protocol'
  | 'triage'
  | 'activity-log'
  | 'preplan'
  | 'safety-monitor';

// URL ?tab= 파라미터 검증용 런타임 목록 (manifest 바로가기, E2E 테스트에서 사용)
export const ALL_TAB_IDS: readonly TabId[] = [
  'dashboard', 'shelter', 'er', 'weather', 'calculator', 'calendar',
  'emergency', 'fire-analysis', 'multiuse', 'hazmat', 'annual-fire',
  'fire-damage', 'hazards', 'manual', 'field-timer', 'news', 'policy',
  'wildfire', 'law', 'checklist', 'equipment-cert',
  'ems-protocol', 'triage', 'activity-log', 'preplan', 'safety-monitor',
];

export function isTabId(value: string | null): value is TabId {
  return !!value && (ALL_TAB_IDS as readonly string[]).includes(value);
}

export type LegacyShelterTab = 'hydrants' | 'waterTowers' | 'building';
export type ShelterCategory = LegacyShelterTab | 'civil' | 'tsunami' | 'restrooms';

export type NavigateTarget = TabId | LegacyShelterTab;
