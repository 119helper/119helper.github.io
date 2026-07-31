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

  it('opens a mobile search dialog and navigates to the selected tool', () => {
    const onNavigate = vi.fn();
    render(<GlobalSearch onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '날씨' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /실시간 날씨·예보·특보/ }));

    expect(onNavigate).toHaveBeenCalledWith('weather', undefined);
  });

  it('keeps each search result as one clear navigation action', () => {
    render(<GlobalSearch onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '응급실' } });

    expect(within(dialog).getAllByRole('button', { name: /응급실 현황/ })).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: /즐겨찾기/ })).not.toBeInTheDocument();
  });

  it('opens the response workspace entry from a field-response query', () => {
    const onNavigate = vi.fn();
    render(<GlobalSearch onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), {
      target: { value: '상황판' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /출동 시작·현장 브리핑·활동 기록/ }));

    expect(onNavigate).toHaveBeenCalledWith('incident', undefined);
  });

  it('keeps a mobile query when the dialog is closed and reopened', () => {
    render(<GlobalSearch onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    let dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), { target: { value: '산불' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '기능 검색 닫기' }));

    expect(screen.queryByRole('dialog', { name: '기능 검색' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    dialog = screen.getByRole('dialog', { name: '기능 검색' });
    expect(within(dialog).getByRole('searchbox', { name: '기능 검색' })).toHaveValue('산불');
  });

  it('moves through search results with the keyboard', () => {
    const onNavigate = vi.fn();
    render(<GlobalSearch onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const search = within(screen.getByRole('dialog', { name: '기능 검색' }))
      .getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '계산기' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('calculator', undefined);
  });

  it('offers a focused recovery action when there are no results', () => {
    render(<GlobalSearch onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '없는기능' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '검색어 지우기' }));

    expect(search).toHaveValue('');
    expect(within(dialog).getByText('기능 이름을 검색해 바로 이동하세요.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/최근 사용|즐겨찾기/)).not.toBeInTheDocument();
  });
});
