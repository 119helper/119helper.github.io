// 건축물대장 API — Cloudflare Worker 프록시 경유

import { fetchBuildingInfo } from './apiClient';

export interface BuildingRegisterInfo {
  bldNm?: string;
  strctCdNm?: string;
  grndFlrCnt?: number;
  ugrndFlrCnt?: number;
  mainPurpsCdNm?: string;
  totArea?: number;
  useAprDay?: string;
  bcRat?: number;
  vlRat?: number;
  archArea?: number;
  platArea?: number;
}

export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  platGbCd: string,
  bun: string,
  ji: string
): Promise<BuildingRegisterInfo | null> {
  try {
    const items = await fetchBuildingInfo({ sigunguCd, bjdongCd, platGbCd, bun, ji }) as any[];
    if (!items || items.length === 0) return null;

    const item = items[0];
    return {
      bldNm: item.bldNm || '',
      strctCdNm: item.strctCdNm || '',
      grndFlrCnt: parseInt(item.grndFlrCnt) || 0,
      ugrndFlrCnt: parseInt(item.ugrndFlrCnt) || 0,
      mainPurpsCdNm: item.mainPurpsCdNm || '',
      totArea: parseFloat(item.totArea) || 0,
      useAprDay: item.useAprDay || '',
      bcRat: parseFloat(item.bcRat) || 0,
      vlRat: parseFloat(item.vlRat) || 0,
      archArea: parseFloat(item.archArea) || 0,
      platArea: parseFloat(item.platArea) || 0,
    };
  } catch (e) {
    console.error('건축물대장 조회 실패:', e);
    return null;
  }
}
