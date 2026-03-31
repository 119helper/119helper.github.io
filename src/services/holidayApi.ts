// 한국천문연구원 특일 정보 API
// Endpoint: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService
// Vite Proxy: /api/holiday

const API_KEY = import.meta.env.VITE_HOLIDAY_API_KEY;

export interface HolidayItem {
  dateKind: string;      // '01': 국경일, '02': 기념일, '03': 24절기, '04': 잡절
  dateName: string;      // 명칭 (예: 설날, 추석, 크리스마스)
  isHoliday: 'Y' | 'N'; // 공휴일 여부
  locdate: number;       // 날짜 (YYYYMMDD 숫자)
  seq: number;           // 순번
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
  const monthStr = String(month).padStart(2, '0');
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${API_KEY}&solYear=${year}&solMonth=${monthStr}&numOfRows=30`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return parseXmlItems(text);
  } catch (e) {
    console.error('공휴일 조회 실패:', e);
    return [];
  }
}

// 기념일 조회 (해당 연/월) — 비공휴일 기념일
export async function getAnniversaries(year: number, month: number): Promise<HolidayItem[]> {
  const monthStr = String(month).padStart(2, '0');
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getAnniversaryInfo?serviceKey=${API_KEY}&solYear=${year}&solMonth=${monthStr}&numOfRows=30`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return parseXmlItems(text);
  } catch (e) {
    console.error('기념일 조회 실패:', e);
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
