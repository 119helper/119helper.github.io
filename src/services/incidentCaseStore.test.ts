// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncidentSession } from './incidentSession';
import {
  archiveIncidentCase,
  getIncidentCaseSnapshot,
  INCIDENT_CASE_ARCHIVE_KEY,
  listIncidentCaseSnapshots,
  removeIncidentCaseSnapshot,
  type IncidentCaseArchiveInput,
} from './incidentCaseStore';
import { savePrivacySettings } from './privacySettings';

const DAY_MS = 24 * 60 * 60 * 1000;

function privacy(overrides = {}) {
  return {
    publicDeviceMode: false,
    retentionDays: 30,
    appLockEnabled: false,
    appLockCodeHash: null,
    appLockSalt: null,
    appLockTimeoutMinutes: 15,
    ...overrides,
  };
}

function inputFor(
  incidentId: string,
  closedAt: number,
  overrides: Partial<IncidentCaseArchiveInput> = {},
): IncidentCaseArchiveInput {
  const incident: IncidentSession = {
    incidentId,
    active: false,
    type: 'fire',
    title: `${incidentId} 화재`,
    address: '서울',
    startedAt: closedAt - 60_000,
    endedAt: closedAt,
    note: '최초 기록',
  };

  return {
    incident,
    activity: {
      incidentId,
      presetId: 'fire',
      title: `${incidentId} 활동`,
      note: '',
      stamps: [{
        stageId: 'dispatch',
        label: '출동',
        time: closedAt - 60_000,
        lat: null,
        lon: null,
      }],
    },
    triagePatients: [{
      id: 'patient-current',
      incidentId,
      mode: 'adult',
      color: 'red',
      label: '환자 1',
      createdAt: new Date(closedAt - 30_000).toISOString(),
    }, {
      id: 'patient-foreign',
      incidentId: 'foreign',
      mode: 'adult',
      color: 'green',
      label: '다른 출동 환자',
      createdAt: new Date(closedAt - 20_000).toISOString(),
    }],
    timers: [{
      id: 1,
      incidentId,
      label: '공기호흡기',
      totalSeconds: 1800,
      remaining: 1200,
      isRunning: true,
      startedAt: new Date(closedAt - 10_000),
      endsAt: closedAt + 1_200_000,
    }, {
      id: 2,
      incidentId: 'foreign',
      label: '다른 출동 타이머',
      totalSeconds: 60,
      remaining: 30,
      isRunning: false,
      startedAt: null,
      endsAt: null,
    }],
    stopwatch: {
      incidentId,
      running: true,
      startedAt: new Date(closedAt - 50_000),
      elapsedMs: 50_000,
      laps: [{
        label: '현장 도착',
        time: new Date(closedAt - 20_000),
        elapsed: 30_000,
      }],
    },
    ...overrides,
  };
}

