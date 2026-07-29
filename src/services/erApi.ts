// 응급의료기관 정보 조회 API — Cloudflare Worker 프록시 경유

import { fetchERBeds, fetchERList, fetchERMessages, fetchERSevereIllness, isStaleDataError, tagStale } from './apiClient';
import {
  CITY_TO_CURRENT_PROVINCE,
  GWANGJU_CURRENT_NAME,
  isFormerGwangjuAddress,
  normalizeGwangjuDisplayText,
  normalizeLiveGwangjuAddress,
} from './administrativeRegions';

// 네트워크 실패 시 StaleDataError에 실린 캐시 XML을 파싱해 반환 (신선도 태그 포함).
// 오프라인에서 "0병상"으로 오인되는 것보다 "N분 전 기준 데이터"가 안전하다.
function recoverStaleXml<T>(error: unknown, parse: (xml: string) => T[]): T[] | null {
  if (!isStaleDataError(error)) return null;
  const xml = (error.cachedData as { xml?: string } | null)?.xml;
  if (!xml) return null;
  try {
    return tagStale(parse(xml), error.cachedAt);
  } catch {
    return null;
  }
}

async function loadXmlWithStaleFallback(load: () => Promise<string>): Promise<{ xml: string; cachedAt?: number }> {
  try {
    return { xml: await load() };
  } catch (error) {
    if (!isStaleDataError(error)) throw error;
    const xml = (error.cachedData as { xml?: string } | null)?.xml;
    if (!xml) throw error;
    return { xml, cachedAt: error.cachedAt };
  }
}

export interface ERRealTimeData {
  rnum: string;
  dutyName: string;
  dutyAddr: string;
  dutyTel3: string;
  hpbdn: string;
  hpccuyn: string;
  hpcuyn: string;
  hvec: string;
  hvgc: string;
  hvoc: string;
  hvs01: string;
  hvs02: string;
  hvs37: string;
  hvs38: string;
  wgs84Lat: string;
  wgs84Lon: string;
  dutyHayn: string;
  dutyInf: string;
  hpid?: string;
  phpid: string;
  hvidate: string;
}

/**
 * 앱의 `gwangju` 선택은 기존 광주 생활권을 뜻한다. 통합 시도 API에서 받은
 * 광주·전남 전체 결과 중 기존 광주 5개 구만 남긴다.
 */
export function filterBedsForRequestedRegion(sido: string, beds: ERRealTimeData[]): ERRealTimeData[] {
  if (sido !== GWANGJU_CURRENT_NAME) return beds;
  return beds
    .filter(bed => isFormerGwangjuAddress(bed.dutyAddr || ''))
    .map(bed => ({
      ...bed,
      dutyName: normalizeGwangjuDisplayText(bed.dutyName, true),
      dutyAddr: normalizeLiveGwangjuAddress(bed.dutyAddr),
    }));
}

export interface ERListItem {
  rnum: string;
  dutyAddr: string;
  dutyDiv: string;
  dutyDivNam: string;
  dutyEmcls: string;
  dutyEmclsName: string;
  dutyEryn: string;
  dutyName: string;
  dutyTel1: string;
  dutyTel3: string;
  hpid?: string;
  phpid: string;
  wgs84Lat: string;
  wgs84Lon: string;
}

/**
 * 실시간 병상 API에는 주소가 없으므로 기관 목록의 주소를 기관 ID로 결합한다.
 * 통합 특별시 전체 병상 중 종전 광주 5개 구만 안전하게 남기기 위한 필수 단계다.
 */
export function attachFacilityInfoAndFilterBeds(
  sido: string,
  beds: ERRealTimeData[],
  facilities: ERListItem[],
): ERRealTimeData[] {
  if (sido !== GWANGJU_CURRENT_NAME) return beds;

  const facilitiesById = new Map<string, ERListItem>();
  for (const facility of facilities) {
    const id = facility.hpid || facility.phpid;
    if (id) facilitiesById.set(id, facility);
  }

  return beds.flatMap((bed) => {
    const id = bed.hpid || bed.phpid;
    const facility = id ? facilitiesById.get(id) : undefined;
    const rawDutyAddr = bed.dutyAddr || facility?.dutyAddr || '';
    if (!isFormerGwangjuAddress(rawDutyAddr)) return [];

    return [{
      ...bed,
      dutyName: normalizeGwangjuDisplayText(bed.dutyName, true),
      dutyAddr: normalizeLiveGwangjuAddress(rawDutyAddr),
      dutyTel3: bed.dutyTel3 || facility?.dutyTel3 || '',
      wgs84Lat: bed.wgs84Lat || facility?.wgs84Lat || '',
      wgs84Lon: bed.wgs84Lon || facility?.wgs84Lon || '',
    }];
  });
}

