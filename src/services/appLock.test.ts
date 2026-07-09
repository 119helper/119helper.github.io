// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAppUnlock,
  createAppLockCredential,
  isAppLockConfigured,
  recordAppUnlock,
  shouldAppLock,
  verifyAppLockCode,
} from './appLock';
import type { PrivacySettings } from './privacySettings';

function lockedSettings(overrides: Partial<PrivacySettings> = {}): PrivacySettings {
  return {
    publicDeviceMode: false,
    retentionDays: 30,
    appLockEnabled: true,
    appLockCodeHash: 'hash',
    appLockSalt: 'salt',
    appLockTimeoutMinutes: 15,
    ...overrides,
  };
}

describe('app lock', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('creates and verifies hashed app lock credentials', async () => {
    const credential = await createAppLockCredential('1234');
    const settings = lockedSettings(credential);

    expect(isAppLockConfigured(settings)).toBe(true);
    expect(settings.appLockCodeHash).not.toBe('1234');
    expect(await verifyAppLockCode('1234', settings)).toBe(true);
    expect(await verifyAppLockCode('0000', settings)).toBe(false);
  });

  it('requires unlock when no session unlock exists', () => {
    expect(shouldAppLock(lockedSettings())).toBe(true);
  });

  it('locks again after inactivity timeout', () => {
    const settings = lockedSettings({ appLockTimeoutMinutes: 5 });
    const now = Date.now();
    recordAppUnlock(now);

    expect(shouldAppLock(settings, now + 4 * 60 * 1000)).toBe(false);
    expect(shouldAppLock(settings, now + 6 * 60 * 1000)).toBe(true);
  });

  it('does not lock when disabled or credentials are missing', () => {
    clearAppUnlock();

    expect(shouldAppLock(lockedSettings({ appLockEnabled: false }))).toBe(false);
    expect(shouldAppLock(lockedSettings({ appLockCodeHash: null }))).toBe(false);
  });
});
