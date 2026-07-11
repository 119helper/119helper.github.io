// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';

describe('GlobalSearch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a mobile search dialog and stores the selected tool as recent', () => {
    const onNavigate = vi.fn();
    render(<GlobalSearch onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '날씨' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /실시간 날씨·예보·특보/ }));

    expect(onNavigate).toHaveBeenCalledWith('weather', undefined);
    expect(JSON.parse(localStorage.getItem('119helper-recent-tools') || '[]')).toContain('menu-weather-main');
  });

  it('pins a tool as a favorite from mobile search', () => {
    render(<GlobalSearch onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '응급실' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '응급실 현황 즐겨찾기 추가' }));

    expect(JSON.parse(localStorage.getItem('119helper-favorite-tools') || '[]')).toContain('menu-er-main');
  });
});
