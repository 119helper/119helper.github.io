import { describe, expect, it } from 'vitest';
import { classifyAviationSafety } from './aviationSafety';

describe('aviation safety classification', () => {
  it('classifies wind under 7m/s as good', () => {
    expect(classifyAviationSafety(6.9).level).toBe('good');
  });

  it('classifies 7m/s to under 10m/s as caution', () => {
    expect(classifyAviationSafety(7).level).toBe('caution');
    expect(classifyAviationSafety('9.9').level).toBe('caution');
  });

  it('classifies 10m/s and above as danger', () => {
    expect(classifyAviationSafety(10).level).toBe('danger');
  });

  it('falls back to caution when wind is unavailable', () => {
    expect(classifyAviationSafety(undefined).label).toBe('확인 필요');
  });
});
