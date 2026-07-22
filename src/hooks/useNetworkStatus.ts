import { useEffect, useRef, useState } from 'react';
import { NETWORK_HEALTH_EVENT } from '../services/apiClient';

export type NetworkState = 'online' | 'unstable' | 'offline';

export interface NetworkStatusState {
  state: NetworkState;
  lastSuccessAt: number | null;
}

export function nextNetworkState(
  current: NetworkStatusState,
  event: 'online' | 'offline' | 'request-success' | 'request-failure',
  failStreak: number,
  now = Date.now(),
): NetworkStatusState {
  if (event === 'offline') return { ...current, state: 'offline' };
  if (event === 'online') return { ...current, state: 'online' };
  if (event === 'request-success') return { state: 'online', lastSuccessAt: now };
  return { ...current, state: failStreak >= 2 ? 'unstable' : current.state };
}

export function useNetworkStatus(): NetworkStatusState {
  const [status, setStatus] = useState<NetworkStatusState>(() => ({
    state: navigator.onLine ? 'online' : 'offline',
    lastSuccessAt: null,
  }));
  const failStreakRef = useRef(0);

  useEffect(() => {
    const goOnline = () => {
      failStreakRef.current = 0;
      setStatus(current => nextNetworkState(current, 'online', 0));
    };
    const goOffline = () => setStatus(current => nextNetworkState(current, 'offline', failStreakRef.current));
    const onHealth = (event: Event) => {
      const ok = (event as CustomEvent<{ ok: boolean }>).detail?.ok;
      if (ok) {
        failStreakRef.current = 0;
        setStatus(current => nextNetworkState(current, 'request-success', 0));
        return;
      }
      failStreakRef.current += 1;
      setStatus(current => nextNetworkState(current, 'request-failure', failStreakRef.current));
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener(NETWORK_HEALTH_EVENT, onHealth);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener(NETWORK_HEALTH_EVENT, onHealth);
    };
  }, []);

  return status;
}
