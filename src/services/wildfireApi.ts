import { apiFetch } from './apiClient';

export interface WildfireItem {
  id: string; // FRSTFR_INFO_ID
  address: string; // FRSTFR_DCLR_ADDR
  occurredAt: string; // FRSTFR_GNT_DT (yyyy/mm/dd hh:mm:ss)
  extinguishedAt: string | null; // EXTNGS_CMPTN_DT
  isOngoing: boolean;
  damageArea: number; // GRS_FRSTFR_DAM_AREA
  lat?: number; // FRSTFR_PSTN_YCRD
  lng?: number; // FRSTFR_PSTN_XCRD
}

export async function fetchWildfires(numOfRows = '200', pageNo = '1'): Promise<WildfireItem[]> {
  try {
    const data = await apiFetch<{ body: any[], totalCount?: number }>('/api/wildfire', { numOfRows, pageNo });
    if (!data || !data.body) return [];

    return data.body.map((item: any) => {
      const extinguished = item.EXTNGS_CMPTN_DT || null;
      return {
        id: item.FRSTFR_INFO_ID || Math.random().toString(),
        address: item.FRSTFR_DCLR_ADDR || '위치 미상',
        occurredAt: item.FRSTFR_GNT_DT || '',
        extinguishedAt: extinguished,
        isOngoing: !extinguished, // 진화완료일시가 없으면 진화중으로 판단
        damageArea: item.GRS_FRSTFR_DAM_AREA || 0,
        lat: item.FRSTFR_PSTN_YCRD ? parseFloat(item.FRSTFR_PSTN_YCRD) : undefined,
        lng: item.FRSTFR_PSTN_XCRD ? parseFloat(item.FRSTFR_PSTN_XCRD) : undefined,
      };
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); // 최신순 정렬
  } catch (err) {
    console.error('산불 데이터 조회 실패:', err);
    return [];
  }
}
