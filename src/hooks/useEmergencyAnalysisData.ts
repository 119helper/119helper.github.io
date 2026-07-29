import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchEmergencyAvailability,
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
  activityYm: string;
  activityHour: string;
  distanceKm: string;
  occurrencePlace: string;
  symptom: string;
  patientAge: string;
  patientSex: string;
  sidoNm: string;
  fireStnNm: string;
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
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

// 원본 API를 실조회해 확인한 현재 최신 제공 월. API가 새 월을 공개하면 갱신한다.
export const LATEST_EMERGENCY_DATA_YM = '202512';

export function getRecentMonths(count: number, latestYm = LATEST_EMERGENCY_DATA_YM): string[] {
  const months: string[] = [];
  const year = Number.parseInt(latestYm.slice(0, 4), 10);
  const month = Number.parseInt(latestYm.slice(4, 6), 10);
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month - 1 - i, 1);
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

export function summarizeEmergencyActivity(items: ApiRecord[]): ActivityStats {
  return items.reduce<ActivityStats>((totals, item) => ({
    dispatchCnt: totals.dispatchCnt + countField(item, ['gutCo', 'dispatchCnt', '출동건수']),
    transferCnt: totals.transferCnt + countField(item, ['trnfCo', 'transferCnt', '이송건수']),
    transferPrsnCnt: totals.transferPrsnCnt + countField(item, ['trnfPcnt', 'transferPrsnCnt', '이송환자수']),
  }), { ...EMPTY_ACTIVITY });
}

