// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INCIDENT_SESSION_EVENT,
  INCIDENT_SESSION_KEY,
  normalizeIncidentSession,
  saveIncidentSession,
} from './incidentSession';

describe('incidentSession', () => {
  beforeEach(() => localStorage.clear());

  it('does not restore an active session without a valid start time', () => {
    expect(normalizeIncidentSession({ active: true, type: 'unknown', startedAt: 0 })).toMatchObject({
      active: false,
      type: 'fire',
    });
  });

  it('persists and broadcasts a normalized session', () => {
    const listener = vi.fn();
    window.addEventListener(INCIDENT_SESSION_EVENT, listener);

    saveIncidentSession({
      active: true,
      type: 'ems',
      title: '환자 이송',
      address: '광주 서구',
      startedAt: 20_000,
      note: '',
    });

    expect(JSON.parse(localStorage.getItem(INCIDENT_SESSION_KEY) || '{}')).toMatchObject({ active: true, type: 'ems' });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(INCIDENT_SESSION_EVENT, listener);
  });
});
