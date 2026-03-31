// 응급의료기관 정보 조회 API 서비스
// Endpoint: https://apis.data.go.kr/B552657/ErmctInfoInqireService
// Vite Proxy: /api/er

const ER_API_KEY = import.meta.env.VITE_ER_API_KEY;

export interface ERRealTimeData {
  rnum: string;
  dutyName: string;        // 기관명
  dutyAddr: string;        // 주소
  dutyTel3: string;        // 응급실 전화번호
  hpbdn: string;           // 병상수
  hpccuyn: string;         // 신경과 입원실
  hpcuyn: string;          // 신생아 입원실
  hvec: string;            // 응급실 가용 병상수
  hvgc: string;            // 입원실 가용 병상수
  hvoc: string;            // 수술실 가용 여부
  hvs01: string;           // CT 가용 여부
  hvs02: string;           // MRI 가용 여부
  hvs37: string;           // 외상소생술 가용
  hvs38: string;           // 외상수술 가용
  wgs84Lat: string;        // 위도
  wgs84Lon: string;        // 경도
  dutyHayn: string;        // 입원실 가용 여부
  dutyInf: string;         // 기관설명
  phpid: string;           // 기관코드
  hvidate: string;         // 실시간 정보 갱신 시각
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
  // serviceKey를 직접 URL에 넣어 인코딩 문제 방지
  let url = `https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire?serviceKey=${ER_API_KEY}&STAGE1=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
  if (gugun) url += `&STAGE2=${encodeURIComponent(gugun)}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return parseXmlItems<ERRealTimeData>(text);
  } catch (error) {
    console.error('응급실 실시간 데이터 조회 실패:', error);
    return [];
  }
}

// 3. 응급의료기관 목록 조회
export async function getERList(sido: string = '서울특별시', gugun: string = ''): Promise<ERListItem[]> {
  let url = `https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire?serviceKey=${ER_API_KEY}&Q0=${encodeURIComponent(sido)}&pageNo=1&numOfRows=50`;
  if (gugun) url += `&Q1=${encodeURIComponent(gugun)}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return parseXmlItems<ERListItem>(text);
  } catch (error) {
    console.error('응급의료기관 목록 조회 실패:', error);
    return [];
  }
}

// 4. 응급의료기관 위치정보 조회 (위경도 기반)
export async function getERByLocation(lat: number, lng: number): Promise<ERListItem[]> {
  const url = `https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytLcinfoInqire?serviceKey=${ER_API_KEY}&WGS84_LON=${lng}&WGS84_LAT=${lat}&pageNo=1&numOfRows=20`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return parseXmlItems<ERListItem>(text);
  } catch (error) {
    console.error('응급의료기관 위치 조회 실패:', error);
    return [];
  }
}

// 도시명 → 시도 변환 (글로벌 위치와 연동용)
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
