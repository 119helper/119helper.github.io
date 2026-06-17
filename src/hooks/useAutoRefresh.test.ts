// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getSafeRefreshInterval, useAutoRefresh } from './useAutoRefresh';

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('getSafeRefreshInterval', () => {
  it('defaults to 5 when unset', () => {
    expect(getSafeRefreshInterval()).toBe(5);
  });
  it('reads a valid stored value', () => {
    localStorage.setItem('119helper-refresh', '15');
    expect(getSafeRefreshInterval()).toBe(15);
  });
  it('allows 0 (manual mode)', () => {
    localStorage.setItem('119helper-refresh', '0');
    expect(getSafeRefreshInterval()).toBe(0);
  });
  it('falls back to 5 for negative or garbage values', () => {
    localStorage.setItem('119helper-refresh', '-3');
    expect(getSafeRefreshInterval()).toBe(5);
    localStorage.setItem('119helper-refresh', 'abc');
    expect(getSafeRefreshInterval()).toBe(5);
  });
});

describe('useAutoRefresh', () => {
  it('refreshes immediately on mount', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('fires refresh on the configured interval', () => {
    vi.useFakeTimers();
    localStorage.setItem('119helper-refresh', '1'); // 1분
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    expect(refresh).toHaveBeenCalledTimes(1); // mount

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('does not set an interval in manual mode (0)', () => {
    vi.useFakeTimers();
    localStorage.setItem('119helper-refresh', '0');
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    expect(refresh).toHaveBeenCalledTimes(1); // mount only

    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(refresh).toHaveBeenCalledTimes(1); // 주기 갱신 없음
  });
});
