import { useCallback, useSyncExternalStore } from 'react';
import { isStoragePending, STORAGE_STATUS_EVENT } from '../services/privacySettings';
function subscribe(notify: () => void) {
  window.addEventListener(STORAGE_STATUS_EVENT, notify);
  return () => window.removeEventListener(STORAGE_STATUS_EVENT, notify);
}
export function useStoragePending(key: string): boolean {
  return useSyncExternalStore(subscribe, useCallback(() => isStoragePending(key), [key]));
}