describe('incident case archive', () => {
  beforeEach(() => {
    localStorage.clear();
    savePrivacySettings(privacy());
  });

  it('incidentId가 정확히 일치하는 종료 시점 자료만 보관하고 날짜를 복구한다', () => {
    const closedAt = Date.now() - 1_000;
    const result = archiveIncidentCase(inputFor('incident-a', closedAt), closedAt + 100);

    expect(result.status).toBe('saved');
    const saved = getIncidentCaseSnapshot('incident-a', closedAt + 100);
    expect(saved).toMatchObject({
      schemaVersion: 1,
      incidentId: 'incident-a',
      snapshotAt: closedAt + 100,
      closedAt,
    });
    expect(saved?.triagePatients.map(patient => patient.id)).toEqual(['patient-current']);
    expect(saved?.timers.map(timer => timer.id)).toEqual([1]);
    expect(saved?.timers[0]).toMatchObject({
      remaining: 1200,
      isRunning: false,
      endsAt: null,
      wasRunningAtClose: true,
    });
    expect(saved?.timers[0].startedAt).toBeInstanceOf(Date);
    expect(saved?.stopwatch?.startedAt).toBeInstanceOf(Date);
    expect(saved?.stopwatch?.laps[0].time).toBeInstanceOf(Date);
  });

  it('실행 중 타이머 잔여시간을 종료 시각 기준으로 고정한다', () => {
    const closedAt = Date.now() - 1_000;
    const baseInput = inputFor('incident-a', closedAt);
    const input: IncidentCaseArchiveInput = {
      ...baseInput,
      timers: [{
        ...baseInput.timers[0],
        remaining: 1800,
        endsAt: closedAt + 25_000,
      }],
    };
    archiveIncidentCase(input, closedAt + 100);

    const first = getIncidentCaseSnapshot('incident-a', closedAt + 100);
    const muchLater = getIncidentCaseSnapshot('incident-a', closedAt + 20_000);
    expect(first?.timers[0]).toMatchObject({
      remaining: 25,
      isRunning: false,
      wasRunningAtClose: true,
    });
    expect(muchLater?.timers[0].remaining).toBe(25);
  });

  it('다른 incidentId 스톱워치는 현재 사건에 섞지 않는다', () => {
    const closedAt = Date.now() - 1_000;
    archiveIncidentCase(inputFor('incident-a', closedAt, {
      stopwatch: {
        incidentId: 'incident-b',
        running: true,
        startedAt: new Date(closedAt - 10_000),
        elapsedMs: 10_000,
        laps: [],
      },
    }), closedAt + 100);

    expect(getIncidentCaseSnapshot('incident-a', closedAt + 100)?.stopwatch).toBeNull();
  });

  it('같은 incidentId를 다시 보관해도 최초 스냅샷을 덮어쓰지 않는다', () => {
    const closedAt = Date.now() - 1_000;
    const first = archiveIncidentCase(inputFor('incident-a', closedAt), closedAt + 100);
    const changed = inputFor('incident-a', closedAt, {
      incident: {
        ...inputFor('incident-a', closedAt).incident,
        note: '나중 변경',
      },
    });
    const second = archiveIncidentCase(changed, closedAt + 200);

    expect(first.status).toBe('saved');
    expect(second.status).toBe('existing');
    expect(second.record?.incident.note).toBe('최초 기록');
    expect(second.record?.snapshotAt).toBe(closedAt + 100);
    expect(listIncidentCaseSnapshots(closedAt + 200)).toHaveLength(1);
  });

  it('전체 키가 아니라 각 closedAt을 기준으로 보존기간을 적용한다', () => {
    const now = Date.now();
    savePrivacySettings(privacy({ retentionDays: 30 }));
    const expiredClosedAt = now - 31 * DAY_MS;
    archiveIncidentCase(inputFor('expired', expiredClosedAt), expiredClosedAt + 100);
    archiveIncidentCase(inputFor('recent', now - DAY_MS), now);

    expect(listIncidentCaseSnapshots(now).map(record => record.incidentId)).toEqual(['recent']);
    expect(getIncidentCaseSnapshot('expired', now)).toBeNull();
  });

  it('공개기기 모드에서는 기존 보관자료를 지우고 새 자료를 저장하지 않는다', () => {
    const closedAt = Date.now() - 1_000;
    archiveIncidentCase(inputFor('incident-a', closedAt), closedAt + 100);
    expect(localStorage.getItem(INCIDENT_CASE_ARCHIVE_KEY)).not.toBeNull();

    savePrivacySettings(privacy({ publicDeviceMode: true }));
    const result = archiveIncidentCase(inputFor('incident-b', closedAt), closedAt + 200);

    expect(result).toEqual({ status: 'skipped-public' });
    expect(localStorage.getItem(INCIDENT_CASE_ARCHIVE_KEY)).toBeNull();
    expect(listIncidentCaseSnapshots(closedAt + 200)).toEqual([]);
  });

  it('명시적으로 한 사건 스냅샷만 삭제한다', () => {
    const now = Date.now();
    archiveIncidentCase(inputFor('incident-a', now - 2_000), now);
    archiveIncidentCase(inputFor('incident-b', now - 1_000), now);

    expect(removeIncidentCaseSnapshot('incident-a', now)).toBe(true);
    expect(removeIncidentCaseSnapshot('missing', now)).toBe(false);
    expect(listIncidentCaseSnapshots(now).map(record => record.incidentId)).toEqual(['incident-b']);
  });

  it('출동과 활동 기록의 incidentId가 다르면 보관을 거부한다', () => {
    const now = Date.now();
    expect(() => archiveIncidentCase(inputFor('incident-a', now - 1_000, {
      activity: {
        incidentId: 'incident-b',
        presetId: 'fire',
        title: '',
        note: '',
        stamps: [],
      },
    }), now)).toThrow('incidentId');
  });

  it('저장 후 같은 스냅샷을 읽지 못하면 검증 실패로 처리한다', () => {
    const now = Date.now();
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === INCIDENT_CASE_ARCHIVE_KEY) return;
      originalSetItem.call(this, key, value);
    });

    expect(() => archiveIncidentCase(inputFor('incident-a', now - 1_000), now))
      .toThrow('읽기 검증');
    setItem.mockRestore();
  });
});
