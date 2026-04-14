import { apiFetch } from './apiClient';
import { CITY_TO_SIDO } from './erApi';

export interface PrivateAmbulance {
  dutyName: string;   // 기관/업체명
  dutyAddr: string;   // 주소
  onrNam: string;     // 소유자/대표자
  onrTel: string;     // 전화번호
  carSeq: string;     // 차량번호
  carMafYea: string;  // 차량연식
}

const CACHE_TTL = 1000 * 60 * 60 * 24; // 1일 캐시

export async function fetchPrivateAmbulances(city: string, forceRefresh = false): Promise<PrivateAmbulance[]> {
  const cacheKey = `privateAmbulances_${city}`;
  try {
    if (!forceRefresh) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) return data;
      }
    }

    const sidoName = CITY_TO_SIDO[city] || '서울특별시';
    
    // Cloudflare Worker 프록시 통신
    const response = await apiFetch<{xml: string}>('/api/ambulance', { Q0: sidoName });
    const xmlText = response.xml;
    
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const itemsNodes = xmlDoc.getElementsByTagName('item');
    
    const items: PrivateAmbulance[] = [];
    for (let i = 0; i < itemsNodes.length; i++) {
      const el = itemsNodes[i];
      items.push({
        dutyName: el.getElementsByTagName('dutyName')[0]?.textContent || '',
        dutyAddr: el.getElementsByTagName('dutyAddr')[0]?.textContent || '',
        onrNam: el.getElementsByTagName('onrNam')[0]?.textContent || '',
        onrTel: el.getElementsByTagName('onrTel')[0]?.textContent || '연락처 없음',
        carSeq: el.getElementsByTagName('carSeq')[0]?.textContent || '',
        carMafYea: el.getElementsByTagName('carMafYea')[0]?.textContent || '',
      });
    }

    // 통신사나 개인번호를 제외하기는 어렵지만 빈 번호는 필터링
    const validItems = items.filter(it => it.dutyName && it.onrTel !== '연락처 없음');

    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: validItems }));
    return validItems;
  } catch (err) {
    console.error('Private Ambulance Fetch Error:', err);
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached).data;
    return [];
  }
}
