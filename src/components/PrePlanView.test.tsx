// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrePlan } from '../types/preplan';
import PrePlanView from './PrePlanView';

const feedback = vi.hoisted(() => ({
  showUndo: vi.fn(),
  showNotice: vi.fn(),
  confirmAction: vi.fn(async () => true),
}));

vi.mock('../contexts/FeedbackContext', () => ({
  useAppFeedback: () => feedback,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

function storedPlans(): PrePlan[] {
  return JSON.parse(localStorage.getItem('119helper-preplans') ?? '[]') as PrePlan[];
}

describe('PrePlanView drafts and retention notice', () => {
  it('does not persist an empty preplan just by opening and closing the editor', async () => {
    render(<PrePlanView />);

    expect(screen.getByRole('note')).toHaveTextContent('설정한 자동 삭제 기간과 관계없이');
    fireEvent.click(screen.getByRole('button', { name: '새 대상물' }));

    expect(screen.getByRole('heading', { name: '대상물 편집' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('내용을 입력하면 이 기기에 자동 저장됩니다');
    await waitFor(() => expect(storedPlans()).toEqual([]));

    fireEvent.click(screen.getByRole('button', { name: '대상물 목록으로 돌아가기' }));

    expect(screen.getByText('등록된 대상물 0개')).toBeInTheDocument();
    expect(storedPlans()).toEqual([]);
  });

  it('starts immediate device persistence after meaningful input', async () => {
    render(<PrePlanView />);
    fireEvent.click(screen.getByRole('button', { name: '새 대상물' }));

    fireEvent.change(screen.getByLabelText('대상물명'), {
      target: { value: '광주 중앙시장' },
    });

    await waitFor(() => {
      expect(storedPlans()).toHaveLength(1);
      expect(storedPlans()[0]?.name).toBe('광주 중앙시장');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '입력 즉시 이 기기에 자동 저장됩니다 · 서버 동기화 없음',
    );

    fireEvent.click(screen.getByRole('button', { name: '대상물 목록으로 돌아가기' }));
    expect(screen.getByText('광주 중앙시장')).toBeInTheDocument();
  });

  it('returns a new item to an unsaved draft when all meaningful input is removed', async () => {
    render(<PrePlanView />);
    fireEvent.click(screen.getByRole('button', { name: '새 대상물' }));
    const nameInput = screen.getByLabelText('대상물명');

    fireEvent.change(nameInput, { target: { value: 'x' } });
    await waitFor(() => expect(storedPlans()).toHaveLength(1));

    fireEvent.change(nameInput, { target: { value: '' } });
    await waitFor(() => expect(storedPlans()).toEqual([]));
    expect(screen.getByRole('status')).toHaveTextContent('내용을 입력하면 이 기기에 자동 저장됩니다');

    fireEvent.click(screen.getByRole('button', { name: '대상물 목록으로 돌아가기' }));
    expect(screen.getByText('등록된 대상물 0개')).toBeInTheDocument();
  });

  it('removes legacy empty records instead of showing an unnamed card', async () => {
    localStorage.setItem('119helper-preplans', JSON.stringify([{
      id: 'legacy-empty',
      name: '',
      address: '',
      hazards: [],
      facilities: [],
      contacts: [],
      photoKeys: [],
      accessNotes: '',
      updatedAt: 1,
    }]));

    render(<PrePlanView />);

    expect(screen.getByText('등록된 대상물 0개')).toBeInTheDocument();
    expect(screen.queryByText('(이름 없음)')).not.toBeInTheDocument();
    await waitFor(() => expect(storedPlans()).toEqual([]));
  });
});
