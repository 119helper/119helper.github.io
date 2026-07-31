// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../contexts/FeedbackContext';
import Calendar from './Calendar';

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
    render(
      <FeedbackProvider>
        <Calendar />
      </FeedbackProvider>,
    );

    expect(screen.getByRole('heading', { name: '07월 31일' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가$/ })).toBeInTheDocument();
    expect(screen.queryByText('날짜를 선택하세요')).not.toBeInTheDocument();
  });
});
