// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnnualFireView from './AnnualFireView';

const apiMocks = vi.hoisted(() => ({
  fetchAnnualFireStats: vi.fn(),
  fetchAnnualFireYears: vi.fn(),
  isStaleDataError: vi.fn((_error: unknown) => false),
}));

vi.mock('../services/apiClient', () => ({
  fetchAnnualFireStats: (...args: unknown[]) => apiMocks.fetchAnnualFireStats(...args),
  fetchAnnualFireYears: (...args: unknown[]) => apiMocks.fetchAnnualFireYears(...args),
  isStaleDataError: (error: unknown) => apiMocks.isStaleDataError(error),
}));

describe('AnnualFireView coverage status', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    apiMocks.fetchAnnualFireYears.mockRejectedValue(new Error('coverage unavailable'));
    apiMocks.fetchAnnualFireStats.mockRejectedValue(new Error('stats unavailable'));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not present the current fallback year as an officially complete year', async () => {
    render(<AnnualFireView />);

    expect(await screen.findByText('공식 완결연도 미확인')).toBeInTheDocument();
    expect(screen.getByText(/제공 연도 목록을 불러오지 못함/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`공식 완결연도 ${new Date().getFullYear()}년`))).not.toBeInTheDocument();
  });
});
