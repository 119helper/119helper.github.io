import { apiFetch, isStaleDataError } from './apiClient';
import { CITY_TO_SIDO } from './erApi';
import { GWANGJU_CURRENT_NAME, isFormerGwangjuAddress } from './administrativeRegions';
import { z } from 'zod';

export interface PrivateAmbulance {
  dutyName: string;   // 기관/업체명
  dutyAddr: string;   // 주소
  onrNam: string;     // 소유자/대표자
  onrTel: string;     // 전화번호
  carSeq: string;     // 차량번호
  carMafYea: string;  // 차량연식
}

const CACHE_TTL = 1000 * 60 * 60 * 24; // 1일 캐시
const ambulanceResponseSchema = z.object({ xml: z.string() }).passthrough();

function parseAmbulances(xmlText: string): PrivateAmbulance[] {
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

  return items.filter(it => it.dutyName && it.onrTel !== '연락처 없음');
}

export async function fetchPrivateAmbulances(city: string, forceRefresh = false): Promise<PrivateAmbulance[]> {
  try {
    const sidoName = CITY_TO_SIDO[city] || '서울특별시';
    
    // Cloudflare Worker 프록시 통신
    const response = await apiFetch<z.infer<typeof ambulanceResponseSchema>>('/api/ambulance', { Q0: sidoName }, {
      cacheTtlMs: CACHE_TTL,
      forceRefresh,
      schema: ambulanceResponseSchema,
    });

    const items = parseAmbulances(response.xml);
    return sidoName === GWANGJU_CURRENT_NAME
      ? items.filter(item => isFormerGwangjuAddress(item.dutyAddr))
      : items;
  } catch (err) {
    if (isStaleDataError(err)) {
      const xml = (err.cachedData as { xml?: string })?.xml;
      if (xml) {
        const items = parseAmbulances(xml);
        return city === 'gwangju'
          ? items.filter(item => isFormerGwangjuAddress(item.dutyAddr))
          : items;
      }
    }
    console.error('Private Ambulance Fetch Error:', err);
    return [];
  }
}
