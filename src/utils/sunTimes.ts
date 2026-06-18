/**
 * 일출·일몰·박명 계산 (순수 함수, 외부 API 불필요)
 *
 * 위경도와 날짜만으로 태양 위치를 계산한다. 네트워크·API 키 없이 오프라인에서도
 * 동작하므로 현장 앱에 적합하다. 알고리즘은 검증된 SunCalc(NOAA 태양 방정식)의
 * 일출/일몰/남중/박명 부분을 이식한 것으로, 분 단위 정확도를 가진다.
 *
 * 반환되는 Date는 특정 "순간"(UTC 기준 instant)이므로, 표시할 때
 * timeZone: 'Asia/Seoul'로 포맷하면 KST 현지 시각이 나온다.
 */

const PI = Math.PI;
const rad = PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // 지구 자전축 기울기(황도경사)

/** 일출/일몰 기준 태양 고도각 (대기굴절 + 태양 반지름 보정 포함) */
export const SUN_ALTITUDE = {
  /** 일출·일몰: 태양 윗부분이 지평선에 걸리는 순간 */
  official: -0.833,
  /** 시민박명(상용박명): 야외활동에 충분한 밝기의 경계 */
  civil: -6,
} as const;

function toJulian(date: Date): number {
  return date.valueOf() / dayMs - 0.5 + J1970;
}
function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * dayMs);
}
function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function solarMeanAnomaly(d: number): number {
  return rad * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M: number): number {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // 근일점 황경
  return M + C + P + PI;
}
function declination(l: number): number {
  return Math.asin(Math.sin(0) * Math.cos(e) + Math.cos(0) * Math.sin(e) * Math.sin(l));
}

const J0 = 0.0009;
function approxTransit(Ht: number, lw: number, n: number): number {
  return J0 + (Ht + lw) / (2 * PI) + n;
}
function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}
function hourAngle(h: number, phi: number, d: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}

export interface SunTimes {
  /** 일출 (없으면 null — 백야/극야) */
  sunrise: Date | null;
  /** 일몰 (없으면 null) */
  sunset: Date | null;
  /** 태양 남중(정오) */
  solarNoon: Date;
  /** 시민박명 시작(여명) */
  dawn: Date | null;
  /** 시민박명 종료(땅거미) */
  dusk: Date | null;
}

function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec);
  if (Number.isNaN(w)) return NaN; // 해당 고도에 도달하지 않는 날(극지/극야)
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

/**
 * 주어진 날짜·위치의 일출/일몰/남중/박명을 계산한다.
 * @param date 기준 날짜 (해당 날짜의 어느 시각이어도 무방 — 날짜만 사용)
 * @param lat 위도(°)
 * @param lng 경도(°)
 */
export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);

  const n = Math.round(d - J0 - lw / (2 * PI));
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);

  const compute = (altitudeDeg: number): { rise: Date | null; set: Date | null } => {
    const Jset = getSetJ(altitudeDeg * rad, lw, phi, dec, n, M, L);
    if (Number.isNaN(Jset)) return { rise: null, set: null };
    const Jrise = Jnoon - (Jset - Jnoon);
    return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
  };

  const sun = compute(SUN_ALTITUDE.official);
  const twilight = compute(SUN_ALTITUDE.civil);

  return {
    sunrise: sun.rise,
    sunset: sun.set,
    solarNoon: fromJulian(Jnoon),
    dawn: twilight.rise,
    dusk: twilight.set,
  };
}

/** 낮 길이(ms). 일출 또는 일몰이 없으면 null. */
export function getDayLengthMs(times: SunTimes): number | null {
  if (!times.sunrise || !times.sunset) return null;
  return times.sunset.getTime() - times.sunrise.getTime();
}

/** ms → "13시간 28분" 형식 */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 하루 중 태양 진행률(0~1). 일출 이전은 0, 일몰 이후는 1.
 * 일출~일몰 사이를 선형 보간한다. (UI 아크/게이지용)
 */
export function getDayProgress(times: SunTimes, now: Date): number {
  if (!times.sunrise || !times.sunset) return 0;
  const start = times.sunrise.getTime();
  const end = times.sunset.getTime();
  const t = now.getTime();
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

/** 현재가 낮(일출~일몰 사이)인지 */
export function isDaytime(times: SunTimes, now: Date): boolean {
  if (!times.sunrise || !times.sunset) return false;
  return now >= times.sunrise && now < times.sunset;
}
