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
    id: 'group-monitoring', icon: 'monitor', label: '모니터링',
    subItems: [
      { id: 'weather', label: '날씨' },
      { id: 'wildfire', label: '산불현황' },
      { id: 'er', label: '응급실 현황' },
      { id: 'news', label: '뉴스' },
    ],
  },
  {
    id: 'group-tools', icon: 'build', label: '현장도구',
    subItems: [
      { id: 'field-timer', label: '현장 타이머' },
      { id: 'checklist', label: '장비점검' },
      { id: 'calculator', label: '계산기' },
    ],
  },
  {
    id: 'group-admin', icon: 'folder_open', label: '업무지원',
    subItems: [
      { id: 'manual', label: '대응 매뉴얼' },
      { id: 'law', label: '실전 법률방어' },
      { id: 'policy', label: '법안지침' },
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

export const BOTTOM_TABS: { id: TabId | 'more'; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: '대시보드' },
  { id: 'shelter', icon: 'location_city', label: '시설' },
  { id: 'er', icon: 'local_hospital', label: '응급실' },
  { id: 'wildfire', icon: 'local_fire_department', label: '산불' },
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
  return '대시보드';
}
