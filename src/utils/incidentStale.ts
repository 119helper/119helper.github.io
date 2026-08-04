import type { IncidentSession } from '../services/incidentSession';

export const STALE_INCIDENT_MS = 12 * 60 * 60 * 1000;

export function isIncidentSessionStale(session: IncidentSession, now = Date.now()): boolean {
  return session.active
    && session.startedAt > 0
    && now - session.startedAt >= STALE_INCIDENT_MS;
}
