import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  canPersistStorageKey,
  isStorageExpired,
  removeStoredJson,
  storageTimestampKey,
  loadStoredJson,
  saveStoredJson,
} from '../services/privacySettings';

/**
 * StickyNotes의 lazy-init + useEffect 저장 패턴을 제네릭으로 추출한 훅.
 * localStorage에 JSON 직렬화로 보존하며, 파싱 실패 시 initial로 안전하게 폴백한다.
 *
 * @param key      localStorage 키 (예: '119helper-...')
 * @param initial  값이 없거나 손상됐을 때 사용할 기본값 (또는 지연 평가 함수)
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const initialValue = useCallback(
    () => initial instanceof Function ? (initial as () => T)() : initial,
    [initial],
  );

  const [state, setState] = useState<T>(() => {
    try {
      if (!canPersistStorageKey(key) || isStorageExpired(key)) {
        removeStoredJson(key);
        return initialValue();
      }
      return loadStoredJson(key, initialValue());
    } catch {
      /* 손상된 데이터는 무시하고 기본값 사용 */
    }
    return initialValue();
  });

  useEffect(() => {
    saveStoredJson(key, state);
  }, [key, state]);

  useEffect(() => {
    const syncStoredState = () => {
      if (!canPersistStorageKey(key) || isStorageExpired(key)) {
        removeStoredJson(key);
        setState(initialValue());
        return;
      }

      try {
        const parsed = loadStoredJson(key, initialValue());
        setState(current => JSON.stringify(current) === JSON.stringify(parsed) ? current : parsed);
      } catch {
        removeStoredJson(key);
        setState(initialValue());
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === storageTimestampKey(key) || event.key === null) {
        syncStoredState();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncStoredState();
    };

    window.addEventListener('119helper-settings-updated', syncStoredState);
    window.addEventListener('focus', syncStoredState);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('119helper-settings-updated', syncStoredState);
      window.removeEventListener('focus', syncStoredState);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initialValue, key]);

  const setPersistedState = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    if (!canPersistStorageKey(key) || isStorageExpired(key)) {
      removeStoredJson(key);
      setState(initialValue());
      return;
    }
    setState(action);
  }, [initialValue, key]);

  const reset = useCallback(() => {
    try {
      removeStoredJson(key);
    } catch {
      /* */
    }
    setState(initialValue());
  }, [key, initialValue]);

  return [state, setPersistedState, reset];
}
