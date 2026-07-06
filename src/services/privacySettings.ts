export interface PrivacySettings {
  publicDeviceMode: boolean;
  retentionDays: number;
}

const PRIVACY_KEY = '119helper-privacy-settings';

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  publicDeviceMode: false,
  retentionDays: 30,
};

export const SENSITIVE_STORAGE_KEYS = [
  '119helper-profile',
  '119helper-notes',
  '119helper-preplans',
  '119helper-activity-session',
  '119helper-triage-patients',
  '119helper-field-assessment',
  '119helper-building-recent',
  '119helper-schedules',
  '119helper-equipment-checklist',
  '119helper-sop-checklist-checked',
  '119helper-sop-checklist-timestamps',
  '119helper-stress-check',
  '119helper-incident-session',
  '119helper-mci-board',
];

const sensitiveKeySet = new Set(SENSITIVE_STORAGE_KEYS);

export function loadPrivacySettings(): PrivacySettings {
  try {
    const raw = localStorage.getItem(PRIVACY_KEY);
    if (!raw) return DEFAULT_PRIVACY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PrivacySettings>;
    const retentionDays = Number(parsed.retentionDays);
    return {
      publicDeviceMode: parsed.publicDeviceMode === true,
      retentionDays: Number.isFinite(retentionDays) ? Math.max(0, Math.min(365, retentionDays)) : DEFAULT_PRIVACY_SETTINGS.retentionDays,
    };
  } catch {
    return DEFAULT_PRIVACY_SETTINGS;
  }
}

export function savePrivacySettings(settings: PrivacySettings): void {
  localStorage.setItem(PRIVACY_KEY, JSON.stringify({
    publicDeviceMode: settings.publicDeviceMode,
    retentionDays: Math.max(0, Math.min(365, settings.retentionDays)),
  }));
}

export function isSensitiveStorageKey(key: string): boolean {
  return sensitiveKeySet.has(key);
}

export function storageTimestampKey(key: string): string {
  return `${key}:updatedAt`;
}

function deleteIndexedDb(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function clearSensitiveStoredData(): Promise<void> {
  SENSITIVE_STORAGE_KEYS.forEach(key => {
    localStorage.removeItem(key);
    localStorage.removeItem(storageTimestampKey(key));
  });
  await deleteIndexedDb('119-preplan');
}

export function canPersistStorageKey(key: string): boolean {
  const settings = loadPrivacySettings();
  return !(settings.publicDeviceMode && isSensitiveStorageKey(key));
}

export function isStorageExpired(key: string, now = Date.now()): boolean {
  if (!isSensitiveStorageKey(key)) return false;
  const settings = loadPrivacySettings();
  if (settings.publicDeviceMode) return true;
  if (settings.retentionDays <= 0) return false;

  const rawUpdatedAt = localStorage.getItem(storageTimestampKey(key));
  if (!rawUpdatedAt) return false;
  const updatedAt = Number(rawUpdatedAt);
  if (!Number.isFinite(updatedAt)) return false;

  return now - updatedAt > settings.retentionDays * 24 * 60 * 60 * 1000;
}

export async function applyPrivacyRetention(now = Date.now()): Promise<void> {
  const settings = loadPrivacySettings();

  if (settings.publicDeviceMode) {
    await clearSensitiveStoredData();
    return;
  }

  if (settings.retentionDays <= 0) return;

  SENSITIVE_STORAGE_KEYS.forEach(key => {
    if (isStorageExpired(key, now)) {
      localStorage.removeItem(key);
      localStorage.removeItem(storageTimestampKey(key));
    }
  });
}
