// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider, useUndoToast } from './UndoToastContext';

function Harness({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const { showUndo, finalizeAll } = useUndoToast();
  return (
    <>
      <button onClick={() => showUndo({ message: '메모를 삭제했습니다.', undo: onUndo, onExpire })}>삭제</button>
      <button onClick={finalizeAll}>화면 이동</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UndoToastProvider', () => {
  it('runs the undo callback and removes the toast', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    render(
      <UndoToastProvider>
        <Harness onUndo={onUndo} onExpire={onExpire} />
      </UndoToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('status')).toHaveTextContent('메모를 삭제했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('commits pending cleanup when the action expires', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(
      <UndoToastProvider>
        <Harness onUndo={vi.fn()} onExpire={onExpire} />
      </UndoToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    act(() => vi.advanceTimersByTime(10_000));

    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('commits pending cleanup when navigation finalizes the queue', () => {
    const onExpire = vi.fn();
    render(
      <UndoToastProvider>
        <Harness onUndo={vi.fn()} onExpire={onExpire} />
      </UndoToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '화면 이동' }));

    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