export interface ERMessage {
  hpid: string;
  dutyName: string;
  symTypCd?: string;     // 메시지 종류 (안쓰일수있음)
  symTypMain?: string;   // 메시지 내용 (안쓰일수있음)
  symOutCon?: string;    // 상세 내용 (안쓰일수있음)
  symTypMna?: string;    // 관련 분류명 (안쓰일수있음)
  symBlkMsg?: string;    // 실제 응급실 메시지 내용
  symBlkMsgTyp?: string; // 실제 응급실 메시지 타입 (응급 등)
}

export interface ERSevereIllness {
  dutyName: string;
  hpid: string;
  // 각 질환(O/X/U 등의 여부) 정보를 담게 됨 (ex: MKTY_ST, MKTY_PC, 등등)
  [key: string]: string; 
}

// XML 텍스트를 파싱하는 헬퍼
function parseXmlItems<T>(xmlText: string): T[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items = doc.querySelectorAll('item');
  const result: T[] = [];

  items.forEach(item => {
    const obj: Record<string, string> = {};
    item.childNodes.forEach(node => {
      if (node.nodeType === 1) {
        const el = node as Element;
        obj[el.tagName] = el.textContent || '';
      }
    });
    result.push(obj as unknown as T);
  });

  return result;
}

// 1. 응급실 실시간 가용병상 조회
export async function getERRealTimeBeds(sido: string = '서울특별시', gugun: string = '', forceRefresh = false): Promise<ERRealTimeData[]> {
  if (sido === GWANGJU_CURRENT_NAME) {
    try {
      const [bedsSource, facilitiesSource] = await Promise.all([
        loadXmlWithStaleFallback(() => fetchERBeds(sido, gugun, forceRefresh)),
        loadXmlWithStaleFallback(() => fetchERList(sido, gugun, forceRefresh)),
      ]);
      const beds = attachFacilityInfoAndFilterBeds(
        sido,
        parseXmlItems<ERRealTimeData>(bedsSource.xml),
        parseXmlItems<ERListItem>(facilitiesSource.xml),
      );
      const staleTimes = [bedsSource.cachedAt, facilitiesSource.cachedAt]
        .filter((value): value is number => typeof value === 'number');
      return staleTimes.length > 0 ? tagStale(beds, Math.min(...staleTimes)) : beds;
    } catch (error) {
      // 통합 시도 병상을 주소 없이 노출하면 종전 전남 기관까지 섞이므로,
      // 기관 목록 결합에 실패한 경우에는 빈 결과로 위장하지 않고 오류를 표면화한다.
      console.error('광주 응급실 관할 판별 실패:', error);
      throw error;
    }
  }

  const parseBeds = (xml: string) => parseXmlItems<ERRealTimeData>(xml);
  try {
    const xmlText = await fetchERBeds(sido, gugun, forceRefresh);
    return parseBeds(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, parseBeds);
    if (stale) return stale;
    console.error('응급실 실시간 데이터 조회 실패:', error);
    throw error;
  }
}

// 3. 응급의료기관 목록 조회
export async function getERList(sido: string = '서울특별시', gugun: string = '', forceRefresh = false): Promise<ERListItem[]> {
  const parseList = (xml: string) => {
    const items = parseXmlItems<ERListItem>(xml);
    return sido === GWANGJU_CURRENT_NAME
      ? items
        .filter(item => isFormerGwangjuAddress(item.dutyAddr || ''))
        .map(item => ({
          ...item,
          dutyName: normalizeGwangjuDisplayText(item.dutyName, true),
          dutyAddr: normalizeLiveGwangjuAddress(item.dutyAddr),
        }))
      : items;
  };
  try {
    const xmlText = await fetchERList(sido, gugun, forceRefresh);
    return parseList(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, parseList);
    if (stale) return stale;
    console.error('응급의료기관 목록 조회 실패:', error);
    throw error;
  }
}

// 4. 응급실 메시지 조회
export async function getERMessages(sido: string = '서울특별시', gugun: string = '', forceRefresh = false): Promise<ERMessage[]> {
  try {
    const xmlText = await fetchERMessages(sido, gugun, forceRefresh);
    return parseXmlItems<ERMessage>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERMessage>(xml));
    if (stale) return stale;
    console.error('응급실 메시지 조회 실패:', error);
    throw error;
  }
}

// 5. 중증질환자 수용가능정보 조회
export async function getERSevereIllness(sido: string = '서울특별시', gugun: string = '', forceRefresh = false): Promise<ERSevereIllness[]> {
  try {
    const xmlText = await fetchERSevereIllness(sido, gugun, forceRefresh);
    return parseXmlItems<ERSevereIllness>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERSevereIllness>(xml));
    if (stale) return stale;
    console.error('중증질환 수용정보 조회 실패:', error);
    throw error;
  }
}

// 도시명 → 시도 변환
export const CITY_TO_SIDO: Record<string, string> = {
  ...CITY_TO_CURRENT_PROVINCE,
};
