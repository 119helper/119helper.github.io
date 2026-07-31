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
    expect(session.selections).toBeUndefined();
  });

  it('restores bounded immutable candidate snapshots without retaining the upstream object', () => {
    const upstream = {
      road: {
        id: ` road-${'x'.repeat(200)} `,
        selectedAt: 11_000,
        isActiveAtSelection: true,
        eventLabel: ' 도로 화재 ',
        controlLabel: ' 전면 통제 ',
        roadName: ' 세종대로 ',
        distanceKm: 1.25,
        distanceLabel: ' 1.3km ',
        status: ' 진행 중 ',
        sourceObservedAt: 10_900,
      },
      fireWater: {
        id: ' FW-119 ',
        selectedAt: 12_000,
        type: ' 소화전 ',
        address: ' 서울 중구 세종대로 ',
        distanceKm: 0.18,
        distanceLabel: ' 180m ',
        status: ' 정상 ',
        sourceDate: '2026-07-30',
      },
      hospital: {
        id: ' A110001 ',
        selectedAt: 13_000,
        name: ' 서울시민병원 ',
        address: ' 서울 중구 ',
        tel: ' 02-1234-5678 ',
        distanceKm: 4.2,
        distanceLabel: ' 4.2km ',
        erBeds: 7.8,
        wardBeds: 12,
        sourceObservedAt: 12_900,
      },
    };
    const session = normalizeIncidentSession({
      incidentId: 'incident-selection',
      active: true,
      type: 'ems',
      startedAt: 10_000,
      selections: upstream,
    });

    upstream.hospital.name = 'upstream changed';

    expect(session.selections).toEqual({
      road: {
        id: `road-${'x'.repeat(155)}`,
        selectedAt: 11_000,
        isActiveAtSelection: true,
        eventLabel: '도로 화재',
        controlLabel: '전면 통제',
        roadName: '세종대로',
        distanceKm: 1.25,
        distanceLabel: '1.3km',
        status: '진행 중',
        sourceObservedAt: 10_900,
      },
      fireWater: {
        id: 'FW-119',
        selectedAt: 12_000,
        type: '소화전',
        address: '서울 중구 세종대로',
        distanceKm: 0.18,
        distanceLabel: '180m',
        status: '정상',
        sourceDate: '2026-07-30',
      },
      hospital: {
        id: 'A110001',
        selectedAt: 13_000,
        name: '서울시민병원',
        address: '서울 중구',
        tel: '02-1234-5678',
        distanceKm: 4.2,
        distanceLabel: '4.2km',
        erBeds: undefined,
        wardBeds: 12,
        sourceObservedAt: 12_900,
      },
    });
  });

  it('drops damaged selections and removes invalid optional fields', () => {
    const session = normalizeIncidentSession({
      incidentId: 'incident-damaged',
      active: true,
      type: 'fire',
      startedAt: 10_000,
      selections: {
        road: {
          id: 'road-1',
          selectedAt: 11_000,
          isActiveAtSelection: true,
          eventLabel: '침수',
          distanceKm: -1,
          sourceObservedAt: 10_500,
        },
        fireWater: {
          id: '',
          selectedAt: 12_000,
          type: '소화전',
          address: '서울 중구',
          status: '미확인',
          sourceDate: null,
        },
        hospital: {
          id: 'hospital-1',
          selectedAt: 0,
          name: '시민병원',
          address: '서울 중구',
          sourceObservedAt: 11_000,
        },
      },
    });

    expect(session.selections).toEqual({
      road: {
        id: 'road-1',
        selectedAt: 11_000,
        isActiveAtSelection: true,
        eventLabel: '침수',
        controlLabel: undefined,
        roadName: undefined,
        distanceKm: undefined,
        distanceLabel: undefined,
        status: undefined,
        sourceObservedAt: 10_500,
      },
      fireWater: undefined,
      hospital: undefined,
    });
  });

  it('drops a selections envelope when none of its candidate snapshots are valid', () => {
    const session = normalizeIncidentSession({
      incidentId: 'incident-invalid',
      active: true,
      type: 'fire',
      startedAt: 10_000,
      selections: {
        road: {
          id: 'road-1',
          selectedAt: Number.NaN,
          isActiveAtSelection: true,
          eventLabel: '침수',
          sourceObservedAt: 10_500,
        },
        hospital: {
          id: 'hospital-1',
          selectedAt: 11_000,
          name: '',
          address: '서울',
          sourceObservedAt: 10_500,
        },
      },
    });

    expect(session.selections).toBeUndefined();
  });

  it('drops unscoped and temporally invalid selection snapshots', () => {
    const unscoped = normalizeIncidentSession({
      active: true,
      type: 'fire',
      startedAt: 10_000,
      selections: {
        road: {
          id: 'road-1',
          selectedAt: 11_000,
          isActiveAtSelection: true,
          eventLabel: '침수',
          sourceObservedAt: 10_500,
        },
      },
    });
    const futureObservation = normalizeIncidentSession({
      incidentId: 'incident-time',
      active: true,
      type: 'ems',
      startedAt: 10_000,
      selections: {
        hospital: {
          id: 'hospital-1',
          selectedAt: 11_000,
          name: '시민병원',
          address: '서울',
          sourceObservedAt: 12_000,
        },
      },
    });

    expect(unscoped.selections).toBeUndefined();
    expect(futureObservation.selections).toBeUndefined();
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
