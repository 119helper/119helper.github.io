import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  INCIDENT_SESSION_EVENT,
  INCIDENT_SESSION_KEY,
  loadIncidentSession,
  saveIncidentSession,
  type IncidentSession,
} from '../services/incidentSession';

export function useIncidentSession(): [IncidentSession, (next: SetStateAction<IncidentSession>) => void] {
  const [session, setSessionState] = useState(loadIncidentSession);
  const sessionRef = useRef(session);

  useEffect(() => {
    const syncSession = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as IncidentSession | undefined : undefined;
      const next = detail ?? loadIncidentSession();
      sessionRef.current = next;
      setSessionState(next);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === INCIDENT_SESSION_KEY) syncSession();
    };

    window.addEventListener(INCIDENT_SESSION_EVENT, syncSession);
    window.addEventListener('storage', syncStorage);
    window.addEventListener('119helper-settings-updated', syncSession);
    return () => {
      window.removeEventListener(INCIDENT_SESSION_EVENT, syncSession);
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener('119helper-settings-updated', syncSession);
    };
  }, []);

  const setSession = useCallback((next: SetStateAction<IncidentSession>) => {
    const value = typeof next === 'function'
      ? (next as (previous: IncidentSession) => IncidentSession)(sessionRef.current)
      : next;
    sessionRef.current = value;
    setSessionState(value);
    saveIncidentSession(value);
  }, []);

  return [session, setSession];
}
