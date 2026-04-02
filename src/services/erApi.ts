// 응급의료기관 정보 조회 API — Cloudflare Worker 프록시 경유

import { fetchERBeds, fetchERList } from './apiClient';

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
    console.error('응급의료기관 목록 조회 실패:', error);
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