export function aggregateEmergencyMetricRows(
  items: ApiRecord[],
  labelKeys: string[],
  fallback: string,
): Array<{ label: string } & ActivityStats> {
  const grouped = new Map<string, ActivityStats>();
  for (const item of items) {
    const label = field(item, labelKeys, fallback);
    const current = grouped.get(label) ?? { ...EMPTY_ACTIVITY };
    current.dispatchCnt += countField(item, ['gutCo', 'dispatchCnt', '출동건수']);
    current.transferCnt += countField(item, ['trnfCo', 'transferCnt', '이송건수']);
    current.transferPrsnCnt += countField(item, ['trnfPcnt', 'transferPrsnCnt', '이송환자수']);
    grouped.set(label, current);
  }
  return Array.from(grouped, ([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => b.dispatchCnt - a.dispatchCnt);
}

export function useEmergencyAnalysisData() {
  const requestSeqRef = useRef(0);
  const [latestAvailableYm, setLatestAvailableYm] = useState(LATEST_EMERGENCY_DATA_YM);
  const [availabilityCheckedAt, setAvailabilityCheckedAt] = useState<string | null>(null);
  const months = useMemo(() => getRecentMonths(24, latestAvailableYm), [latestAvailableYm]);
  const [selectedMonth, setSelectedMonth] = useState(LATEST_EMERGENCY_DATA_YM);
  const [selectedSido, setSelectedSido] = useState('서울');
  const [fireStations, setFireStations] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    fetchEmergencyAvailability()
      .then(availability => {
        if (cancelled || !availability.latestYm) return;
        const latestYm = availability.latestYm;
        setLatestAvailableYm(latestYm);
        setAvailabilityCheckedAt(availability.checkedAt);
        setSelectedMonth(current => (
          getRecentMonths(24, latestYm).includes(current)
            ? current
            : latestYm
        ));
      })
      .catch(error => console.warn('[EmergencyAnalysis] latest month discovery failed:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    const seq = ++requestSeqRef.current;
    const statsParams: Record<string, string> = { reqYm: selectedMonth };
    const infoParams: Record<string, string> = {
      reportYm: selectedMonth,
      fireStn: selectedStation,
    };
    statsParams.sido = selectedSido;
    infoParams.sido = selectedSido;

    try {
      setWarning(null);
      const results = await Promise.allSettled([
        fetchEmergencyStats('activity', statsParams, forceRefresh),
        fetchEmergencyStats('dispatch-type', statsParams, forceRefresh),
        fetchEmergencyStats('age', statsParams, forceRefresh),
        fetchEmergencyStats('location', statsParams, forceRefresh),
        fetchEmergencyInfo('vehicles', { sido: selectedSido }, forceRefresh),
        selectedStation
          ? fetchEmergencyInfo('activity', infoParams, forceRefresh)
          : Promise.resolve({ items: [], totalCount: 0 }),
        selectedStation
          ? fetchEmergencyInfo('transfer', infoParams, forceRefresh)
          : Promise.resolve({ items: [], totalCount: 0 }),
        selectedStation
          ? fetchEmergencyInfo('first-aid', infoParams, forceRefresh)
          : Promise.resolve({ items: [], totalCount: 0 }),
      ]);

      if (seq !== requestSeqRef.current) return;

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

      const allFailed = processedResults.slice(0, 5).every(r => r.status === 'rejected');
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
        setActivity(summarizeEmergencyActivity(items));
        const stations = Array.from(new Set(
          items.map(item => field(item, ['rsacGutFsttOgidNm', 'fireStnNm', '출동소방서']))
            .filter(Boolean),
        )).sort((a, b) => a.localeCompare(b, 'ko'));
        setFireStations(stations);
        setSelectedStation(current => stations.includes(current) ? current : '');
      }

      if (processedResults[1].status === 'fulfilled') {
        const items = itemsFrom(processedResults[1]);
        setDispatchTypes(aggregateEmergencyMetricRows(items, ['gutTyCdNm', 'dispatchType', '출동유형'], '기타')
          .map(item => ({ dispatchType: item.label, ...item }))
          .filter(item => item.dispatchCnt > 0));
      }

      if (processedResults[2].status === 'fulfilled') {
        const items = itemsFrom(processedResults[2]);
        setAgeGroups(aggregateEmergencyMetricRows(items, ['ageScov', 'ageGroup', '연령대'], '미상')
          .map(item => ({ ageGroup: item.label, ...item }))
          .filter(item => item.transferPrsnCnt > 0));
      }

      if (processedResults[3].status === 'fulfilled') {
        const items = itemsFrom(processedResults[3]);
        setLocations(aggregateEmergencyMetricRows(items, ['ruptOccrPlcCdNm', 'accidentPlace', '사고장소'], '기타')
          .map(item => ({ accidentPlace: item.label, ...item }))
          .filter(item => item.dispatchCnt > 0));
      }

      if (processedResults[4].status === 'fulfilled') {
        const items = itemsFrom(processedResults[4]);
        setVehicles(items.map(it => ({
          vhcleNo: field(it, ['vhclNo', 'vhcleNo', '차량호수'], '-'),
          vhcleKnd: field(it, ['vctpCdNm', 'vhcleKnd', '차량구분'], '-'),
          vhcleSttus: field(it, ['vhclStatCdNm', 'vhcleSttus', '차량상태'], '-'),
        })));
      }

      if (processedResults[5].status === 'fulfilled') {
        const items = itemsFrom(processedResults[5]);
        setActivityDetails(items.map(it => ({
          activityYm: field(it, ['gutYm', '출동년월']),
          activityHour: field(it, ['gutHh', '출동시']),
          distanceKm: field(it, ['sptMvmnDtc', '현장과의거리'], '0'),
          occurrencePlace: field(it, ['ruptOccrPlcCdNm', '구급사고발생장소'], '미상'),
          symptom: field(it, ['ruptSptmCdNm', '환자증상'], '미상'),
          patientAge: field(it, ['ptntAge', '환자연령'], '미상'),
          patientSex: field(it, ['ptntSdtSeCdNm', '환자성별'], '미상'),
          sidoNm: field(it, ['sidoHqOgidNm', 'sidoNm', '시도본부']),
          fireStnNm: field(it, ['rsacGutFsttOgidNm', 'fireStnNm', '출동소방서']),
        })));
      }

      if (processedResults[6].status === 'fulfilled') {
        const items = itemsFrom(processedResults[6]);
        setTransfers(items.map(it => ({
          occrrPlce: field(it, ['ruptOccrPlcCdNm', 'occrrPlce', '사고발생장소'], '미상'),
          occrrType: field(it, ['rlifOccrTyCdNm', 'occrrType', '발생유형'], '미상'),
          sidoNm: field(it, ['sidoHqOgidNm', 'sidoNm']),
          fireStnNm: field(it, ['rsacGutFsttOgidNm', 'fireStnNm']),
        })));
      }

      if (processedResults[7].status === 'fulfilled') {
        const items = itemsFrom(processedResults[7]);
        setFirstAids(items.map(it => ({
          ptntAge: field(it, ['ptntAge', '환자연령']),
          ptntSex: field(it, ['ptntSdtSeCdNm', 'ptntSex', '환자성별'], '미상'),
          emrgFirstaidCd: field(it, ['fstaCdNm', 'emrgFirstaidCd', '응급처치코드'], '미상'),
          sidoNm: field(it, ['sidoHqOgidNm', 'sidoNm']),
          fireStnNm: field(it, ['rsacGutFsttOgidNm', 'fireStnNm']),
        })));
      }

      setApiError(null);
    } catch (e: unknown) {
      if (seq !== requestSeqRef.current) return;
      console.error('구급 데이터 조회 오류:', e);
      setApiError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [selectedMonth, selectedSido, selectedStation]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
    };
  }, []);

  const selectMonth = useCallback((month: string) => {
    requestSeqRef.current += 1;
    setLoading(true);
    setApiError(null);
    setSelectedMonth(month);
  }, []);

  const selectSido = useCallback((sido: string) => {
    requestSeqRef.current += 1;
    setLoading(true);
    setApiError(null);
    setSelectedStation('');
    setSelectedSido(sido);
  }, []);

  const selectStation = useCallback((station: string) => {
    requestSeqRef.current += 1;
    setLoading(true);
    setApiError(null);
    setSelectedStation(station);
  }, []);

  const refresh = useCallback((forceRefresh = false) => {
    requestSeqRef.current += 1;
    setLoading(true);
    setApiError(null);
    setWarning(null);
    void fetchAll(forceRefresh);
  }, [fetchAll]);

  return {
    months,
    latestAvailableYm,
    availabilityCheckedAt,
    selectedMonth,
    selectedSido,
    fireStations,
    selectedStation,
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
    selectStation,
    refresh,
  };
}
