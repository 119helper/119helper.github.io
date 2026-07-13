// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActivitySession } from './useActivitySession';

describe('useActivitySession', () => {
  beforeEach(() => localStorage.clear());

  it('synchronizes activity changes across mounted consumers', () => {
    const first = renderHook(() => useActivitySession('ems'));
    const second = renderHook(() => useActivitySession('ems'));

    act(() => {
      first.result.current[1](previous => ({
        ...previous,
        stamps: [
          ...previous.stamps,
          { stageId: 'arrival', label: '현장도착', time: 10_000, lat: null, lon: null },
        ],
      }));
    });

    expect(second.result.current[0].presetId).toBe('ems');
    expect(second.result.current[0].stamps).toEqual([
      expect.objectContaining({ stageId: 'arrival', label: '현장도착' }),
    ]);
  });
});
