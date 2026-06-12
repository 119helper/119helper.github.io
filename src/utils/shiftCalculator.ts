/**
 * 교대근무 스케줄(당비비 등)을 자동 계산하는 유틸리티입니다.
 * 원작자 표기: 이 로직은 https://github.com/seong5/dangbibi (소방, 경찰 근무패턴 계산 서비스)
 * 의 핵심 알고리즘을 참조하여 작성되었습니다.
 */

// 당비비 3조 교대 기본 패턴
export const SHIFT_CYCLE_DANGBIBI = ['당직', '첫비', '둘비'] as const;
export type ShiftType = typeof SHIFT_CYCLE_DANGBIBI[number];

export interface ShiftSetting {
  isActive: boolean;
  baseDate: string; // "YYYY-MM-DD"
  baseShift: ShiftType; 
}

const parseDateString = (dateStr: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const [y, m, d] = dateStr.split('-').map(Number);
  // UTC 자정으로 설정하여 썸머타임/시간대 문제 방지
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return date;
};

export const getShiftForDate = (targetDateStr: string, setting: ShiftSetting): ShiftType | null => {
  if (!setting.isActive || !setting.baseDate) return null;

  try {
    const targetDate = parseDateString(targetDateStr);
    const baseDate = parseDateString(setting.baseDate);
    if (!targetDate || !baseDate) return null;
    
    // 두 날짜 간의 일수 차이 계산 (UTC 기준 밀리초를 일수로 환산)
    const diffInMilliseconds = targetDate.getTime() - baseDate.getTime();
    const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
    
    // 기준일의 근무(baseShift)가 배열에서 몇 번째 인덱스인지 찾음
    const baseIndex = SHIFT_CYCLE_DANGBIBI.indexOf(setting.baseShift);
    if (baseIndex === -1) return null;

    const cycleLength = SHIFT_CYCLE_DANGBIBI.length;
    
    // 경과 일수에 기준일 인덱스를 더한 후, 주기로 나눈 나머지 구하기 (음수 방지용 보정)
    const index = ((diffInDays + baseIndex) % cycleLength + cycleLength) % cycleLength;
    
    return SHIFT_CYCLE_DANGBIBI[index];
  } catch {
    return null;
  }
};
