export type AviationSafetyLevel = 'good' | 'caution' | 'danger';

export interface AviationSafetyResult {
  level: AviationSafetyLevel;
  label: string;
  badge: string;
  detail: string;
  colorClass: string;
  icon: string;
}

export function classifyAviationSafety(windSpeed: number | string | null | undefined): AviationSafetyResult {
  const speed = Number(windSpeed);
  const normalized = Number.isFinite(speed) ? Math.max(0, speed) : null;

  if (normalized === null) {
    return {
      level: 'caution',
      label: '확인 필요',
      badge: '기상 확인',
      detail: '풍속 데이터가 없어 현장 계측 또는 기상 화면 확인이 필요합니다.',
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      icon: 'help',
    };
  }

  if (normalized >= 10) {
    return {
      level: 'danger',
      label: '비행 위험',
      badge: '비행 자제',
      detail: '풍속 10m/s 이상입니다. 드론 정찰 또는 항공 운용 전 지휘 판단이 필요합니다.',
      colorClass: 'text-red-400 bg-red-500/10 border-red-500/30',
      icon: 'block',
    };
  }

  if (normalized >= 7) {
    return {
      level: 'caution',
      label: '주의',
      badge: '돌풍 감시',
      detail: '풍속 7m/s 이상입니다. 이륙 전 돌풍, 지형풍, 장애물을 확인하세요.',
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      icon: 'warning',
    };
  }

  return {
    level: 'good',
    label: '비행 양호',
    badge: '운용 가능',
    detail: '풍속 기준상 드론 정찰 운용이 가능합니다. 현장 장애물과 기관 지침은 별도 확인하세요.',
    colorClass: 'text-green-400 bg-green-500/10 border-green-500/30',
    icon: 'check_circle',
  };
}
