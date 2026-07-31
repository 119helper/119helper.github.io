// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';

function renderSearch() {
  const handlers = {
    onNavigate: vi.fn(),
    onOpenBuildingAddress: vi.fn(),
    onOpenPreplan: vi.fn(),
  };
  render(<GlobalSearch {...handlers} />);
  return handlers;
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({ route: 'keep' }, '', '/#dashboard');
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a mobile search dialog and navigates to the selected tool', async () => {
    const { onNavigate } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '날씨' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /실시간 날씨·예보·특보/ }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('weather', undefined));
  });

  it('keeps each search result as one clear navigation action', () => {
    renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '응급실' } });

    expect(within(dialog).getAllByRole('button', { name: /응급실 현황/ })).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: /즐겨찾기/ })).not.toBeInTheDocument();
  });

  it('opens the response workspace entry from a field-response query', async () => {
    const { onNavigate } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), {
      target: { value: '상황판' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /출동 시작·현장 브리핑·활동 기록/ }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('incident', undefined));
  });

  it('keeps a mobile query when the dialog is closed and reopened', async () => {
    renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    let dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), { target: { value: '산불' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '기능 검색 닫기' }));

    expect(screen.queryByRole('dialog', { name: '기능 검색' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.history.state).not.toEqual(
        expect.objectContaining({ __119helperGlobalSearchOverlay: true }),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    dialog = screen.getByRole('dialog', { name: '기능 검색' });
    expect(within(dialog).getByRole('searchbox', { name: '기능 검색' })).toHaveValue('산불');
  });

  it('moves through search results with the keyboard', async () => {
    const { onNavigate } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const search = within(screen.getByRole('dialog', { name: '기능 검색' }))
      .getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '계산기' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('calculator', undefined));
  });

  it('offers a focused recovery action when there are no results', () => {
    renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '없는기능' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '검색어 지우기' }));

    expect(search).toHaveValue('');
    expect(within(dialog).getByText('기능 이름을 검색해 바로 이동하세요.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/최근 사용|즐겨찾기/)).not.toBeInTheDocument();
  });

  it('offers an address action that opens the building workspace with the query prefilled', async () => {
    const { onNavigate, onOpenBuildingAddress } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    const search = within(dialog).getByRole('searchbox', { name: '기능 검색' });
    fireEvent.change(search, { target: { value: '광주광역시 북구 서암대로 71' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^건축물대장으로 조회/ }));

    await waitFor(() => {
      expect(onOpenBuildingAddress).toHaveBeenCalledWith('광주광역시 북구 서암대로 71');
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows stored preplan name, address, and hazards and opens it with a visible search term', async () => {
    localStorage.setItem('119helper-preplans', JSON.stringify([{
      id: 'preplan-1',
      name: '송정센터',
      address: '광주광역시 광산구 상무대로 201',
      hazards: ['리튬 배터리', '가스'],
    }]));
    const { onOpenPreplan } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), {
      target: { value: '리튬 배터리' },
    });

    const preplanAction = within(dialog).getByRole('button', { name: /^저장 대상물 · 송정센터/ });
    expect(preplanAction).toHaveTextContent('광주광역시 광산구 상무대로 201');
    expect(preplanAction).toHaveTextContent('위험요소: 리튬 배터리, 가스');
    fireEvent.click(preplanAction);

    await waitFor(() => expect(onOpenPreplan).toHaveBeenCalledWith('송정센터'));
  });

  it('opens the SOP reference list for a generic SOP query', async () => {
    const { onNavigate } = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    const dialog = screen.getByRole('dialog', { name: '기능 검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), {
      target: { value: 'SOP' },
    });

    const sopAction = within(dialog).getByRole('button', { name: /^SOP 체크리스트 열기/ });
    expect(sopAction).toHaveTextContent('공식 지침을 우선하세요');
    fireEvent.click(sopAction);

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('manual', 'sop'));
  });

  it.each([
    ['리튬 배터리', '차량화재', 'sop:vehicle-fire'],
    ['전기차', '차량화재', 'sop:vehicle-fire'],
    ['차량', '차량화재', 'sop:vehicle-fire'],
    ['화학', '위험물/화학 화재', 'sop:hazmat-fire'],
    ['가스', '가스누출', 'sop:gas-leak'],
  ])(
    'opens the relevant SOP reference directly for "%s"',
    async (keyword, sopTitle, subId) => {
      const { onNavigate } = renderSearch();

      fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
      const dialog = screen.getByRole('dialog', { name: '기능 검색' });
      fireEvent.change(within(dialog).getByRole('searchbox', { name: '기능 검색' }), {
        target: { value: keyword },
      });

      const sopAction = within(dialog).getByRole('button', {
        name: new RegExp(`^${sopTitle.replace('/', '\\/')} SOP 참고표 열기`),
      });
      expect(sopAction).toHaveTextContent('공식 지침을 우선하세요');
      fireEvent.click(sopAction);

      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('manual', subId));
    },
  );

  it('uses browser back to close the mobile search before changing the existing route', async () => {
    window.history.replaceState({ route: 'keep' }, '', '/#weather');
    const handlers = renderSearch();

    fireEvent.click(screen.getByRole('button', { name: '기능 검색 열기' }));
    expect(screen.getByRole('dialog', { name: '기능 검색' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#weather');

    await act(async () => {
      window.history.back();
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '기능 검색' })).not.toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#weather');
    expect(window.history.state).toEqual(expect.objectContaining({ route: 'keep' }));
    expect(handlers.onNavigate).not.toHaveBeenCalled();
    expect(handlers.onOpenBuildingAddress).not.toHaveBeenCalled();
    expect(handlers.onOpenPreplan).not.toHaveBeenCalled();
  });

  it('uses browser back to close desktop results before changing the existing route', async () => {
    window.history.replaceState({ route: 'keep' }, '', '/#weather');
    const handlers = renderSearch();
    const search = screen.getByRole('searchbox', { name: '기능 검색' });

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: '산불' } });
    expect(screen.getByRole('button', { name: /실시간 산불 발생·진화 현황/ })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /실시간 산불 발생·진화 현황/ }))
        .not.toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#weather');
    expect(window.history.state).toEqual(expect.objectContaining({ route: 'keep' }));
    expect(handlers.onNavigate).not.toHaveBeenCalled();
  });
});
