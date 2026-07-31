import type { FireFacility } from '../data/mockData';

/**
 * 공급기관 시설번호는 시설 유형이나 위치가 다른 행에서도 중복될 수 있다.
 * 화면 내부에서는 원본 번호를 그대로 보여주되, 행·마커 선택에는 전체 위치 정보를 사용한다.
 */
export function getFireFacilityKey(item: FireFacility): string {
  return [
    item.id,
    item.type,
    item.address,
    item.district,
    item.lat,
    item.lng,
  ].join('\u001f');
}
