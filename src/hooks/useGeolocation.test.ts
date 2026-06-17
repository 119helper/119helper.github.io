// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error 테스트 정리: jsdom navigator.geolocation 복구
  delete navigator.geolocation;
});

describe('useGeolocation', () => {
  it('reports unsupported when the browser lacks geolocation', () => {
    // jsdom에는 navigator.geolocation이 없음
    const setCity = vi.fn();
    const { result } = renderHook(() => useGeolocation(setCity));
    expect(result.current.gpsStatus).toBe('unsupported');
    expect(result.current.locationNotice?.kind).toBe('warning');
    expect(setCity).not.toHaveBeenCalled();
  });

  it('skips auto-detection when a city is already saved', () => {
    localStorage.setItem('119helper-city', 'busan');
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const setCity = vi.fn();
    const { result } = renderHook(() => useGeolocation(setCity));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.gpsStatus).toBe('idle');
    expect(setCity).not.toHaveBeenCalled();
  });

  it('enters loading and requests position when no saved city exists', () => {
    const getCurrentPosition = vi.fn(); // 콜백을 호출하지 않음 → loading 유지
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const setCity = vi.fn();
    const { result } = renderHook(() => useGeolocation(setCity));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(result.current.gpsStatus).toBe('loading');
  });
});
