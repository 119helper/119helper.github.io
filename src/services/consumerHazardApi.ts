import { apiFetch } from './apiClient';

export interface HazardItem {
  id: string;
  receiveDay: string;      // 접수일자
  age: string;             // 나이
  gender: string;          // 성별
  itemMajor: string;       // 품목대분류
  itemMiddle: string;      // 품목중분류
  itemMinor: string;       // 품목소분류
  injuryReason: string;    // 위해원인
  injuryPart: string;      // 위해부위
  injurySymptoms: string;  // 위해증상
  occurrencePlace: string; // 발생장소
}

const CACHE_KEY = 'hazardData';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 1일 캐시

export async function fetchConsumerHazards(forceRefresh = false): Promise<HazardItem[]> {
  try {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) return data;
      }
    }

    // Cloudflare Worker 프록시 통신
    const json = await apiFetch<any>('/api/consumer-hazard');

    const itemsRaw = json?.response?.body?.items?.item || [];
    const items: HazardItem[] = (Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw]).map((item: any) => ({
      id: item.receptionNumber || Math.random().toString(36).substr(2, 9),
      receiveDay: item.receiveDay || '',
      age: item.age || '미상',
      gender: item.gender || '미상',
      itemMajor: item.itemMajor || '-',
      itemMiddle: item.itemMiddle || '-',
      itemMinor: item.itemMinor || '-',
      injuryReason: item.injuryReason || '-',
      injuryPart: item.injuryPart || '-',
      injurySymptoms: item.injurySymptoms || '-',
      occurrencePlace: item.occurrencePlace || '-',
    }));

    // 최신순 정렬 보장
    items.sort((a, b) => new Date(b.receiveDay).getTime() - new Date(a.receiveDay).getTime());

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: items }));
    return items;
  } catch (err) {
    console.error('Consumer Hazard Fetch Error:', err);
    // 캐시라도 있으면 반환
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached).data;
    return [];
  }
}
