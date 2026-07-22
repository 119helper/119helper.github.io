// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { FeedbackProvider, useAppFeedback } from './FeedbackContext';

function Harness({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const { showUndo, showNotice, confirmAction, finalizeAll } = useAppFeedback();
  const [decision, setDecision] = useState('대기');
  return (
    <>
      <button onClick={() => showUndo({ message: '메모를 삭제했습니다.', undo: onUndo, onExpire })}>삭제</button>
      <button onClick={() => showNotice({ message: '복사했습니다.', tone: 'success' })}>알림</button>
      <button onClick={async () => setDecision(await confirmAction({ title: '초기화 확인', message: '정말 초기화할까요?', tone: 'danger', confirmLabel: '초기화' }) ? '확인' : '취소')}>확인창</button>
      <button onClick={finalizeAll}>화면 이동</button>
      <p data-testid="decision">{decision}</p>
    </>
  );
}

function NestedDialogHarness() {
  const [outerOpen, setOuterOpen] = useState(true);
  const { confirmAction } = useAppFeedback();
  const outerRef = useDialogAccessibility<HTMLDivElement>(outerOpen, () => setOuterOpen(false));
  return outerOpen ? (
    <div ref={outerRef} role="dialog" aria-label="바깥 설정" tabIndex={-1}>
      <button onClick={() => void confirmAction({ title: '중첩 확인', message: '계속할까요?' })}>중첩 확인 열기</button>
    </div>
  ) : <p>바깥 닫힘</p>;
}

function QueuedDialogHarness() {
  const { confirmAction } = useAppFeedback();
  const [decisions, setDecisions] = useState('대기');
  const openQueuedDialogs = async () => {
    const first = confirmAction({ title: '첫 번째 확인', message: '첫 작업을 진행할까요?' });
    const second = confirmAction({ title: '두 번째 확인', message: '두 번째 작업도 진행할까요?' });
    setDecisions(`${await first}/${await second}`);
  };
  return (
    <>
      <button onClick={() => void openQueuedDialogs()}>연속 확인 열기</button>
      <p data-testid="queued-decisions">{decisions}</p>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FeedbackProvider', () => {
  it('runs the undo callback and removes the toast', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    render(<FeedbackProvider><Harness onUndo={onUndo} onExpire={onExpire} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('status')).toHaveTextContent('메모를 삭제했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows and dismisses a non-blocking notice', () => {
    render(<FeedbackProvider><Harness onUndo={vi.fn()} onExpire={vi.fn()} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '알림' }));
    expect(screen.getByRole('status')).toHaveTextContent('복사했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('복사했습니다.')).not.toBeInTheDocument();
  });

  it('resolves an accessible confirmation dialog', async () => {
    render(<FeedbackProvider><Harness onUndo={vi.fn()} onExpire={vi.fn()} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '확인창' }));
    const dialog = screen.getByRole('alertdialog', { name: '초기화 확인' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    await waitFor(() => expect(screen.getByTestId('decision')).toHaveTextContent('확인'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('lets Escape close only the topmost dialog', async () => {
    render(<FeedbackProvider><NestedDialogHarness /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '중첩 확인 열기' }));
    expect(screen.getByRole('alertdialog', { name: '중첩 확인' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '바깥 설정' })).toBeInTheDocument();
  });

  it('queues overlapping confirmations and restores focus after the final decision', async () => {
    render(<FeedbackProvider><QueuedDialogHarness /></FeedbackProvider>);

    const trigger = screen.getByRole('button', { name: '연속 확인 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('alertdialog', { name: '첫 번째 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(screen.getByRole('alertdialog', { name: '두 번째 확인' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.getByTestId('queued-decisions')).toHaveTextContent('true/false'));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('commits pending cleanup when the action expires', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<FeedbackProvider><Harness onUndo={vi.fn()} onExpire={onExpire} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    act(() => vi.advanceTimersByTime(10_000));

    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('commits pending cleanup when navigation finalizes the queue', () => {
    const onExpire = vi.fn();
    render(<FeedbackProvider><Harness onUndo={vi.fn()} onExpire={onExpire} /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '화면 이동' }));

    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
