import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  canPersistStorageKey,
  isSensitiveStorageKey,
  isStorageExpired,
  storageTimestampKey,
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
  const [state, setState] = useState<T>(() => {
    try {
      if (!canPersistStorageKey(key) || isStorageExpired(key)) {
        localStorage.removeItem(key);
        localStorage.removeItem(storageTimestampKey(key));
        return initial instanceof Function ? (initial as () => T)() : initial;
      }
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      /* 손상된 데이터는 무시하고 기본값 사용 */
    }
    return initial instanceof Function ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      if (!canPersistStorageKey(key)) {
        localStorage.removeItem(key);
        localStorage.removeItem(storageTimestampKey(key));
        return;
      }
      localStorage.setItem(key, JSON.stringify(state));
      if (isSensitiveStorageKey(key)) {
        localStorage.setItem(storageTimestampKey(key), String(Date.now()));
      }
    } catch {
      /* 용량 초과 등은 조용히 무시 */
    }
  }, [key, state]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(storageTimestampKey(key));
    } catch {
      /* */
    }
    setState(initial instanceof Function ? (initial as () => T)() : initial);
  }, [key, initial]);

  return [state, setState, reset];
}
