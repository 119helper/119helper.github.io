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

let cachedWildfires: WildfireItem[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3분 캐시

export async function fetchWildfires(numOfRows = '200', pageNo = '1', forceRefresh = false, retryCount = 0): Promise<WildfireItem[]> {
  if (!forceRefresh && cachedWildfires && cachedWildfires.length > 0 && Date.now() - lastFetchTime < CACHE_TTL) {
    return cachedWildfires;
  }

  try {
    const data = await apiFetch<{ body: any[], totalCount?: number }>('/api/wildfire', { numOfRows, pageNo });
    if (!data || !data.body || data.body.length === 0) {
      if (retryCount < 3) {
        console.warn(`산불 데이터 빈 응답. 1초 뒤 재시도... (${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWildfires(numOfRows, pageNo, forceRefresh, retryCount + 1);
      }
      return cachedWildfires || [];
    }

    const items = data.body.map((item: any) => {
      const extinguished = item.EXTNGS_CMPTN_DT || null;
      const occurredAtStr = item.FRSTFR_GNT_DT || '';
      
      // 발생 시간 파싱 (안전한 포맷 변환)
      const occurredDate = new Date(occurredAtStr.replace(/\/?\s?/g, '').length === 14 ? 
        occurredAtStr.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6+09:00') : 
        occurredAtStr.replace(/\//g, '-'));
        
      const hoursElapsed = (!isNaN(occurredDate.getTime())) 
        ? (Date.now() - occurredDate.getTime()) / (1000 * 60 * 60) 
        : 0;

      const damageArea = item.GRS_FRSTFR_DAM_AREA ? parseFloat(item.GRS_FRSTFR_DAM_AREA) : 0;

      // [핵심 로직] 1헥타르(약 3000평) 미만의 작은 산불이 48시간을 넘겼다면 행정상 입력 누락(유령 산불)으로 간주
      // 단, 대형 산불(1ha 이상)은 실제로 며칠간 사투를 벌이는 경우일 수 있으므로 강제로 진화 처리하지 않음!
      const isGhost = !extinguished && hoursElapsed >= 48 && damageArea < 1;
      const isOngoing = !extinguished && !isGhost;

      return {
        id: item.FRSTFR_INFO_ID || Math.random().toString(),
        address: item.FRSTFR_DCLR_ADDR || '위치 미상',
        occurredAt: occurredAtStr,
        extinguishedAt: extinguished,
        isOngoing,
        damageArea,
        lat: item.FRSTFR_PSTN_YCRD ? parseFloat(item.FRSTFR_PSTN_YCRD) : undefined,
        lng: item.FRSTFR_PSTN_XCRD ? parseFloat(item.FRSTFR_PSTN_XCRD) : undefined,
      };
    }).sort((a: any, b: any) => b.occurredAt.localeCompare(a.occurredAt)); // 최신순 정렬

    cachedWildfires = items;
    lastFetchTime = Date.now();
    return items;
  } catch (err) {
    console.error('산불 데이터 조회 실패:', err);
    if (retryCount < 3) {
      console.warn(`산불 데이터 조회 재시도 중... (${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWildfires(numOfRows, pageNo, forceRefresh, retryCount + 1);
    }
    return cachedWildfires || [];
  }
}
