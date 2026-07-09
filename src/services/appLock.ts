import type { PrivacySettings } from './privacySettings';

export const APP_LOCK_EVENT = '119helper-app-lock';
export const APP_LOCK_MIN_CODE_LENGTH = 4;

const UNLOCKED_AT_KEY = '119helper-app-lock-unlocked-at';
const LAST_ACTIVE_AT_KEY = '119helper-app-lock-last-active-at';
const DEFAULT_TIMEOUT_MINUTES = 15;
const ALLOWED_TIMEOUTS = new Set([0, 5, 15, 30, 60]);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fallback-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

async function digestHex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(input);

  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function normalizeAppLockTimeout(value: unknown): number {
  const n = Number(value);
  return ALLOWED_TIMEOUTS.has(n) ? n : DEFAULT_TIMEOUT_MINUTES;
}

export function isValidAppLockCode(code: string): boolean {
  return code.trim().length >= APP_LOCK_MIN_CODE_LENGTH;
}

export function generateAppLockSalt(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}

export async function hashAppLockCode(code: string, salt: string): Promise<string> {
  return digestHex(`${salt}:${code}`);
}

export async function createAppLockCredential(code: string): Promise<{ appLockSalt: string; appLockCodeHash: string }> {
  if (!isValidAppLockCode(code)) {
    throw new Error(`앱 잠금 코드는 ${APP_LOCK_MIN_CODE_LENGTH}자 이상이어야 합니다.`);
  }
  const appLockSalt = generateAppLockSalt();
  return {
    appLockSalt,
    appLockCodeHash: await hashAppLockCode(code, appLockSalt),
  };
}

export function isAppLockConfigured(settings: PrivacySettings): boolean {
  return settings.appLockEnabled && !!settings.appLockCodeHash && !!settings.appLockSalt;
}

export async function verifyAppLockCode(code: string, settings: PrivacySettings): Promise<boolean> {
  if (!isAppLockConfigured(settings)) return true;
  const expected = settings.appLockCodeHash ?? '';
  const actual = await hashAppLockCode(code, settings.appLockSalt ?? '');
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function readSessionNumber(key: string, storage = sessionStorage): number | null {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function recordAppUnlock(now = Date.now(), storage = sessionStorage): void {
  storage.setItem(UNLOCKED_AT_KEY, String(now));
  storage.setItem(LAST_ACTIVE_AT_KEY, String(now));
}

export function noteAppActivity(now = Date.now(), storage = sessionStorage): void {
  if (!readSessionNumber(UNLOCKED_AT_KEY, storage)) return;
  storage.setItem(LAST_ACTIVE_AT_KEY, String(now));
}

export function clearAppUnlock(storage = sessionStorage): void {
  storage.removeItem(UNLOCKED_AT_KEY);
  storage.removeItem(LAST_ACTIVE_AT_KEY);
}

export function shouldAppLock(settings: PrivacySettings, now = Date.now(), storage = sessionStorage): boolean {
  if (!isAppLockConfigured(settings)) return false;

  const unlockedAt = readSessionNumber(UNLOCKED_AT_KEY, storage);
  if (!unlockedAt) return true;

  const timeoutMinutes = normalizeAppLockTimeout(settings.appLockTimeoutMinutes);
  if (timeoutMinutes <= 0) return false;

  const lastActiveAt = readSessionNumber(LAST_ACTIVE_AT_KEY, storage) ?? unlockedAt;
  return now - lastActiveAt > timeoutMinutes * 60 * 1000;
}
