import { describe, expect, it } from 'vitest';
import {
  getSunTimes,
  getDayLengthMs,
  getDayProgress,
  isDaytime,
  formatDuration,
} from './sunTimes';

// 서울 대표 좌표
const SEOUL = { lat: 37.5665, lng: 126.978 };

/** Date를 KST 'HH:MM' 문자열로 (CI가 UTC여도 안전하도록 timeZone 고정) */
function kstHHMM(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 'HH:MM' → 자정 이후 분 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

describe('getSunTimes — 서울', () => {
  it('하지 무렵(2025-06-21) 일출·일몰이 천문연감 근사값과 ±10분 이내', () => {
    const t = getSunTimes(new Date('2025-06-21T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    expect(t.sunrise).not.toBeNull();
    expect(t.sunset).not.toBeNull();

    // 천문연감: 일출 ≈ 05:11, 일몰 ≈ 19:57
    expect(Math.abs(toMinutes(kstHHMM(t.sunrise!)) - toMinutes('05:11'))).toBeLessThanOrEqual(10);
    expect(Math.abs(toMinutes(kstHHMM(t.sunset!)) - toMinutes('19:57'))).toBeLessThanOrEqual(10);
  });

  it('동지 무렵(2025-12-22) 일출·일몰이 천문연감 근사값과 ±10분 이내', () => {
    const t = getSunTimes(new Date('2025-12-22T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    // 천문연감: 일출 ≈ 07:43, 일몰 ≈ 17:17
    expect(Math.abs(toMinutes(kstHHMM(t.sunrise!)) - toMinutes('07:43'))).toBeLessThanOrEqual(10);
    expect(Math.abs(toMinutes(kstHHMM(t.sunset!)) - toMinutes('17:17'))).toBeLessThanOrEqual(10);
  });

  it('일출 < 남중 < 일몰, 남중은 일출·일몰의 중앙(±2분)', () => {
    const t = getSunTimes(new Date('2025-09-15T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    expect(t.sunrise!.getTime()).toBeLessThan(t.solarNoon.getTime());
    expect(t.solarNoon.getTime()).toBeLessThan(t.sunset!.getTime());

    const mid = (t.sunrise!.getTime() + t.sunset!.getTime()) / 2;
    expect(Math.abs(mid - t.solarNoon.getTime())).toBeLessThanOrEqual(2 * 60 * 1000);
  });

  it('시민박명(여명)은 일출보다 앞서고, 땅거미는 일몰보다 뒤', () => {
    const t = getSunTimes(new Date('2025-09-15T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    expect(t.dawn!.getTime()).toBeLessThan(t.sunrise!.getTime());
    expect(t.dusk!.getTime()).toBeGreaterThan(t.sunset!.getTime());
  });

  it('여름 낮이 겨울 낮보다 길다', () => {
    const summer = getSunTimes(new Date('2025-06-21T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    const winter = getSunTimes(new Date('2025-12-22T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);
    expect(getDayLengthMs(summer)!).toBeGreaterThan(getDayLengthMs(winter)!);
  });
});

describe('getDayProgress / isDaytime', () => {
  const t = getSunTimes(new Date('2025-09-15T12:00:00+09:00'), SEOUL.lat, SEOUL.lng);

  it('일출 이전은 0·밤, 일몰 이후는 1·밤', () => {
    const beforeSunrise = new Date(t.sunrise!.getTime() - 60 * 60 * 1000);
    const afterSunset = new Date(t.sunset!.getTime() + 60 * 60 * 1000);
    expect(getDayProgress(t, beforeSunrise)).toBe(0);
    expect(getDayProgress(t, afterSunset)).toBe(1);
    expect(isDaytime(t, beforeSunrise)).toBe(false);
    expect(isDaytime(t, afterSunset)).toBe(false);
  });

  it('남중에는 진행률 ≈ 0.5·낮', () => {
    expect(getDayProgress(t, t.solarNoon)).toBeCloseTo(0.5, 1);
    expect(isDaytime(t, t.solarNoon)).toBe(true);
  });
});

describe('formatDuration', () => {
  it('시간/분을 한국어로 표기', () => {
    expect(formatDuration(13 * 3600000 + 28 * 60000)).toBe('13시간 28분');
    expect(formatDuration(9 * 3600000)).toBe('9시간');
  });
});
