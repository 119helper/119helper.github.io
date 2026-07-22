// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../contexts/FeedbackContext';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

function Harness({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const requestClose = useUnsavedChangesGuard({ isDirty: dirty, onDiscard });
  return <button onClick={() => void requestClose()}>닫기</button>;
}

afterEach(cleanup);

describe('useUnsavedChangesGuard', () => {
  it('closes immediately when nothing changed', () => {
    const onDiscard = vi.fn();
    render(<FeedbackProvider><Harness dirty={false} onDiscard={onDiscard} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onDiscard).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps editing on cancel and discards only after confirmation', async () => {
    const onDiscard = vi.fn();
    render(<FeedbackProvider><Harness dirty onDiscard={onDiscard} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('alertdialog', { name: '변경사항을 버릴까요?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계속 편집' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 버리기' }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledOnce());
  });
});
