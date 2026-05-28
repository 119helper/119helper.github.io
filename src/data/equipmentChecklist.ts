export const CHECKLIST_SECTIONS = [
  {
    id: 'scba',
    title: '공기호흡기 (SCBA)',
    items: [
      { id: 'scba-1', label: '용기 잔압 확인 (250bar 이상)' },
      { id: 'scba-2', label: '면체 기밀 상태 확인' },
      { id: 'scba-3', label: '경보음 정상 작동 여부' },
      { id: 'scba-4', label: '스트랩 및 버클 체결 상태' },
    ]
  },
  {
    id: 'ppe',
    title: '개인보호장비 (PPE)',
    items: [
      { id: 'ppe-1', label: '특수방화복 훼손(외피/내피) 여부' },
      { id: 'ppe-2', label: '소방헬멧 랜턴 배터리 상태' },
      { id: 'ppe-3', label: '턱끈 및 조임장치 이상 유무' },
      { id: 'ppe-4', label: '안전화 파손 여부' },
      { id: 'ppe-5', label: '방화장갑/인명구조장갑 구비' },
    ]
  },
  {
    id: 'comm',
    title: '통신 및 기타 장비',
    items: [
      { id: 'comm-1', label: '무전기 배터리 및 송수신 상태' },
      { id: 'comm-2', label: '인명구조경보기(PASS) 작동 및 배터리' },
      { id: 'comm-3', label: '개인용 로프(마약, 카라비너) 결속' },
      { id: 'comm-4', label: '보조마스크 상태 정상' },
    ]
  }
];

export const EQUIPMENT_CHECKLIST_TOTAL = CHECKLIST_SECTIONS.reduce((acc, sec) => acc + sec.items.length, 0);
