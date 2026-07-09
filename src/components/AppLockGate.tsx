import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  APP_LOCK_EVENT,
  clearAppUnlock,
  isAppLockConfigured,
  noteAppActivity,
  recordAppUnlock,
  shouldAppLock,
  verifyAppLockCode,
} from '../services/appLock';
import { loadPrivacySettings, type PrivacySettings } from '../services/privacySettings';

function lockDescription(settings: PrivacySettings): string {
  if (settings.appLockTimeoutMinutes === 0) return '탭을 벗어나면 다시 잠깁니다.';
  return `${settings.appLockTimeoutMinutes}분 동안 사용이 없으면 다시 잠깁니다.`;
}

export default function AppLockGate({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PrivacySettings>(() => loadPrivacySettings());
  const [locked, setLocked] = useState(() => shouldAppLock(loadPrivacySettings()));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const lastActivityWriteRef = useRef(0);

  useEffect(() => {
    const syncSettings = () => {
      const next = loadPrivacySettings();
      setSettings(next);
      setLocked(shouldAppLock(next));
    };
    const forceLock = () => {
      const next = loadPrivacySettings();
      clearAppUnlock();
      setSettings(next);
      setLocked(isAppLockConfigured(next));
    };

    window.addEventListener('119helper-settings-updated', syncSettings);
    window.addEventListener('storage', syncSettings);
    window.addEventListener(APP_LOCK_EVENT, forceLock);
    return () => {
      window.removeEventListener('119helper-settings-updated', syncSettings);
      window.removeEventListener('storage', syncSettings);
      window.removeEventListener(APP_LOCK_EVENT, forceLock);
    };
  }, []);

  useEffect(() => {
    if (!isAppLockConfigured(settings)) {
      setLocked(false);
      return undefined;
    }

    const refreshLock = () => {
      const next = loadPrivacySettings();
      setSettings(next);
      setLocked(shouldAppLock(next));
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (settings.appLockTimeoutMinutes === 0) {
          clearAppUnlock();
          setLocked(true);
        }
        return;
      }
      refreshLock();
    };

    const handleActivity = () => {
      if (locked) return;
      const now = Date.now();
      if (now - lastActivityWriteRef.current < 10_000) return;
      lastActivityWriteRef.current = now;
      noteAppActivity(now);
    };

    const interval = window.setInterval(refreshLock, 15_000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refreshLock);
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity, { passive: true, capture: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refreshLock);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity, { capture: true });
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [locked, settings]);

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await verifyAppLockCode(code, settings)) {
      recordAppUnlock();
      setCode('');
      setError('');
      setLocked(false);
      return;
    }
    setError('잠금 코드가 맞지 않습니다.');
    setCode('');
  };

  return (
    <>
      {children}
      {locked && isAppLockConfigured(settings) && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background px-4 text-on-background">
          <form
            onSubmit={handleUnlock}
            className="w-full max-w-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <span className="material-symbols-outlined">lock</span>
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-on-surface font-headline">앱 잠금</h2>
                <p className="text-xs text-on-surface-variant">{lockDescription(settings)}</p>
              </div>
            </div>

            <label className="text-xs font-bold text-on-surface-variant">잠금 코드</label>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={code}
              onChange={event => setCode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant/20 bg-surface-container px-4 py-3 text-center text-lg font-bold tracking-[0.35em] text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="앱 잠금 코드"
            />
            {error && <p className="mt-2 text-sm font-bold text-error">{error}</p>}
            <button
              type="submit"
              className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:bg-primary/90"
            >
              잠금 해제
            </button>
          </form>
        </div>
      )}
    </>
  );
}
