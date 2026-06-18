import { describe, expect, it } from 'vitest';
import { classifyForestFireRisk, normalizeForestFireRisk } from './forestFireRiskApi';

describe('forest fire risk utilities', () => {
  it('classifies official risk index thresholds', () => {
    expect(classifyForestFireRisk(50)).toBe('낮음');
    expect(classifyForestFireRisk(51)).toBe('보통');
    expect(classifyForestFireRisk(66)).toBe('높음');
    expect(classifyForestFireRisk(86)).toBe('매우 높음');
  });

  it('normalizes common English-style response fields', () => {
    const risk = normalizeForestFireRisk({
      items: [
        { sidoNm: '부산광역시', maxValue: '52', minValue: '6', avgValue: '30', analDate: '202606181500' },
        { sidoNm: '서울특별시', maxValue: '80', minValue: '5', avgValue: '58', analDate: '202606181500' },
      ],
      totalCount: 2,
      fetchedAt: '2026-06-18T06:00:00.000Z',
    }, '서울');

    expect(risk).toMatchObject({
      sidoName: '서울특별시',
      value: 80,
      min: 5,
      avg: 58,
      max: 80,
      level: '높음',
      forecastTime: '202606181500',
    });
  });

  it('normalizes Korean-style response fields', () => {
    const risk = normalizeForestFireRisk({
      items: [
        { 지역: '광주광역시', 최대값: '52', 최소값: '8', 평균값: '34' },
      ],
      totalCount: 1,
    }, '광주');

    expect(risk?.sidoName).toBe('광주광역시');
    expect(risk?.value).toBe(52);
    expect(risk?.level).toBe('보통');
  });

  it('aggregates multiple city district rows conservatively', () => {
    const risk = normalizeForestFireRisk({
      items: [
        { region: '서울특별시 종로구', maxValue: '70', minValue: '10', avgValue: '40' },
        { region: '서울특별시 강남구', maxValue: '88', minValue: '7', avgValue: '54' },
      ],
      totalCount: 2,
    }, '서울');

    expect(risk?.value).toBe(88);
    expect(risk?.min).toBe(7);
    expect(risk?.avg).toBe(47);
    expect(risk?.level).toBe('매우 높음');
  });
});
