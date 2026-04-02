// 소방시설 데이터 타입 (실제 API 연동 완료 — 타입만 export)
export interface FireFacility {
  id: string;
  type: '소화전' | '급수탑' | '저수조' | '비상소화장치';
  address: string;
  lat: number;
  lng: number;
  district: string;
  status: '정상' | '점검필요' | '고장';
}
