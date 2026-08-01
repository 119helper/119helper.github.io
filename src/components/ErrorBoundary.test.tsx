// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundaryMocks = vi.hoisted(() => ({
  attemptChunkLoadRecovery: vi.fn(),
  reloadApp: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock('../services/telemetry', () => ({
  reportClientError: boundaryMocks.reportClientError,
}));

vi.mock('../utils/chunkLoadRecovery', () => ({
  attemptChunkLoadRecovery: boundaryMocks.attemptChunkLoadRecovery,
  isChunkLoadError: (error: unknown) => (
    error instanceof Error
      && error.message.includes('Failed to fetch dynamically imported module')
  ),
  reloadApp: boundaryMocks.reloadApp,
}));

import ErrorBoundary from './ErrorBoundary';

function BrokenLazyView(): never {
  throw new Error('Failed to fetch dynamically imported module: /assets/DashboardView-old.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary chunk recovery', () => {
  it('attempts automatic recovery and offers a full reload without exposing the asset URL', () => {
    render(
      <ErrorBoundary fallbackTitle="평시 대시보드 화면 오류">
        <BrokenLazyView />
      </ErrorBoundary>,
    );

    expect(boundaryMocks.attemptChunkLoadRecovery).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '최신 화면을 연결하지 못했습니다' })).toBeInTheDocument();
    expect(screen.getByText(/이미 저장된 출동·활동 기록은 유지됩니다/)).toBeInTheDocument();
    expect(screen.queryByText(/DashboardView-old\.js/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '최신 화면 다시 열기' }));
    expect(boundaryMocks.reloadApp).toHaveBeenCalledTimes(1);
  });
});
