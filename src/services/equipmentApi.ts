import { apiFetch } from './apiClient';

// === 데이터 모델 인터페이스 ===

// 1. 소방장비 관련
export interface EquipmentCert {
  cmpyNm: string;         // 제조업체명
  ctfcnInsttNm: string;   // 인증기관
  gdsNm: string;          // 소방장비명
  feqpmCtfcnNo: string;   // 인증번호
  ctfcnYmd: string;       // 인증일자
  fctryAdr: string;       // 업체주소
}

// 2. 소화기 정비현황 관련
export interface ExtinguisherCert {
  exsrImpmCmpyNm: string;  // 업체명
  exsrImpmYmd: string;     // 정비일자
  psmrkPrfcNo: string;     // 합격표시번호
  exagQtyCn: string;       // 약제량(Kg)
  exsrImpmYrNo: string;    // 정비연도-정비번호
  exsrImpmAprvYmd: string; // 승인일자
}

// === API 요청 모델 ===

export interface EquipmentFetchResponse {
  items: EquipmentCert[];
  totalCount: number;
}

export interface ExtinguisherFetchResponse {
  items: ExtinguisherCert[];
  totalCount: number;
}

/**
 * 소방장비 인증정보 목록을 조회합니다.
 * @param fromAprv 검색 시작일 (YYYYMMDD)
 * @param toAprv 검색 종료일 (YYYYMMDD)
 * @param gdsCd 장비 코드 (선택: 23201:구조차, 24501:소방펌프, 24601:물탱크 등)
 */
export async function fetchEquipmentCerts(
  fromAprv: string,
  toAprv: string,
  gdsCd?: string,
  pageNo = '1',
  numOfRows = '100'
): Promise<EquipmentFetchResponse> {
  const params: Record<string, string> = {
    fromAprv,
    toAprv,
    pageNo,
    numOfRows,
  };
  if (gdsCd && gdsCd !== 'ALL') {
    params.gdsCd = gdsCd;
  }
  
  return apiFetch<EquipmentFetchResponse>('/api/equipment/cert', params);
}

/**
 * 소화기 정비번호 발급현황을 조회합니다.
 * @param exsrImpmYr 정비연도 (YYYY)
 * @param exsrImpmNo 정비번호
 */
export async function fetchExtinguisherCerts(
  exsrImpmYr: string,
  exsrImpmNo: string,
  pageNo = '1',
  numOfRows = '100'
): Promise<ExtinguisherFetchResponse> {
  return apiFetch<ExtinguisherFetchResponse>('/api/equipment/extinguisher', {
    exsrImpmYr,
    exsrImpmNo,
    pageNo,
    numOfRows,
  });
}
