import { isTabId, type TabId } from '../types/navigation';

export type WorkspaceMode = 'routine' | 'response';

export const WORKSPACE_META: Record<WorkspaceMode, {
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}> = {
  routine: {
    label: '평시 업무',
    shortLabel: '평시',
    description: '근무 준비·조회·모니터링',
    icon: 'space_dashboard',
  },
  response: {
    label: '출동 대응',
    shortLabel: '출동',
    description: '상황판·지휘·현장 기록',
    icon: 'emergency_home',
  },
};

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

export const ROUTINE_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: 'dashboard', label: '평시 대시보드', filled: true },
  { id: 'shelter', icon: 'location_city', label: '시설 조회' },
  {
    id: 'group-readiness', icon: 'task_alt', label: '근무 준비',
    subItems: [
      { id: 'checklist', label: '장비점검' },
      { id: 'calendar', label: '일정관리' },
      { id: 'preplan', label: '대상물 정보' },
      { id: 'offline-readiness', label: '오프라인 점검' },
    ],
  },
  {
    id: 'group-monitoring', icon: 'monitor', label: '모니터링',
    subItems: [
      { id: 'weather', label: '날씨' },
      { id: 'dam-discharge', label: '댐 방류' },
      { id: 'aviation', label: '항공/드론' },
      { id: 'wildfire', label: '산불현황' },
      { id: 'er', label: '응급실 현황' },
      { id: 'news', label: '뉴스' },
    ],
  },
  {
    id: 'group-reference', icon: 'menu_book', label: '업무 참고',
    subItems: [
      { id: 'ems-protocol', label: '응급처치·약물' },
      { id: 'calculator', label: '계산기' },
      { id: 'manual', label: '대응 매뉴얼' },
      { id: 'equipment-cert', label: '장비 인증 조회' },
      { id: 'law', label: '실전 법률방어' },
      { id: 'policy', label: '법안지침' },
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

export const RESPONSE_NAV_ITEMS: NavItem[] = [
  { id: 'incident', icon: 'assignment', label: '출동 상황판', filled: true },
  {
    id: 'group-command', icon: 'campaign', label: '지휘·기록',
    subItems: [
      { id: 'field-timer', label: '현장 타이머' },
      { id: 'safety-monitor', label: '대원 안전' },
      { id: 'triage', label: '환자 분류' },
      { id: 'activity-log', label: '활동 타임라인' },
    ],
  },
  { id: 'shelter', icon: 'location_city', label: '시설 조회' },
  {
    id: 'group-field-info', icon: 'radar', label: '현장 정보',
    subItems: [
      { id: 'weather', label: '기상 정보' },
      { id: 'er', label: '응급실 현황' },
      { id: 'aviation', label: '항공/드론' },
      { id: 'calculator', label: '현장 계산기' },
    ],
  },
  {
    id: 'group-field-reference', icon: 'menu_book', label: '현장 참고',
    subItems: [
      { id: 'preplan', label: '대상물 정보' },
      { id: 'ems-protocol', label: '응급처치·약물' },
      { id: 'manual', label: '대응 매뉴얼' },
      { id: 'offline-readiness', label: '오프라인 점검' },
    ],
  },
];

export function getWorkspaceNavItems(workspace: WorkspaceMode): NavItem[] {
  return workspace === 'response' ? RESPONSE_NAV_ITEMS : ROUTINE_NAV_ITEMS;
}

export function getWorkspaceTabIds(workspace: WorkspaceMode): TabId[] {
  const unique = new Set<TabId>();
  for (const item of getWorkspaceNavItems(workspace)) {
    if (!item.subItems && isTabId(item.id)) unique.add(item.id);
    item.subItems?.forEach(sub => unique.add(sub.id));
  }
  return [...unique];
}

const ROUTINE_TABS = new Set(getWorkspaceTabIds('routine'));
const RESPONSE_TABS = new Set(getWorkspaceTabIds('response'));

export function getDefaultWorkspaceForTab(tab: TabId): WorkspaceMode | null {
  const inRoutine = ROUTINE_TABS.has(tab);
  const inResponse = RESPONSE_TABS.has(tab);
  if (inResponse && !inRoutine) return 'response';
  if (inRoutine && !inResponse) return 'routine';
  return null;
}

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

const TAB_ICONS: Partial<Record<TabId, string>> = {
  dashboard: 'dashboard',
  shelter: 'location_city',
  er: 'local_hospital',
  weather: 'partly_cloudy_day',
  'dam-discharge': 'water',
  calculator: 'calculate',
  calendar: 'calendar_month',
  emergency: 'ambulance',
  'fire-analysis': 'query_stats',
  multiuse: 'storefront',
  hazmat: 'science',
  'annual-fire': 'bar_chart',
  'fire-damage': 'monitoring',
  hazards: 'warning',
  manual: 'menu_book',
  'field-timer': 'timer',
  news: 'newspaper',
  policy: 'policy',
  wildfire: 'forest',
  law: 'gavel',
  checklist: 'checklist',
  'equipment-cert': 'verified',
  'ems-protocol': 'medical_services',
  triage: 'health_and_safety',
  'activity-log': 'history',
  preplan: 'domain',
  'safety-monitor': 'shield',
  incident: 'assignment',
  aviation: 'flight',
  'offline-readiness': 'offline_bolt',
};

const TAB_LABELS: Record<TabId, string> = {
  dashboard: '평시 대시보드',
  shelter: '시설 조회',
  er: '응급실 현황',
  weather: '날씨',
  'dam-discharge': '댐 방류',
  calculator: '계산기',
  calendar: '일정관리',
  emergency: '구급 출동 분석',
  'fire-analysis': '화재 분석',
  multiuse: '다중이용업소',
  hazmat: '위험물시설',
  'annual-fire': '연간 화재통계',
  'fire-damage': '지역별 화재피해',
  hazards: '생활위해사고',
  manual: '대응 매뉴얼',
  'field-timer': '현장 타이머',
  news: '뉴스',
  policy: '법안지침',
  wildfire: '산불현황',
  law: '실전 법률방어',
  checklist: '장비점검',
  'equipment-cert': '장비 인증 조회',
  'ems-protocol': '응급처치·약물',
  triage: '환자 분류',
  'activity-log': '활동 타임라인',
  preplan: '대상물 정보',
  'safety-monitor': '대원 안전',
  incident: '출동 상황판',
  aviation: '항공/드론',
  'offline-readiness': '오프라인 점검',
};

export function getTabIcon(tab: TabId): string {
  return TAB_ICONS[tab] ?? 'apps';
}

export function getTabLabel(tab: TabId | string): string {
  return isTabId(tab) ? TAB_LABELS[tab] : '평시 대시보드';
}
