// 대상물 사전대응(Pre-plan) 정보 모델. 개인 기기 저장(텍스트=localStorage, 사진=IndexedDB).

export interface PrePlanContact {
  role: string;  // 관계인 구분 (관리소장, 방화관리자 등)
  name: string;
  phone: string;
}

export interface PrePlan {
  id: string;
  name: string;          // 대상물명
  address: string;
  hazards: string[];     // 위험요소 (위험물, 가스, 전기 등)
  contacts: PrePlanContact[];
  facilities: string[];  // 소방시설/주의 위치 (수신기, 방화셔터 등)
  accessNotes: string;   // 진입로/주의사항
  photoKeys: string[];   // IndexedDB 사진 키
  updatedAt: number;
}

export function createEmptyPrePlan(): PrePlan {
  return {
    id: Date.now().toString(),
    name: '',
    address: '',
    hazards: [],
    contacts: [],
    facilities: [],
    accessNotes: '',
    photoKeys: [],
    updatedAt: Date.now(),
  };
}
