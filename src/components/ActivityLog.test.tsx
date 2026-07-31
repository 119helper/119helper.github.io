// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityLog from './ActivityLog';

const mocks = vi.hoisted(() => ({
  activity: {
    incidentId: 'incident-active',
    presetId: 'fire',
    title: '시청 인근 화재',
    note: '',
    stamps: [{
      stageId: 'dispatch',
      label: '출동',
      time: 1_000,
      lat: null,
      lon: null,
    }],
  } as Record<string, unknown>,
  incident: {
    incidentId: 'incident-active',
    active: true,
    type: 'fire',
    title: '시청 인근 화재',
    address: '서울특별시 중구',
    startedAt: 1_000,
    note: '',
  } as Record<string, unknown>,
  archived: [] as Array<Record<string, unknown>>,
  publicDeviceMode: false,
  setActivity: vi.fn(),
  confirmAction: vi.fn(),
}));

vi.mock('../hooks/useActivitySession', () => ({
  useActivitySession: () => [mocks.activity, mocks.setActivity],
}));

vi.mock('../hooks/useIncidentSession', () => ({
  useIncidentSession: () => [mocks.incident, vi.fn()],
}));

vi.mock('../contexts/UserProfileContext', () => ({
  useUserProfile: () => ({
    authorLine: '소방사 홍길동',
    profile: { role: 'fire' },
  }),
}));

vi.mock('../contexts/TimerContext', () => ({
  useTimer: () => ({ allTimers: [] }),
}));

vi.mock('../contexts/FeedbackContext', () => ({
  useAppFeedback: () => ({
    confirmAction: mocks.confirmAction,
  }),
}));

vi.mock('../services/privacySettings', () => ({
  loadPrivacySettings: () => ({
    publicDeviceMode: mocks.publicDeviceMode,
    retentionDays: 30,
    appLockEnabled: false,
    appLockCodeHash: null,
    appLockSalt: null,
    appLockTimeoutMinutes: 15,
  }),
}));

vi.mock('../services/triageSession', () => ({
  loadTriagePatients: () => [],
}));

vi.mock('../services/incidentCaseStore', () => ({
  INCIDENT_CASE_ARCHIVE_EVENT: '119helper-incident-case-archive-updated',
  listIncidentCaseSnapshots: () => (
    mocks.publicDeviceMode ? [] : mocks.archived
  ),
  getIncidentCaseSnapshot: (incidentId: string) => (
    mocks.publicDeviceMode
      ? null
      : mocks.archived.find(item => item.incidentId === incidentId) ?? null
  ),
}));

function archivedIncident() {
  const activity = {
    incidentId: 'incident-closed',
    presetId: 'ems',
    title: '환자 이송',
    note: '의식 저하',
    stamps: [
      { stageId: 'dispatch', label: '출동', time: 1_000, lat: null, lon: null },
      { stageId: 'incident-close', label: '상황판 종료', time: 5_000, lat: null, lon: null },
    ],
  };
  const incident = {
    incidentId: 'incident-closed',
    active: false,
    type: 'ems',
    title: '환자 이송',
    address: '서울특별시 중구',
    startedAt: 1_000,
    endedAt: 5_000,
    note: '의식 저하',
  };
  return {
    schemaVersion: 1,
    incidentId: 'incident-closed',
    snapshotAt: 5_100,
    closedAt: 5_000,
    incident,
    activity,
    triagePatients: [],
    timers: [],
    stopwatch: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicDeviceMode = false;
  mocks.archived = [];
  mocks.activity = {
    incidentId: 'incident-active',
    presetId: 'fire',
    title: '시청 인근 화재',
    note: '',
    stamps: [{
      stageId: 'dispatch',
      label: '출동',
      time: 1_000,
      lat: null,
      lon: null,
    }],
  };
  mocks.incident = {
    incidentId: 'incident-active',
    active: true,
    type: 'fire',
    title: '시청 인근 화재',
    address: '서울특별시 중구',
    startedAt: 1_000,
    note: '',
  };
});

afterEach(cleanup);

describe('ActivityLog incident protection', () => {
  it('does not allow a new activity session to overwrite an active incident scope', () => {
    render(<ActivityLog />);

    const protectedButton = screen.getByRole('button', { name: '출동 기록 보호 중' });
    expect(protectedButton).toBeDisabled();
    expect(screen.getByText(/상황판 종료 전까지 새 기록으로 덮어쓸 수 없습니다/)).toHaveTextContent(
      '상황판 종료 전까지 새 기록으로 덮어쓸 수 없습니다',
    );

    fireEvent.click(protectedButton);
    expect(mocks.setActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['same-tab settings update', '119helper-settings-updated'],
    ['cross-tab return focus', 'focus'],
  ])('clears an in-memory archived report on %s after public device mode is enabled', async (
    _scenario,
    eventName,
  ) => {
    mocks.incident = {
      incidentId: '',
      active: false,
      type: 'fire',
      title: '',
      address: '',
      startedAt: 0,
      note: '',
    };
    mocks.activity = {
      presetId: 'fire',
      title: '',
      note: '',
      stamps: [],
    };
    mocks.archived = [archivedIncident()];
    render(<ActivityLog />);

    const loadButton = await screen.findByRole('button', { name: '읽기 전용으로 불러오기' });
    await waitFor(() => expect(loadButton).toBeEnabled());
    fireEvent.click(loadButton);
    expect(await screen.findByLabelText('생성된 보고서 초안')).toBeInTheDocument();

    mocks.publicDeviceMode = true;
    act(() => {
      window.dispatchEvent(new Event(eventName));
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('생성된 보고서 초안')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '읽기 전용으로 불러오기' })).not.toBeInTheDocument();
    });
  });
});
