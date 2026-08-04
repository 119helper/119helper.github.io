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

/** 사용자에게 노출되는 탭 이름의 단일 기준입니다. */
export const TAB_LABELS: Record<TabId, string> = {
  dashboard: '평시 대시보드',
  shelter: '시설 조회',
  er: '응급실 현황',
  weather: '기상 정보',
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
  news: '소방 뉴스',
  policy: '법안·지침',
  wildfire: '산불 현황',
  law: '법률 방어망',
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
  { id: 'dashboard', icon: 'dashboard', label: TAB_LABELS.dashboard, filled: true },
  { id: 'shelter', icon: 'location_city', label: TAB_LABELS.shelter },
  {
    id: 'group-readiness', icon: 'task_alt', label: '근무 준비',
    subItems: [
      { id: 'checklist', label: TAB_LABELS.checklist },
      { id: 'calendar', label: TAB_LABELS.calendar },
      { id: 'preplan', label: TAB_LABELS.preplan },
      { id: 'offline-readiness', label: TAB_LABELS['offline-readiness'] },
    ],
  },
  {
    id: 'group-monitoring', icon: 'monitor', label: '모니터링',
    subItems: [
      { id: 'weather', label: TAB_LABELS.weather },
      { id: 'dam-discharge', label: TAB_LABELS['dam-discharge'] },
      { id: 'aviation', label: TAB_LABELS.aviation },
      { id: 'wildfire', label: TAB_LABELS.wildfire },
      { id: 'er', label: TAB_LABELS.er },
      { id: 'news', label: TAB_LABELS.news },
    ],
  },
  {
    id: 'group-reference', icon: 'menu_book', label: '업무 참고',
    subItems: [
      { id: 'ems-protocol', label: TAB_LABELS['ems-protocol'] },
      { id: 'calculator', label: TAB_LABELS.calculator },
      { id: 'manual', label: TAB_LABELS.manual },
      { id: 'equipment-cert', label: TAB_LABELS['equipment-cert'] },
      { id: 'law', label: TAB_LABELS.law },
      { id: 'policy', label: TAB_LABELS.policy },
    ],
  },
  {
    id: 'group-statistics', icon: 'bar_chart', label: '통계',
    subItems: [
      { id: 'annual-fire', label: TAB_LABELS['annual-fire'] },
      { id: 'fire-analysis', label: TAB_LABELS['fire-analysis'] },
      { id: 'fire-damage', label: TAB_LABELS['fire-damage'] },
      { id: 'emergency', label: TAB_LABELS.emergency },
      { id: 'hazmat', label: TAB_LABELS.hazmat },
      { id: 'multiuse', label: TAB_LABELS.multiuse },
      { id: 'hazards', label: TAB_LABELS.hazards },
    ],
  },
];

export const RESPONSE_NAV_ITEMS: NavItem[] = [
  { id: 'incident', icon: 'assignment', label: TAB_LABELS.incident, filled: true },
  {
    id: 'group-command', icon: 'campaign', label: '지휘·기록',
    subItems: [
      { id: 'field-timer', label: TAB_LABELS['field-timer'] },
      { id: 'safety-monitor', label: TAB_LABELS['safety-monitor'] },
      { id: 'triage', label: TAB_LABELS.triage },
      { id: 'activity-log', label: TAB_LABELS['activity-log'] },
    ],
  },
  { id: 'shelter', icon: 'location_city', label: TAB_LABELS.shelter },
  {
    id: 'group-field-info', icon: 'radar', label: '현장 정보',
    subItems: [
      { id: 'weather', label: TAB_LABELS.weather },
      { id: 'er', label: TAB_LABELS.er },
      { id: 'aviation', label: TAB_LABELS.aviation },
      { id: 'calculator', label: TAB_LABELS.calculator },
    ],
  },
  {
    id: 'group-field-reference', icon: 'menu_book', label: '현장 참고',
    subItems: [
      { id: 'preplan', label: TAB_LABELS.preplan },
      { id: 'ems-protocol', label: TAB_LABELS['ems-protocol'] },
      { id: 'manual', label: TAB_LABELS.manual },
      { id: 'offline-readiness', label: TAB_LABELS['offline-readiness'] },
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

export function getTabIcon(tab: TabId): string {
  return TAB_ICONS[tab] ?? 'apps';
}

export function getTabLabel(tab: TabId | string): string {
  return isTabId(tab) ? TAB_LABELS[tab] : '평시 대시보드';
}
