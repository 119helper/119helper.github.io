import { describe, expect, it } from 'vitest';
import { latLngToGrid, parseCurrentWeather, windDirectionText, type ForecastItem } from './weatherApi';

describe('weather utilities', () => {
  it('converts Seoul City Hall coordinates to KMA grid coordinates', () => {
    expect(latLngToGrid(37.5665, 126.9780)).toEqual({ nx: 60, ny: 127 });
  });

  it('maps wind bearing degrees to Korean compass text', () => {
    expect(windDirectionText(0)).toBe('북');
    expect(windDirectionText(12)).toBe('북북동');
    expect(windDirectionText(90)).toBe('동');
    expect(windDirectionText(359)).toBe('북');
  });

  it('parses current weather forecast items with precipitation priority', () => {
    const items: ForecastItem[] = [
      item('T1H', '5.5'),
      item('REH', '70'),
      item('WSD', '3.2'),
      item('VEC', '90'),
      item('SKY', '1'),
      item('PTY', '1'),
      item('RN1', '2.0'),
    ];

    const current = parseCurrentWeather(items);

    expect(current.temperature).toBe(5.5);
    expect(current.humidity).toBe(70);
    expect(current.windSpeed).toBe(3.2);
    expect(current.windDirection).toBe('동');
    expect(current.precipType).toBe('비');
    expect(current.precipitation).toBe('2.0');
  });
});

function item(category: string, value: string): ForecastItem {
  return {
    baseDate: '20260612',
    baseTime: '0900',
    category,
    fcstDate: '20260612',
    fcstTime: '1000',
    fcstValue: value,
    obsrValue: value,
    nx: 60,
    ny: 127,
  };
}
