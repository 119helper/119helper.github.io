// 공휴일 API — Cloudflare Worker 프록시 경유

import { fetchHolidays as fetchHolidayXml } from './apiClient';

export interface HolidayItem {
  dateKind: string;
  dateName: string;
  isHoliday: 'Y' | 'N';
  locdate: number;
  seq: number;
}

// XML 파싱 헬퍼
function parseXmlItems(xmlText: string): HolidayItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items = doc.querySelectorAll('item');
  const result: HolidayItem[] = [];

  items.forEach(item => {
    const get = (tag: string) => item.querySelector(tag)?.textContent || '';
    result.push({
      dateKind: get('dateKind'),
      dateName: get('dateName'),
      isHoliday: get('isHoliday') as 'Y' | 'N',
      locdate: parseInt(get('locdate')) || 0,
      seq: parseInt(get('seq')) || 0,
    });
  });

  return result;
}

// 공휴일 조회 (해당 연/월)
export async function getHolidays(year: number, month: number): Promise<HolidayItem[]> {
  try {
    const xmlText = await fetchHolidayXml(year, month);
    return parseXmlItems(xmlText);
  } catch (e) {
    console.error('공휴일 조회 실패:', e);
    return [];
  }
}

// 연간 공휴일 한꺼번에 조회
export async function getYearHolidays(year: number): Promise<HolidayItem[]> {
  const promises = Array.from({ length: 12 }, (_, i) => getHolidays(year, i + 1));
  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<HolidayItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

// locdate(20260101) → 'YYYY-MM-DD' 형식
export function locdateToString(locdate: number): string {
  const s = String(locdate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// 날짜 키(YYYY-MM-DD) → 공휴일 이름 매핑 생성
export function buildHolidayMap(items: HolidayItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  items.forEach(item => {
    const key = locdateToString(item.locdate);
    const existing = map.get(key) || [];
    existing.push(item.dateName);
    map.set(key, existing);
  });
  return map;
}
