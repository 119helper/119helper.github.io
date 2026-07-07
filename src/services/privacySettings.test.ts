// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPrivacyRetention,
  canPersistStorageKey,
  clearSensitiveStoredData,
  loadStoredJson,
  loadPrivacySettings,
  savePrivacySettings,
  saveStoredJson,
  storageTimestampKey,
} from './privacySettings';

describe('privacy settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads defaults when unset', () => {
    expect(loadPrivacySettings()).toEqual({ publicDeviceMode: false, retentionDays: 30 });
  });

  it('blocks sensitive persistence in public device mode', () => {
    savePrivacySettings({ publicDeviceMode: true, retentionDays: 30 });
    expect(canPersistStorageKey('119helper-notes')).toBe(false);
    expect(canPersistStorageKey('119helper-theme')).toBe(true);
  });

  it('clears expired sensitive values', async () => {
    localStorage.setItem('119helper-notes', '[]');
    localStorage.setItem(storageTimestampKey('119helper-notes'), String(Date.now() - 31 * 24 * 60 * 60 * 1000));

    await applyPrivacyRetention();

    expect(localStorage.getItem('119helper-notes')).toBeNull();
  });

  it('clears known sensitive values on request', async () => {
    localStorage.setItem('119helper-preplans', '[]');
    await clearSensitiveStoredData();
    expect(localStorage.getItem('119helper-preplans')).toBeNull();
  });

  it('centralized JSON storage respects public device mode', () => {
    savePrivacySettings({ publicDeviceMode: true, retentionDays: 30 });

    saveStoredJson('119helper-notes', [{ text: 'secret' }]);

    expect(localStorage.getItem('119helper-notes')).toBeNull();
    expect(loadStoredJson('119helper-notes', [])).toEqual([]);
  });

  it('centralized JSON storage writes timestamps for sensitive keys', () => {
    saveStoredJson('119helper-building-recent', [{ address: '서울' }]);

    expect(localStorage.getItem('119helper-building-recent')).not.toBeNull();
    expect(Number(localStorage.getItem(storageTimestampKey('119helper-building-recent')))).toBeGreaterThan(0);
  });
});
