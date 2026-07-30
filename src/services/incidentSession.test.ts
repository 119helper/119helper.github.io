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

  it('keeps legacy sessions compatible when no incident coordinate was stored', () => {
    const session = normalizeIncidentSession({
      active: true,
      type: 'fire',
      title: '  상가 화재  ',
      address: '  서울 중구 세종대로  ',
      startedAt: 10_000,
    });

    expect(session).toMatchObject({
      active: true,
      title: '상가 화재',
      address: '서울 중구 세종대로',
    });
    expect(session.location).toBeUndefined();
  });

  it('normalizes a valid incident coordinate and drops an invalid one', () => {
    const valid = normalizeIncidentSession({
      active: true,
      type: 'ems',
      startedAt: 10_000,
      location: {
        lat: '37.5665',
        lng: '126.978',
        source: 'address',
        queryAddress: ' 서울시청 ',
        resolvedAddress: '  서울특별시 중구 세종대로  ',
        regionName: '  서울특별시 ',
        districtName: ' 중구 ',
        legalDongCode: '1114010300-extra',
        resolvedAt: 9_000,
      },
    });
    const invalid = normalizeIncidentSession({
      active: true,
      type: 'ems',
      startedAt: 10_000,
      location: {
        lat: 137.5,
        lng: 126.978,
        source: 'gps',
        resolvedAt: 9_000,
      },
    });

    expect(valid.location).toEqual({
      lat: 37.5665,
      lng: 126.978,
      source: 'address',
      queryAddress: '서울시청',
      resolvedAddress: '서울특별시 중구 세종대로',
      regionName: '서울특별시',
      districtName: '중구',
      legalDongCode: '1114010300',
      resolvedAt: 9_000,
      accuracyMeters: undefined,
    });
    expect(invalid.location).toBeUndefined();
  });

  it.each([
    { lat: null, lng: 126.978 },
    { lat: '', lng: 126.978 },
    { lat: '   ', lng: 126.978 },
    { lat: 37.5665, lng: null },
  ])('does not turn blank or null stored coordinates into zero', location => {
    const session = normalizeIncidentSession({
      active: true,
      type: 'fire',
      startedAt: 10_000,
      location: {
        ...location,
        source: 'gps',
        resolvedAddress: '현재 위치',
        resolvedAt: 9_000,
        accuracyMeters: null,
      },
    });

    expect(session.location).toBeUndefined();
  });

  it('persists and broadcasts a normalized session', () => {
    const listener = vi.fn();
    window.addEventListener(INCIDENT_SESSION_EVENT, listener);

    saveIncidentSession({
      incidentId: 'incident-20000',
      active: true,
      type: 'ems',
      title: '환자 이송',
      address: '광주 서구',
      location: {
        lat: 35.1595,
        lng: 126.8526,
        source: 'gps',
        resolvedAddress: '현재 위치',
        resolvedAt: 19_000,
        accuracyMeters: 12,
      },
      startedAt: 20_000,
      note: '',
    });

    expect(JSON.parse(localStorage.getItem(INCIDENT_SESSION_KEY) || '{}')).toMatchObject({
      active: true,
      type: 'ems',
      location: { lat: 35.1595, source: 'gps', accuracyMeters: 12 },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(INCIDENT_SESSION_EVENT, listener);
  });
});
