import { describe, expect, it } from 'vitest';
import { classifyHeatStress, estimateWbgt } from './heatStress';

describe('heat stress utilities', () => {
  it('estimates WBGT from temperature and humidity', () => {
    // 30°C / 70% → 간이식상 약 32~33°C (고습에서 높게 추정됨)
    const wbgt = estimateWbgt(30, 70);
    expect(wbgt).not.toBeNull();
    expect(wbgt!).toBeGreaterThan(28);
    expect(wbgt!).toBeLessThan(35);
  });

  it('increases WBGT as humidity rises at the same temperature', () => {
    const dry = estimateWbgt(30, 30)!;
    const humid = estimateWbgt(30, 90)!;
    expect(humid).toBeGreaterThan(dry);
  });

  it('rejects invalid humidity', () => {
    expect(estimateWbgt(30, -1)).toBeNull();
    expect(estimateWbgt(30, 120)).toBeNull();
    expect(estimateWbgt(Number.NaN, 50)).toBeNull();
  });

  it('classifies low heat stress below 25°C', () => {
    const result = classifyHeatStress(22);
    expect(result.level).toBe('low');
    expect(result.restMinutes).toBe(0);
  });

  it('classifies extreme heat stress at or above 32°C', () => {
    const result = classifyHeatStress(33);
    expect(result.level).toBe('extreme');
    expect(result.workMinutes).toBeLessThanOrEqual(10);
  });

  it('returns work + rest that account for an hour in mid ranges', () => {
    const warning = classifyHeatStress(29);
    expect(warning.workMinutes + warning.restMinutes).toBe(60);
  });
});
