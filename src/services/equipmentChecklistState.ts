import { loadStoredJson } from './privacySettings';

export const EQUIPMENT_CHECKLIST_STORAGE_KEY = '119helper-equipment-checklist';
export const EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY = '119helper-equipment-checklist-date';

export function localDateKey(now = Date.now()): string {
  const date = new Date(now);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function storedChecklist(): Record<string, boolean> {
  return loadStoredJson<Record<string, boolean>>(
    EQUIPMENT_CHECKLIST_STORAGE_KEY,
    {},
    parsed => parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter((entry): entry is [string, boolean] => (
            typeof entry[1] === 'boolean'
          )),
        )
      : {},
  );
}

export function loadEquipmentChecklistForDate(now = Date.now()): Record<string, boolean> {
  const storedDate = loadStoredJson<string | null>(
    EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY,
    null,
    parsed => typeof parsed === 'string' ? parsed : null,
  );

  return storedDate === localDateKey(now) ? storedChecklist() : {};
}
