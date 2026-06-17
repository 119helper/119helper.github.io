// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { formatTimeAgo, useNotifications } from './useNotifications';

describe('formatTimeAgo', () => {
  const now = Date.now();
  it('shows 방금 전 under a minute', () => {
    expect(formatTimeAgo(new Date(now - 30_000))).toBe('방금 전');
  });
  it('shows minutes under an hour', () => {
    expect(formatTimeAgo(new Date(now - 5 * 60_000))).toBe('5분 전');
  });
  it('shows hours under a day', () => {
    expect(formatTimeAgo(new Date(now - 3 * 3_600_000))).toBe('3시간 전');
  });
  it('shows days beyond 24h', () => {
    expect(formatTimeAgo(new Date(now - 2 * 86_400_000))).toBe('2일 전');
  });
});

describe('useNotifications', () => {
  it('adds a notification flagged as new', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification(undefined, 'rainy', 'text-blue', '비', '강수 감지'));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({ title: '비', message: '강수 감지', isNew: true });
  });

  it('dedupes by custom id', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification('fire-1', 'whatshot', 'c', '산불', 'A'));
    act(() => result.current.addNotification('fire-1', 'whatshot', 'c', '산불', 'B'));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].message).toBe('A'); // 첫 알림 유지
  });

  it('dedupes id-less notifications by title+message', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification(undefined, 'i', 'c', '폭염', '주의'));
    act(() => result.current.addNotification(undefined, 'i', 'c', '폭염', '주의'));
    expect(result.current.notifications).toHaveLength(1);
  });

  it('keeps different id-less notifications', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification(undefined, 'i', 'c', '폭염', '주의'));
    act(() => result.current.addNotification(undefined, 'i', 'c', '한파', '주의'));
    expect(result.current.notifications).toHaveLength(2);
  });

  it('prepends newest first', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification('a', 'i', 'c', '첫째', 'x'));
    act(() => result.current.addNotification('b', 'i', 'c', '둘째', 'y'));
    expect(result.current.notifications.map(n => n.id)).toEqual(['b', 'a']);
  });

  it('caps at 50 notifications', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.addNotification(`n-${i}`, 'i', 'c', `t-${i}`, 'm');
      }
    });
    expect(result.current.notifications).toHaveLength(50);
    expect(result.current.notifications[0].id).toBe('n-59'); // 최신 보존
  });

  it('markAllRead clears the isNew flag', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification('a', 'i', 'c', 't', 'm'));
    act(() => result.current.markAllRead());
    expect(result.current.notifications.every(n => !n.isNew)).toBe(true);
  });

  it('clearAll empties the list', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification('a', 'i', 'c', 't', 'm'));
    act(() => result.current.clearAll());
    expect(result.current.notifications).toHaveLength(0);
  });
});
