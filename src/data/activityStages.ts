// 현장활동 단계 프리셋. 화재/구급 출동 유형별 표준 단계.

export interface ActivityStage {
  id: string;
  label: string;
  icon: string;
}

export interface ActivityPreset {
  id: 'fire' | 'ems' | 'rescue';
  label: string;
  stages: ActivityStage[];
}

export const ACTIVITY_PRESETS: ActivityPreset[] = [
  {
    id: 'fire',
    label: '화재',
    stages: [
      { id: 'dispatch', label: '출동', icon: 'local_fire_department' },
      { id: 'arrival', label: '현장도착', icon: 'pin_drop' },
      { id: 'water-on', label: '방수개시', icon: 'water_drop' },
      { id: 'search', label: '인명검색', icon: 'search' },
      { id: 'knockdown', label: '진화완료', icon: 'check_circle' },
      { id: 'return', label: '귀소', icon: 'home' },
    ],
  },
  {
    id: 'ems',
    label: '구급',
    stages: [
      { id: 'dispatch', label: '출동', icon: 'ambulance' },
      { id: 'arrival', label: '현장도착', icon: 'pin_drop' },
      { id: 'contact', label: '환자접촉', icon: 'personal_injury' },
      { id: 'treatment', label: '처치시작', icon: 'medical_services' },
      { id: 'transport', label: '이송개시', icon: 'directions_car' },
      { id: 'hospital', label: '병원도착', icon: 'local_hospital' },
      { id: 'return', label: '귀소', icon: 'home' },
    ],
  },
  {
    id: 'rescue',
    label: '구조',
    stages: [
      { id: 'dispatch', label: '출동', icon: 'emergency' },
      { id: 'arrival', label: '현장도착', icon: 'pin_drop' },
      { id: 'access', label: '구조개시', icon: 'construction' },
      { id: 'extricate', label: '구조완료', icon: 'volunteer_activism' },
      { id: 'transfer', label: '인계', icon: 'handshake' },
      { id: 'return', label: '귀소', icon: 'home' },
    ],
  },
];
