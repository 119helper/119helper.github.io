import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  ACTIVITY_SESSION_EVENT,
  ACTIVITY_SESSION_KEY,
  loadActivitySession,
  saveActivitySession,
  type ActivitySessionState,
} from '../services/activitySession';

export function useActivitySession(initialPresetId = 'fire'): [
  ActivitySessionState,
  (next: SetStateAction<ActivitySessionState>) => void,
] {
  const [session, setSessionState] = useState<ActivitySessionState>(() => {
    const stored = loadActivitySession();
    if (stored.stamps.length === 0 && !stored.title && !stored.note) {
      return { ...stored, presetId: initialPresetId };
    }
    return stored;
  });
  const sessionRef = useRef(session);

  useEffect(() => {
    const syncSession = (event?: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as ActivitySessionState | undefined
        : undefined;
      const next = detail ?? loadActivitySession();
      sessionRef.current = next;
      setSessionState(next);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_SESSION_KEY) syncSession();
    };

    window.addEventListener(ACTIVITY_SESSION_EVENT, syncSession);
    window.addEventListener('storage', syncStorage);
    window.addEventListener('119helper-settings-updated', syncSession);
    return () => {
      window.removeEventListener(ACTIVITY_SESSION_EVENT, syncSession);
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener('119helper-settings-updated', syncSession);
    };
  }, []);

  const setSession = useCallback((next: SetStateAction<ActivitySessionState>) => {
    const value = typeof next === 'function'
      ? (next as (previous: ActivitySessionState) => ActivitySessionState)(sessionRef.current)
      : next;
    const saved = saveActivitySession(value);
    sessionRef.current = saved;
    setSessionState(saved);
  }, []);

  return [session, setSession];
}
