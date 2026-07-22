// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkStatusState } from '../hooks/useNetworkStatus';

const connectivityMocks = vi.hoisted(() => ({
  status: { state: 'online', lastSuccessAt: null } as NetworkStatusState,
  registerServiceWorker: vi.fn(),
  updateCallback: null as (() => void) | null,
}));

vi.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => connectivityMocks.status,
}));

vi.mock('../utils/registerServiceWorker', () => ({
  registerServiceWorker: connectivityMocks.registerServiceWorker,
  applyUpdate: vi.fn(),
}));

import ConnectivityStatus from './ConnectivityStatus';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  connectivityMocks.status = { state: 'online', lastSuccessAt: null };
  connectivityMocks.updateCallback = null;
  connectivityMocks.registerServiceWorker.mockImplementation((onUpdate: () => void) => {
    connectivityMocks.updateCallback = onUpdate;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConnectivityStatus', () => {
  it('uses a compact mobile label and automatically clears a temporary unstable notice', () => {
    connectivityMocks.status = { state: 'unstable', lastSuccessAt: null };
    render(<ConnectivityStatus />);

    expect(screen.getByLabelText('연결 불안정. 일부 정보가 마지막 저장값일 수 있습니다')).toBeInTheDocument();
    expect(screen.getByText('연결 불안정')).toHaveClass('sm:hidden');
    expect(screen.getByText('연결 불안정 · 일부 정보가 마지막 저장값일 수 있습니다')).toHaveClass('hidden', 'sm:inline');

    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.getByLabelText('연결 불안정. 일부 정보가 마지막 저장값일 수 있습니다')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByLabelText('연결 불안정. 일부 정보가 마지막 저장값일 수 있습니다')).not.toBeInTheDocument();
  });

  it('keeps a confirmed offline notice visible until the user dismisses it', () => {
    connectivityMocks.status = { state: 'offline', lastSuccessAt: null };
    render(<ConnectivityStatus />);

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByLabelText('오프라인. 실시간 정보는 마지막 저장값으로 표시됩니다')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '오프라인 안내 닫기' }));
    expect(screen.queryByLabelText('오프라인. 실시간 정보는 마지막 저장값으로 표시됩니다')).not.toBeInTheDocument();
  });

  it('still presents an available app update when the connection is online', () => {
    render(<ConnectivityStatus />);

    act(() => connectivityMocks.updateCallback?.());
    expect(screen.getByText('새 버전이 있습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
  });
});
