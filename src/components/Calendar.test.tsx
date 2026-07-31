// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../contexts/FeedbackContext';
import { DEFAULT_PRIVACY_SETTINGS, savePrivacySettings } from '../services/privacySettings';
import Calendar from './Calendar';

function renderCalendar() {
  return render(
    <FeedbackProvider>
      <Calendar />
    </FeedbackProvider>,
  );
}

function storedSchedules() {
  return JSON.parse(localStorage.getItem('119helper-schedules') ?? '[]') as Array<{
    id: string;
    trackCompletion?: boolean;
    completedAt?: number;
  }>;
}

describe('Calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 9, 0, 0));
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens with today selected so the user can add or review work immediately', () => {
    renderCalendar();

    expect(screen.getByRole('heading', { name: '07월 31일' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가$/ })).toBeInTheDocument();
    expect(screen.queryByText('날짜를 선택하세요')).not.toBeInTheDocument();
  });

  it('does not rewrite or misclassify a legacy calendar-only event on mount', () => {
    const raw = JSON.stringify([{
      id: 'legacy-event',
      date: '2026-07-30',
      title: '기존 교육 일정',
      type: '교육',
      memo: '',
    }]);
    localStorage.setItem('119helper-schedules', raw);

    renderCalendar();

    expect(screen.queryByRole('region', { name: '이전 미완료 업무' })).not.toBeInTheDocument();
    expect(localStorage.getItem('119helper-schedules')).toBe(raw);
  });

  it('tracks actionable work by default while leaving an education event calendar-only', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: /추가$/ }));
    const dialog = screen.getByRole('dialog');
    const completionTracking = within(dialog).getByRole('checkbox', { name: '완료 상태 관리' });
    expect(completionTracking).toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: '교육' }));
    expect(completionTracking).not.toBeChecked();
    fireEvent.change(within(dialog).getByLabelText('제목'), {
      target: { value: '정기 교육 참석' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '추가' }));

    expect(storedSchedules()[0]?.trackCompletion).toBeUndefined();
  });

  it('opens overdue work in its original date and lets the user undo completion', async () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([{
      id: 'overdue-task',
      date: '2026-07-30',
      title: '소방특별조사 회신 확인',
      type: '기타',
      memo: '회신 담당자에게 다시 확인',
      trackCompletion: true,
    }]));

    renderCalendar();

    const overdue = screen.getByRole('region', { name: '이전 미완료 업무' });
    expect(overdue).toHaveTextContent('이전 미완료 업무 1건');
    fireEvent.click(screen.getByRole('button', { name: '소방특별조사 회신 확인 원래 날짜 보기' }));
    expect(screen.getByRole('heading', { name: '07월 30일' })).toBeInTheDocument();
    expect(screen.getByText('회신 담당자에게 다시 확인')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '소방특별조사 회신 확인 이전 업무 완료 표시' }));
    expect(screen.queryByRole('region', { name: '이전 미완료 업무' })).not.toBeInTheDocument();
    expect(storedSchedules()[0]?.completedAt).toEqual(expect.any(Number));

    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getByRole('region', { name: '이전 미완료 업무' })).toBeVisible();
    expect(storedSchedules()[0]?.completedAt).toBeUndefined();
  });

  it('toggles completion for a tracked item without deleting its calendar history', async () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([{
      id: 'today-task',
      date: '2026-07-31',
      title: '교육자료 제출',
      type: '교육',
      memo: '총무팀 확인',
      trackCompletion: true,
    }]));

    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: '교육자료 제출 완료 표시' }));
    expect(screen.getByRole('button', { name: '교육자료 제출 미완료로 되돌리기' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(storedSchedules()).toHaveLength(1);
    expect(storedSchedules()[0]?.completedAt).toEqual(expect.any(Number));

    fireEvent.click(screen.getByRole('button', { name: '교육자료 제출 미완료로 되돌리기' }));
    expect(screen.getByRole('button', { name: '교육자료 제출 완료 표시' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(storedSchedules()[0]?.completedAt).toBeUndefined();
  });

  it('merges an action with a newer stored list instead of overwriting it', () => {
    const first = {
      id: 'today-task',
      date: '2026-07-31',
      title: '교육자료 제출',
      type: '교육',
      memo: '',
      trackCompletion: true,
    };
    localStorage.setItem('119helper-schedules', JSON.stringify([first]));
    renderCalendar();

    localStorage.setItem('119helper-schedules', JSON.stringify([
      first,
      {
        id: 'other-tab-task',
        date: '2026-08-01',
        title: '다른 탭에서 추가',
        type: '기타',
        memo: '',
      },
    ]));
    fireEvent.click(screen.getByRole('button', { name: '교육자료 제출 완료 표시' }));

    expect(storedSchedules().map(schedule => schedule.id)).toEqual([
      'today-task',
      'other-tab-task',
    ]);
  });

  it('removes sensitive schedules from the open screen when public-device mode is applied', () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([{
      id: 'private-task',
      date: '2026-07-31',
      title: '민감한 내부 일정',
      type: '기타',
      memo: '',
    }]));
    renderCalendar();
    expect(screen.getByRole('button', { name: '민감한 내부 일정 일정 삭제' })).toBeVisible();

    savePrivacySettings({
      ...DEFAULT_PRIVACY_SETTINGS,
      publicDeviceMode: true,
    });
    act(() => window.dispatchEvent(new Event('119helper-settings-updated')));

    expect(screen.queryByText('민감한 내부 일정')).not.toBeInTheDocument();
    expect(localStorage.getItem('119helper-schedules')).toBeNull();
  });

  it('keeps the draft open and reports an error when storage is disabled', () => {
    savePrivacySettings({
      ...DEFAULT_PRIVACY_SETTINGS,
      publicDeviceMode: true,
    });
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: /추가$/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('제목'), {
      target: { value: '저장되지 않을 일정' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '추가' }));

    expect(dialog).toBeVisible();
    expect(screen.getByText(/일정을 저장하지 못했습니다/)).toBeVisible();
    expect(localStorage.getItem('119helper-schedules')).toBeNull();
  });

  it('warns that titles and memos leave the app before exporting an ICS file', () => {
    localStorage.setItem('119helper-schedules', JSON.stringify([{
      id: 'export-task',
      date: '2026-07-31',
      title: '민감 일정',
      type: '점검',
      memo: '내부 연락처',
    }]));

    renderCalendar();
    fireEvent.click(screen.getByRole('button', { name: /전체 내보내기/ }));

    const dialog = screen.getByRole('alertdialog', { name: '민감정보 내보내기' });
    expect(dialog).toHaveTextContent('일정 제목과 날짜');
    expect(dialog).toHaveTextContent('일정 메모의 내부 업무 내용');
  });

  it('moves an always-open calendar to the new day after midnight when it was following today', () => {
    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 30));
    renderCalendar();
    expect(screen.getByRole('heading', { name: '07월 31일' })).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date(2026, 7, 1, 0, 0, 30));
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('heading', { name: '2026년 8월' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '08월 01일' })).toBeInTheDocument();
  });

  it('warns about midnight rollover without moving an open schedule draft silently', () => {
    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 30));
    renderCalendar();
    fireEvent.click(screen.getByRole('button', { name: /추가$/ }));

    act(() => {
      vi.setSystemTime(new Date(2026, 7, 1, 0, 0, 30));
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('작성 중 날짜가 바뀌었습니다.');
    expect(screen.getByRole('heading', { name: /일정 추가 — 07월 31일/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '오늘(08월 01일)로 변경' }));
    expect(screen.getByRole('heading', { name: /일정 추가 — 08월 01일/ })).toBeInTheDocument();
  });
});
