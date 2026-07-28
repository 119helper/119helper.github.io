import { describe, expect, it } from 'vitest';
import { filterWeatherAlertsByCity, parseKmaWarningStatus } from './weatherAlerts';

const SAMPLE = `#기준시각:202607281537
#START7777
L1140000, 대구광역시, L1140100, 대구중부, 202607281310, 202607281310, 폭염, 경보, 변경,  ,=
L1110000, 서울특별시, L1010100, 서울동북권, 202607281000, 202607281100, 폭염, 주의, 발표,  ,=
L1091300, 제주시(산지 제외), L1091330, 제주시동부, 202607281000, 202607281100, 폭염, 중대경보, 변경,  ,=
#7777END`;

describe('KMA official warning status parser', () => {
  it('parses the current warning rows and sorts by severity', () => {
    const result = parseKmaWarningStatus(SAMPLE);

    expect(result.observedAt).toBe('2026-07-28T15:37:00+09:00');
    expect(result.alerts).toHaveLength(3);
    expect(result.alerts[0]).toMatchObject({
      parentRegionName: '제주시(산지 제외)',
      regionName: '제주시동부',
      warning: '폭염',
      level: '중대경보',
    });
  });

  it('matches short app city names against parent and detailed KMA regions', () => {
    const { alerts } = parseKmaWarningStatus(SAMPLE);

    expect(filterWeatherAlertsByCity(alerts, '서울')).toHaveLength(1);
    expect(filterWeatherAlertsByCity(alerts, '대구')).toHaveLength(1);
    expect(filterWeatherAlertsByCity(alerts, '제주')).toHaveLength(1);
    expect(filterWeatherAlertsByCity(alerts, '부산')).toEqual([]);
  });
});
