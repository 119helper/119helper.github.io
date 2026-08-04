// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataStatePanel from './DataStatePanel';

afterEach(() => cleanup());

describe('DataStatePanel', () => {
  it('announces loading without presenting an error', () => {
    render(
      <DataStatePanel
        tone="loading"
        icon="progress_activity"
        title="시설 데이터 확인 중"
        description="잠시만 기다려 주세요."
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces errors and exposes a full-size recovery action', () => {
    const retry = vi.fn();
    render(
      <DataStatePanel
        tone="error"
        icon="cloud_off"
        title="데이터를 불러오지 못했습니다"
        action={{ label: '다시 시도', icon: 'refresh', onClick: retry }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: '다시 시도' })).toHaveClass('min-h-11');
    expect(retry).toHaveBeenCalledOnce();
  });
});
