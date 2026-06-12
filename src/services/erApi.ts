// 응급의료기관 정보 조회 API — Cloudflare Worker 프록시 경유

import { fetchERBeds, fetchERList, fetchERMessages, fetchERSevereIllness, isStaleDataError, tagStale } from './apiClient';

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
  phpid: string;
  hvidate: string;
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
  phpid: string;
  wgs84Lat: string;
  wgs84Lon: string;
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
export async function getERRealTimeBeds(sido: string = '서울특별시', gugun: string = ''): Promise<ERRealTimeData[]> {
  try {
    const xmlText = await fetchERBeds(sido, gugun);
    return parseXmlItems<ERRealTimeData>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERRealTimeData>(xml));
    if (stale) return stale;
    console.error('응급실 실시간 데이터 조회 실패:', error);
    return [];
  }
}

// 3. 응급의료기관 목록 조회
export async function getERList(sido: string = '서울특별시', gugun: string = ''): Promise<ERListItem[]> {
  try {
    const xmlText = await fetchERList(sido, gugun);
    return parseXmlItems<ERListItem>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERListItem>(xml));
    if (stale) return stale;
    console.error('응급의료기관 목록 조회 실패:', error);
    return [];
  }
}

// 4. 응급실 메시지 조회
export async function getERMessages(sido: string = '서울특별시', gugun: string = ''): Promise<ERMessage[]> {
  try {
    const xmlText = await fetchERMessages(sido, gugun);
    return parseXmlItems<ERMessage>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERMessage>(xml));
    if (stale) return stale;
    console.error('응급실 메시지 조회 실패:', error);
    return [];
  }
}

// 5. 중증질환자 수용가능정보 조회
export async function getERSevereIllness(sido: string = '서울특별시', gugun: string = ''): Promise<ERSevereIllness[]> {
  try {
    const xmlText = await fetchERSevereIllness(sido, gugun);
    return parseXmlItems<ERSevereIllness>(xmlText);
  } catch (error) {
    const stale = recoverStaleXml(error, (xml) => parseXmlItems<ERSevereIllness>(xml));
    if (stale) return stale;
    console.error('중증질환 수용정보 조회 실패:', error);
    return [];
  }
}

// 도시명 → 시도 변환
export const CITY_TO_SIDO: Record<string, string> = {
  seoul: '서울특별시',
  busan: '부산광역시',
  daegu: '대구광역시',
  incheon: '인천광역시',
  gwangju: '광주광역시',
  daejeon: '대전광역시',
  ulsan: '울산광역시',
  sejong: '세종특별자치시',
  jeju: '제주특별자치도',
};
