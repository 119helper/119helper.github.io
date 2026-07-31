import type { IncidentSelections, IncidentType } from '../services/incidentSession';
import type { NavigateTarget } from '../types/navigation';

export type IncidentNextActionId =
  | 'building'
  | 'fire-water'
  | 'road'
  | 'hospital'
  | 'triage'
  | 'ems-protocol'
  | 'hazards'
  | 'hazmat'
  | 'wildfire'
  | 'activity-log';

export type IncidentBriefingCardId = 'road' | 'fireWater' | 'hospital';

export type IncidentNextActionTarget =
  | { kind: 'tab'; tab: NavigateTarget; subId?: string }
  | { kind: 'briefing'; card: IncidentBriefingCardId };

export interface IncidentNextAction {
  id: IncidentNextActionId;
  title: string;
  description: string;
  icon: string;
  activityLabel: string;
  target: IncidentNextActionTarget;
  completed: boolean;
}

export interface IncidentNextActionContext {
  type: IncidentType;
  title: string;
  note: string;
  activityLabels: readonly string[];
  selections?: IncidentSelections;
  hasTriagePatients?: boolean;
}

interface ActionDefinition extends Omit<IncidentNextAction, 'completed'> {
  reviewSignals: readonly string[];
  selection?: keyof IncidentSelections;
  recorded?: 'triage';
}

const ACTIONS: Record<IncidentNextActionId, ActionDefinition> = {
  building: {
    id: 'building',
    title: '건축물 정보 확인',
    description: '구조·층수·용도와 현장 주소를 확인합니다.',
    icon: 'apartment',
    activityLabel: '건축물 열람',
    target: { kind: 'tab', tab: 'building' },
    reviewSignals: ['건축물 열람'],
  },
  'fire-water': {
    id: 'fire-water',
    title: '소방용수 후보 확인',
    description: '가까운 등록시설과 점검상태를 확인합니다.',
    icon: 'fire_hydrant',
    activityLabel: '소방용수 열람',
    target: { kind: 'briefing', card: 'fireWater' },
    reviewSignals: ['소방용수 열람', '소방용수 후보 지정'],
    selection: 'fireWater',
  },
  road: {
    id: 'road',
    title: '진입로 상태 확인',
    description: '현장 5km의 등록 재난·통제 여부를 확인합니다.',
    icon: 'route',
    activityLabel: '진입로 확인',
    target: { kind: 'briefing', card: 'road' },
    reviewSignals: ['진입로 확인', '진입 주의 후보 지정'],
    selection: 'road',
  },
  hospital: {
    id: 'hospital',
    title: '이송 후보 확인',
    description: '거리·가용병상을 보고 전화 확인 후보를 정합니다.',
    icon: 'ambulance',
    activityLabel: '응급실 열람',
    target: { kind: 'briefing', card: 'hospital' },
    reviewSignals: ['응급실 열람', '이송 전화확인 후보 지정'],
    selection: 'hospital',
  },
  triage: {
    id: 'triage',
    title: '환자 상태 정리',
    description: '환자보드에서 분류와 인원 상태를 정리합니다.',
    icon: 'groups',
    activityLabel: '환자보드 열람',
    target: { kind: 'tab', tab: 'triage' },
    reviewSignals: ['환자보드 열람'],
    recorded: 'triage',
  },
  'ems-protocol': {
    id: 'ems-protocol',
    title: '구급 참고지침 확인',
    description: '표준지침 참고 범위와 의료지도 우선 원칙을 확인합니다.',
    icon: 'medical_services',
    activityLabel: '구급지침 열람',
    target: { kind: 'tab', tab: 'ems-protocol' },
    reviewSignals: ['구급지침 열람'],
  },
  hazards: {
    id: 'hazards',
    title: '유사사고 패턴 확인',
    description: '사건 맥락으로 좁힌 과거 접수 사례를 확인합니다.',
    icon: 'health_and_safety',
    activityLabel: '유사사고 열람',
    target: { kind: 'tab', tab: 'hazards' },
    reviewSignals: ['유사사고 열람'],
  },
  hazmat: {
    id: 'hazmat',
    title: '유해화학 참고 확인',
    description: '물질·이격 참고값을 보고 최신 ERG·기관 SOP와 대조합니다.',
    icon: 'science',
    activityLabel: '유해화학 열람',
    target: { kind: 'tab', tab: 'calculator', subId: 'hazmat_calc' },
    reviewSignals: ['유해화학 열람'],
  },
  wildfire: {
    id: 'wildfire',
    title: '산불 현황 확인',
    description: '산불 발생정보와 지역 위험도를 확인합니다.',
    icon: 'forest',
    activityLabel: '산불현황 열람',
    target: { kind: 'tab', tab: 'wildfire' },
    reviewSignals: ['산불현황 열람'],
  },
  'activity-log': {
    id: 'activity-log',
    title: '활동 기록 확인',
    description: '자동 기록된 시각과 현장 메모를 점검합니다.',
    icon: 'checklist',
    activityLabel: '활동기록 열람',
    target: { kind: 'tab', tab: 'activity-log' },
    reviewSignals: ['활동기록 열람'],
  },
};

const BASE_ORDER: Record<IncidentType, readonly IncidentNextActionId[]> = {
  fire: ['building', 'fire-water', 'road', 'hazards'],
  ems: ['triage', 'hospital', 'ems-protocol', 'road'],
  rescue: ['hazards', 'building', 'road', 'triage'],
  support: ['road', 'building', 'fire-water', 'activity-log'],
};

const HAZMAT_PATTERN = /가스|화학|유해물질|위험물|누출|폭발물|일산화탄소/;
const WILDFIRE_PATTERN = /산불|임야|야산|산림/;
const TRIAGE_PATTERN = /다수사상|다수 환자|환자 다수|부상자|의식|호흡|심정지/;
const SIMILAR_CASE_PATTERN = /낙상|추락|넘어짐|미끄러짐|끼임|절단|화상|중독|어린이|영유아|고령자|노인|승강기|엘리베이터/;

function orderedIds(context: IncidentNextActionContext): IncidentNextActionId[] {
  const source = `${context.title} ${context.note}`;
  const priority: IncidentNextActionId[] = [];
  if (HAZMAT_PATTERN.test(source)) priority.push('hazmat');
  if (WILDFIRE_PATTERN.test(source)) priority.push('wildfire');
  if (context.type === 'ems' || TRIAGE_PATTERN.test(source)) priority.push('triage');
  if (context.type !== 'fire' && SIMILAR_CASE_PATTERN.test(source)) priority.push('hazards');

  return [...new Set([...priority, ...BASE_ORDER[context.type]])];
}

function isCompleted(definition: ActionDefinition, context: IncidentNextActionContext): boolean {
  if (definition.selection && context.selections?.[definition.selection]) return true;
  if (definition.recorded === 'triage' && context.hasTriagePatients) return true;
  return context.activityLabels.some(label => (
    definition.reviewSignals.some(signal => label.includes(signal))
  ));
}

export function buildIncidentNextActions(
  context: IncidentNextActionContext,
): IncidentNextAction[] {
  return orderedIds(context).map(id => {
    const definition = ACTIONS[id];
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      icon: definition.icon,
      activityLabel: definition.activityLabel,
      target: definition.target,
      completed: isCompleted(definition, context),
    };
  });
}

export function currentIncidentNextActions(
  actions: readonly IncidentNextAction[],
  limit = 3,
): IncidentNextAction[] {
  return actions.filter(action => !action.completed).slice(0, Math.max(0, limit));
}
