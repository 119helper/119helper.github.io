// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newsMocks = vi.hoisted(() => ({
  fetchLocalNews: vi.fn(),
  fetchNewsThumbnail: vi.fn(),
}));

vi.mock('../services/newsApi', () => ({
  fetchLocalNews: newsMocks.fetchLocalNews,
  fetchNewsThumbnail: newsMocks.fetchNewsThumbnail,
}));

import NewsDashboard from './NewsDashboard';

describe('NewsDashboard', () => {
  beforeEach(() => {
    newsMocks.fetchLocalNews.mockReset();
    newsMocks.fetchNewsThumbnail.mockReset();
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

  it('gives article links a clean accessible name and announces the new window', async () => {
    newsMocks.fetchLocalNews.mockResolvedValue([{
      id: 'article-1',
      title: '전공노 "징계자 특혜성 끼워넣기 인사" 규탄',
      link: 'https://news.example/article-1',
      pubDate: '7월 30일 오후 06:16',
      source: 'Google 뉴스',
      description: '광주소방본부의 후속 인사를 다룬 기사입니다.',
      isOfficial: true,
    }]);

    render(<NewsDashboard city="gwangju" />);

    const articleLink = await screen.findByRole('link', {
      name: /전공노 "징계자 특혜성 끼워넣기 인사" 규탄.*새 창에서 열림/,
    });
    expect(articleLink).toHaveAttribute('target', '_blank');
    expect(articleLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(articleLink).not.toHaveAccessibleName(
      /verified|schedule|arrow_forward|local_fire_department/,
    );
  });
});
