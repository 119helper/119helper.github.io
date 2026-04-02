/**
 * 한국 법정 공휴일 데이터
 * API 장애/키 만료 시 fallback으로 사용
 */

interface StaticHoliday {
  month: number;
  day: number;
  name: string;
}

// 고정 공휴일 (매년 동일)
const FIXED_HOLIDAYS: StaticHoliday[] = [
  { month: 1, day: 1, name: '신정' },
  { month: 3, day: 1, name: '삼일절' },
  { month: 5, day: 5, name: '어린이날' },
  { month: 6, day: 6, name: '현충일' },
  { month: 8, day: 15, name: '광복절' },
  { month: 10, day: 3, name: '개천절' },
  { month: 10, day: 9, name: '한글날' },
  { month: 12, day: 25, name: '성탄절' },
];

// 음력 기반 공휴일 (연도별로 다름 — 2025~2027)
const LUNAR_HOLIDAYS: Record<number, StaticHoliday[]> = {
  2025: [
    { month: 1, day: 28, name: '설날 전날' },
    { month: 1, day: 29, name: '설날' },
    { month: 1, day: 30, name: '설날 다음날' },
    { month: 5, day: 5, name: '부처님 오신날' }, // 어린이날과 겹침
    { month: 10, day: 5, name: '추석 전날' },
    { month: 10, day: 6, name: '추석' },
    { month: 10, day: 7, name: '추석 다음날' },
    { month: 10, day: 8, name: '추석 대체공휴일' },
  ],
  2026: [
    { month: 2, day: 16, name: '설날 전날' },
    { month: 2, day: 17, name: '설날' },
    { month: 2, day: 18, name: '설날 다음날' },
    { month: 5, day: 24, name: '부처님 오신날' },
    { month: 9, day: 24, name: '추석 전날' },
    { month: 9, day: 25, name: '추석' },
    { month: 9, day: 26, name: '추석 다음날' },
  ],
  2027: [
    { month: 2, day: 5, name: '설날 전날' },
    { month: 2, day: 6, name: '설날' },
    { month: 2, day: 7, name: '설날 다음날' },
    { month: 2, day: 8, name: '설날 대체공휴일' },
    { month: 5, day: 13, name: '부처님 오신날' },
    { month: 10, day: 14, name: '추석 전날' },
    { month: 10, day: 15, name: '추석' },
    { month: 10, day: 16, name: '추석 다음날' },
  ],
};

/**
 * 특정 연/월의 공휴일 Map (YYYY-MM-DD → 이름 배열)을 반환
 */
export function getStaticHolidays(year: number, month: number): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const pad = (n: number) => String(n).padStart(2, '0');

  // 고정 공휴일
  for (const h of FIXED_HOLIDAYS) {
    if (h.month === month) {
      const key = `${year}-${pad(month)}-${pad(h.day)}`;
      const existing = map.get(key) || [];
      existing.push(h.name);
      map.set(key, existing);
    }
  }

  // 음력 공휴일
  const lunar = LUNAR_HOLIDAYS[year] || [];
  for (const h of lunar) {
    if (h.month === month) {
      const key = `${year}-${pad(month)}-${pad(h.day)}`;
      const existing = map.get(key) || [];
      // 중복 체크 (예: 어린이날 + 부처님 오신날)
      if (!existing.includes(h.name)) {
        existing.push(h.name);
      }
      map.set(key, existing);
    }
  }

  return map;
}
