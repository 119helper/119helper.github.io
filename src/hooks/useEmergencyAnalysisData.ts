import { useCallback, useEffect, useState } from 'react';
import {
  fetchEmergencyInfo,
  fetchEmergencyStats,
  isStaleDataError,
  type ApiRecord,
  type PaginatedItemsResponse,
} from '../services/apiClient';

export interface ActivityStats {
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

export interface DispatchTypeItem {
  dispatchType: string;
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

export interface AgeGroupItem {
  ageGroup: string;
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

export interface LocationItem {
  accidentPlace: string;
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

export interface VehicleItem {
  vhcleNo: string;
  vhcleKnd: string;
  vhcleSttus: string;
}

export interface ActivityDetailItem {
  arriveYmd: string;
  arriveHh: string;
  arriveMm: string;
  distKm: string;
  returnYmd: string;
  returnHh: string;
  returnMm: string;
  sidoNm: string;
  fireStnNm: string;
  safeCnterNm: string;
}

export interface TransferItem {
  occrrPlce: string;
  occrrType: string;
  sidoNm: string;
  fireStnNm: string;
}

export interface FirstAidItem {
  ptntAge: string;
  ptntSex: string;
  emrgFirstaidCd: string;
  sidoNm: string;
  fireStnNm: string;
}

export type ViewMode = 'stats' | 'response-time' | 'patient' | 'search';

export const SIDO_LIST = [
  '전체', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

export function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4))}월`;
}

const EMPTY_ACTIVITY: ActivityStats = { dispatchCnt: 0, transferCnt: 0, transferPrsnCnt: 0 };
type EmergencyApiResponse = PaginatedItemsResponse<ApiRecord>;
type EmergencySettledResult = PromiseSettledResult<EmergencyApiResponse>;

function parseCount(value: unknown): number {
  return parseInt(String(value || '0'), 10);
}

function field(record: ApiRecord, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return fallback;
}

function countField(record: ApiRecord, keys: string[]): number {
  return parseCount(field(record, keys, '0'));
}

function itemsFrom(result: EmergencySettledResult): ApiRecord[] {
  return result.status === 'fulfilled' && Array.isArray(result.value?.items)
    ? result.value.items
    : [];
}

export function useEmergencyAnalysisData() {
  const months = getRecentMonths(24);
  const [selectedMonth, setSelectedMonth] = useState(months[1] || months[0]);
  const [selectedSido, setSelectedSido] = useState('전체');
  const [viewMode, setViewMode] = useState<ViewMode>('stats');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityStats>(EMPTY_ACTIVITY);
  const [dispatchTypes, setDispatchTypes] = useState<DispatchTypeItem[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroupItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);

  const [activityDetails, setActivityDetails] = useState<ActivityDetailItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [firstAids, setFirstAids] = useState<FirstAidItem[]>([]);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    const statsParams: Record<string, string> = { reqYm: selectedMonth };
    const infoParams: Record<string, string> = { reportYm: selectedMonth };
    if (selectedSido !== '전체') {
      statsParams.sido = selectedSido;
      infoParams.sido = selectedSido;
    }

    try {
      setWarning(null);
      const results = await Promise.allSettled([
        fetchEmergencyStats('activity', statsParams, forceRefresh),
        fetchEmergencyStats('dispatch-type', statsParams, forceRefresh),
        fetchEmergencyStats('age', statsParams, forceRefresh),
        fetchEmergencyStats('location', statsParams, forceRefresh),
        fetchEmergencyInfo('vehicles', selectedSido !== '전체' ? { sido: selectedSido } : {}, forceRefresh),
        fetchEmergencyInfo('activity', infoParams, forceRefresh),
        fetchEmergencyInfo('transfer', infoParams, forceRefresh),
        fetchEmergencyInfo('first-aid', infoParams, forceRefresh),
      ]);

      let hasStaleData = false;
      let staleMessage = '';

      const processedResults = results.map(r => {
        if (r.status === 'fulfilled') return r;
        if (r.status === 'rejected' && isStaleDataError(r.reason)) {
          hasStaleData = true;
          const t = r.reason.cachedAt ? new Date(r.reason.cachedAt).toLocaleTimeString() : '';
          staleMessage = `${r.reason.message}${t ? ` (마지막 성공 시각: ${t})` : ''}`;
          return { status: 'fulfilled', value: r.reason.cachedData as EmergencyApiResponse } satisfies PromiseFulfilledResult<EmergencyApiResponse>;
        }
        return r;
      });

      const allFailed = processedResults.every(r => r.status === 'rejected');
      if (allFailed) {
        const firstErr = (processedResults[0] as PromiseRejectedResult).reason;
        setApiError(firstErr?.message || '구급 API에 연결할 수 없습니다.');
        setLoading(false);
        return;
      }
      if (hasStaleData) {
        setWarning(staleMessage);
      }

      if (processedResults[0].status === 'fulfilled') {
        const items = itemsFrom(processedResults[0]);
        const totals: ActivityStats = { ...EMPTY_ACTIVITY };
        items.forEach(it => {
          totals.dispatchCnt += countField(it, ['dispatchCnt', '출동건수']);
          totals.transferCnt += countField(it, ['transferCnt', '이송건수']);
          totals.transferPrsnCnt += countField(it, ['transferPrsnCnt', '이송환자수']);
        });
        setActivity(totals);
      }

      if (processedResults[1].status === 'fulfilled') {
        const items = itemsFrom(processedResults[1]);
        setDispatchTypes(items.map(it => ({
          dispatchType: field(it, ['dispatchType', '출동유형'], '기타'),
          dispatchCnt: countField(it, ['dispatchCnt', '출동건수']),
          transferCnt: countField(it, ['transferCnt', '이송건수']),
          transferPrsnCnt: countField(it, ['transferPrsnCnt', '이송환자수']),
        })).filter((it: DispatchTypeItem) => it.dispatchCnt > 0));
      }

      if (processedResults[2].status === 'fulfilled') {
        const items = itemsFrom(processedResults[2]);
        setAgeGroups(items.map(it => ({
          ageGroup: field(it, ['ageGroup', '연령대'], '미상'),
          dispatchCnt: countField(it, ['dispatchCnt', '출동건수']),
          transferCnt: countField(it, ['transferCnt', '이송건수']),
          transferPrsnCnt: countField(it, ['transferPrsnCnt', '이송환자수']),
        })).filter((it: AgeGroupItem) => it.transferPrsnCnt > 0));
      }

      if (processedResults[3].status === 'fulfilled') {
        const items = itemsFrom(processedResults[3]);
        setLocations(items.map(it => ({
          accidentPlace: field(it, ['accidentPlace', '사고장소'], '기타'),
          dispatchCnt: countField(it, ['dispatchCnt', '출동건수']),
          transferCnt: countField(it, ['transferCnt', '이송건수']),
          transferPrsnCnt: countField(it, ['transferPrsnCnt', '이송환자수']),
        })).filter((it: LocationItem) => it.dispatchCnt > 0));
      }

      if (processedResults[4].status === 'fulfilled') {
        const items = itemsFrom(processedResults[4]);
        setVehicles(items.map(it => ({
          vhcleNo: field(it, ['vhcleNo', '차량호수'], '-'),
          vhcleKnd: field(it, ['vhcleKnd', '차량구분'], '-'),
          vhcleSttus: field(it, ['vhcleSttus', '차량상태'], '-'),
        })));
      }

      if (processedResults[5].status === 'fulfilled') {
        const items = itemsFrom(processedResults[5]);
        setActivityDetails(items.map(it => ({
          arriveYmd: field(it, ['arriveYmd', '현장도착년월']),
          arriveHh: field(it, ['arriveHh', '현장도착시']),
          arriveMm: field(it, ['arriveMm', '현장도착분']),
          distKm: field(it, ['distKm', '현장과의거리'], '0'),
          returnYmd: field(it, ['returnYmd', '귀소년월']),
          returnHh: field(it, ['returnHh', '귀소시']),
          returnMm: field(it, ['returnMm', '귀소분']),
          sidoNm: field(it, ['sidoNm', '시도본부']),
          fireStnNm: field(it, ['fireStnNm', '출동소방서']),
          safeCnterNm: field(it, ['safeCnterNm', '출동안전센터']),
        })));
      }

      if (processedResults[6].status === 'fulfilled') {
        const items = itemsFrom(processedResults[6]);
        setTransfers(items.map(it => ({
          occrrPlce: field(it, ['occrrPlce', '사고발생장소'], '미상'),
          occrrType: field(it, ['occrrType', '발생유형'], '미상'),
          sidoNm: field(it, ['sidoNm']),
          fireStnNm: field(it, ['fireStnNm']),
        })));
      }

      if (processedResults[7].status === 'fulfilled') {
        const items = itemsFrom(processedResults[7]);
        setFirstAids(items.map(it => ({
          ptntAge: field(it, ['ptntAge', '환자연령']),
          ptntSex: field(it, ['ptntSex', '환자성별'], '미상'),
          emrgFirstaidCd: field(it, ['emrgFirstaidCd', '응급처치코드'], '미상'),
          sidoNm: field(it, ['sidoNm']),
          fireStnNm: field(it, ['fireStnNm']),
        })));
      }

      setApiError(null);
    } catch (e: unknown) {
      console.error('구급 데이터 조회 오류:', e);
      setApiError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    }

    setLoading(false);
  }, [selectedMonth, selectedSido]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const selectMonth = useCallback((month: string) => {
    setLoading(true);
    setApiError(null);
    setSelectedMonth(month);
  }, []);

  const selectSido = useCallback((sido: string) => {
    setLoading(true);
    setApiError(null);
    setSelectedSido(sido);
  }, []);

  const refresh = useCallback((forceRefresh = false) => {
    setLoading(true);
    setApiError(null);
    setWarning(null);
    void fetchAll(forceRefresh);
  }, [fetchAll]);

  return {
    months,
    selectedMonth,
    selectedSido,
    viewMode,
    setViewMode,
    loading,
    apiError,
    warning,
    activity,
    dispatchTypes,
    ageGroups,
    locations,
    vehicles,
    activityDetails,
    transfers,
    firstAids,
    selectMonth,
    selectSido,
    refresh,
  };
}
