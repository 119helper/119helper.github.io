import type { HazardItem } from '../services/consumerHazardApi';

export type HazardPreset = 'all' | 'fall' | 'burn' | 'poison' | 'cut-crush' | 'child' | 'senior';

export interface HazardRank {
  name: string;
  count: number;
  ratio: number;
}

export interface ConsumerHazardInsights {
  topCauses: HazardRank[];
  topPlaces: HazardRank[];
  topParts: HazardRank[];
  topItems: HazardRank[];
  topSymptoms: HazardRank[];
  ageGroups: HazardRank[];
}

const EMPTY_VALUES = new Set(['', '-', '해당없음', '미상', '불상', '알 수 없음', '연령 미상']);

const SEARCH_VARIANTS: Record<string, string[]> = {
  아파트: ['아파트', '공동주택', '주택'],
  상가: ['상가', '상업시설', '판매시설', '음식점'],
  화장실: ['화장실', '욕실'],
  엘리베이터: ['엘리베이터', '승강기'],
  킥보드: ['킥보드', '개인형 이동장치'],
};

function clean(value: string): string {
  const normalized = value.trim();
  return EMPTY_VALUES.has(normalized) ? '' : normalized;
}

export function hazardItemLabel(item: HazardItem): string {
  return clean(item.itemMinor) || clean(item.itemMiddle) || clean(item.itemMajor) || '품목 미상';
}

export function hazardAge(item: HazardItem): number | null {
  const match = item.age.match(/\d+/);
  if (!match) return null;
  const age = Number.parseInt(match[0], 10);
  return Number.isFinite(age) && age >= 0 && age <= 120 ? age : null;
}

export function hazardAgeGroup(item: HazardItem): string {
  const age = hazardAge(item);
  if (age === null) return '연령 미상';
  if (age <= 6) return '영유아(0~6세)';
  if (age <= 12) return '어린이(7~12세)';
  if (age <= 18) return '청소년(13~18세)';
  if (age <= 39) return '청년(19~39세)';
  if (age <= 64) return '중장년(40~64세)';
  return '고령자(65세 이상)';
}

function searchableText(item: HazardItem): string {
  return [
    item.itemMajor,
    item.itemMiddle,
    item.itemMinor,
    item.injuryReason,
    item.injuryPart,
    item.injurySymptoms,
    item.occurrencePlace,
    item.age,
    item.gender,
  ].join(' ').toLocaleLowerCase('ko-KR');
}

function matchesPreset(item: HazardItem, preset: HazardPreset): boolean {
  if (preset === 'all') return true;
  const text = searchableText(item);
  const age = hazardAge(item);
  if (preset === 'child') return age !== null && age <= 12;
  if (preset === 'senior') return age !== null && age >= 65;
  if (preset === 'fall') return /미끄러|넘어|추락|낙상|떨어/.test(text);
  if (preset === 'burn') return /화상|불꽃|화재|고온|열탕|과열|뜨거/.test(text);
  if (preset === 'poison') return /중독|흡입|질식|가스|화학|약물/.test(text);
  return /베임|찔림|끼임|눌림|절단|날카/.test(text);
}

export function filterConsumerHazards(
  items: HazardItem[],
  query: string,
  preset: HazardPreset,
): HazardItem[] {
  const terms = query
    .trim()
    .toLocaleLowerCase('ko-KR')
    .split(/\s+/)
    .filter(Boolean);

  return items.filter(item => {
    if (!matchesPreset(item, preset)) return false;
    if (terms.length === 0) return true;
    const text = searchableText(item);
    return terms.every(term => (SEARCH_VARIANTS[term] ?? [term]).some(variant => text.includes(variant)));
  });
}

function rankValues(values: string[], total: number, limit = 6): HazardRank[] {
  const counts = new Map<string, number>();
  values.map(clean).filter(Boolean).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      ratio: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    .slice(0, limit);
}

export function buildConsumerHazardInsights(items: HazardItem[]): ConsumerHazardInsights {
  const total = items.length;
  return {
    topCauses: rankValues(items.map(item => item.injuryReason), total),
    topPlaces: rankValues(items.map(item => item.occurrencePlace), total),
    topParts: rankValues(items.map(item => item.injuryPart), total),
    topItems: rankValues(items.map(hazardItemLabel), total),
    topSymptoms: rankValues(items.map(item => item.injurySymptoms), total),
    ageGroups: rankValues(items.map(hazardAgeGroup), total),
  };
}
