// 건축물대장 API — Cloudflare Worker 프록시 경유

import { fetchBuildingInfo, isStaleDataError, StaleDataError, type ApiRecord } from './apiClient';

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

type BuildingApiItem = ApiRecord & {
  bldNm?: unknown;
  strctCdNm?: unknown;
  grndFlrCnt?: unknown;
  ugrndFlrCnt?: unknown;
  mainPurpsCdNm?: unknown;
  totArea?: unknown;
  useAprDay?: unknown;
  bcRat?: unknown;
  vlRat?: unknown;
  archArea?: unknown;
  platArea?: unknown;
};

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function numberFrom(value: unknown): number | undefined {
  const normalized = text(value).trim();
  if (!normalized) return undefined;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function intFrom(value: unknown): number | undefined {
  const normalized = text(value).trim();
  if (!normalized) return undefined;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBuildingItem(items: BuildingApiItem[]): BuildingRegisterInfo | null {
  if (!items || items.length === 0) return null;

  const item = items[0];
  return {
    bldNm: text(item.bldNm),
    strctCdNm: text(item.strctCdNm),
    grndFlrCnt: intFrom(item.grndFlrCnt),
    ugrndFlrCnt: intFrom(item.ugrndFlrCnt),
    mainPurpsCdNm: text(item.mainPurpsCdNm),
    totArea: numberFrom(item.totArea),
    useAprDay: text(item.useAprDay),
    bcRat: numberFrom(item.bcRat),
    vlRat: numberFrom(item.vlRat),
    archArea: numberFrom(item.archArea),
    platArea: numberFrom(item.platArea),
  };
}

export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  platGbCd: string,
  bun: string,
  ji: string,
  forceRefresh?: boolean
): Promise<BuildingRegisterInfo | null> {
  let items: BuildingApiItem[] | undefined;
  try {
    items = await fetchBuildingInfo({ sigunguCd, bjdongCd, platGbCd, bun, ji }, forceRefresh);
  } catch (e: unknown) {
    if (isStaleDataError(e)) {
      const mapped = parseBuildingItem(e.cachedData as BuildingApiItem[]);
      if (mapped) throw new StaleDataError(mapped, e.message, e.cachedAt);
    }
    console.error('건축물대장 조회 실패:', e);
    return null;
  }
  
  return parseBuildingItem(items);
}
