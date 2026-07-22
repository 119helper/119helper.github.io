import type { TabId } from '../types/navigation';

export interface NavSubItem {
  id: TabId;
  label: string;
}

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  filled?: boolean;
  subItems?: NavSubItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: 'dashboard', label: '대시보드', filled: true },
  { id: 'shelter', icon: 'location_city', label: '시설 조회' },
  {
    id: 'group-ems', icon: 'medical_services', label: '구급/EMS',
    subItems: [
      { id: 'ems-protocol', label: '응급처치·약물' },
      { id: 'triage', label: '중증도 분류' },
      { id: 'activity-log', label: '활동 타임라인' },
    ],
  },
  {
    id: 'group-monitoring', icon: 'monitor', label: '모니터링',
    subItems: [
      { id: 'weather', label: '날씨' },
      { id: 'aviation', label: '항공/드론' },
      { id: 'wildfire', label: '산불현황' },
      { id: 'er', label: '응급실 현황' },
      { id: 'news', label: '뉴스' },
    ],
  },
  {
    id: 'group-tools', icon: 'build', label: '현장도구',
    subItems: [
      { id: 'incident', label: '출동 상황판' },
      { id: 'field-timer', label: '현장 타이머' },
      { id: 'safety-monitor', label: '대원 안전' },
      { id: 'checklist', label: '장비점검' },
      { id: 'calculator', label: '계산기' },
    ],
  },
  {
    id: 'group-admin', icon: 'folder_open', label: '업무지원',
    subItems: [
      { id: 'preplan', label: '대상물 정보' },
      { id: 'manual', label: '대응 매뉴얼' },
      { id: 'law', label: '실전 법률방어' },
      { id: 'policy', label: '법안지침' },
      { id: 'offline-readiness', label: '오프라인 점검' },
      { id: 'calendar', label: '일정관리' },
    ],
  },
  {
    id: 'group-statistics', icon: 'bar_chart', label: '통계',
    subItems: [
      { id: 'annual-fire', label: '연간 화재통계' },
      { id: 'fire-analysis', label: '화재 분석' },
      { id: 'fire-damage', label: '지역별 화재피해' },
      { id: 'emergency', label: '구급 출동 분석' },
      { id: 'hazmat', label: '위험물시설' },
      { id: 'multiuse', label: '다중이용업소' },
      { id: 'hazards', label: '생활위해사고' },
    ],
  },
];

export interface BottomTab {
  id: TabId | 'more';
  icon: string;
  label: string;
}

export const BOTTOM_TABS: BottomTab[] = [
  { id: 'dashboard', icon: 'dashboard', label: '대시보드' },
  { id: 'shelter', icon: 'location_city', label: '시설' },
  { id: 'er', icon: 'local_hospital', label: '응급실' },
  { id: 'wildfire', icon: 'local_fire_department', label: '산불' },
  { id: 'more', icon: 'menu', label: '더보기' },
];

export const INCIDENT_BOTTOM_TABS: BottomTab[] = [
  { id: 'incident', icon: 'assignment', label: '상황판' },
  { id: 'field-timer', icon: 'timer', label: '타이머' },
  { id: 'shelter', icon: 'location_city', label: '시설' },
  { id: 'er', icon: 'local_hospital', label: '응급실' },
  { id: 'more', icon: 'menu', label: '더보기' },
];

export const cityNames: Record<string, string> = {
  seoul: '서울',
  busan: '부산',
  daegu: '대구',
  incheon: '인천',
  gwangju: '광주',
  daejeon: '대전',
  ulsan: '울산',
  sejong: '세종',
  jeju: '제주',
};

export function getTabLabel(tab: TabId | string): string {
  for (const item of NAV_ITEMS) {
    if (item.id === tab) return item.label;
    const sub = item.subItems?.find(s => s.id === tab);
    if (sub) return sub.label;
  }
  if (tab === 'equipment-cert') return '장비 인증 조회';
  return '대시보드';
}
