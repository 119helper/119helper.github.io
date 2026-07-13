// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useIncidentSession } from './useIncidentSession';

describe('useIncidentSession', () => {
  beforeEach(() => localStorage.clear());

  it('synchronizes incident changes across mounted consumers', () => {
    const first = renderHook(() => useIncidentSession());
    const second = renderHook(() => useIncidentSession());

    act(() => {
      first.result.current[1]({
        active: true,
        type: 'fire',
        title: '창고 화재',
        address: '서울 중구',
        startedAt: 10_000,
        note: '연소 확대 중',
      });
    });

    expect(second.result.current[0]).toMatchObject({ active: true, title: '창고 화재' });
  });
});
