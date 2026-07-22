// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newsMocks = vi.hoisted(() => ({
  fetchLocalNews: vi.fn(),
}));

vi.mock('../services/newsApi', () => ({
  fetchLocalNews: newsMocks.fetchLocalNews,
}));

import NewsDashboard from './NewsDashboard';

describe('NewsDashboard', () => {
  beforeEach(() => {
    newsMocks.fetchLocalNews.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows one retryable error state without also presenting it as an empty result', async () => {
    newsMocks.fetchLocalNews.mockRejectedValue(new Error('연결 실패'));
    render(<NewsDashboard city="seoul" />);

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('뉴스를 불러오지 못했습니다');
    expect(screen.queryByText('관련 뉴스가 없습니다')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(newsMocks.fetchLocalNews).toHaveBeenCalledTimes(2));
  });
});
