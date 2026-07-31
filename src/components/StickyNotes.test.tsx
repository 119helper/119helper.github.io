// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../contexts/FeedbackContext';
import {
  DEFAULT_PRIVACY_SETTINGS,
  savePrivacySettings,
  storageTimestampKey,
} from '../services/privacySettings';
import StickyNotes from './StickyNotes';

describe('StickyNotes briefing count', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not count a blank draft as a saved memo', async () => {
    const onCountChange = vi.fn();
    render(
      <FeedbackProvider>
        <StickyNotes embedMode onCountChange={onCountChange} />
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /새 메모/ }));
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));

    fireEvent.change(screen.getByRole('textbox', { name: '메모 내용' }), {
      target: { value: '인수인계 확인' },
    });
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(1));
  });

  it('does not resurrect an open memo after its retention period expires', () => {
    vi.useFakeTimers();
    const openedAt = new Date(2026, 6, 1, 9, 0).getTime();
    vi.setSystemTime(openedAt);
    savePrivacySettings({
      ...DEFAULT_PRIVACY_SETTINGS,
      retentionDays: 1,
    });
    localStorage.setItem('119helper-notes', JSON.stringify([{
      id: 'expired-note',
      text: '만료되어야 할 인수인계',
      color: 'bg-yellow-100 dark:bg-yellow-500/20',
      createdAt: '2026. 7. 1.',
    }]));
    localStorage.setItem(storageTimestampKey('119helper-notes'), String(openedAt));

    render(
      <FeedbackProvider>
        <StickyNotes embedMode />
      </FeedbackProvider>,
    );
    const memo = screen.getByRole('textbox', { name: '메모 내용' });
    expect(memo).toHaveValue('만료되어야 할 인수인계');

    vi.setSystemTime(openedAt + 2 * 24 * 60 * 60 * 1_000);
    fireEvent.change(memo, { target: { value: '다시 저장되면 안 됨' } });

    expect(screen.queryByRole('textbox', { name: '메모 내용' })).not.toBeInTheDocument();
    expect(localStorage.getItem('119helper-notes')).toBe('[]');
  });
});
