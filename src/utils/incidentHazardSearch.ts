import type { IncidentType } from '../services/incidentSession';
import type { HazardItem } from '../services/consumerHazardApi';
import { filterConsumerHazards, type HazardPreset } from './consumerHazardInsights';

export interface IncidentHazardContext {
  incidentId: string;
  type: IncidentType;
  title: string;
  address: string;
  note: string;
}

export interface IncidentHazardSuggestion {
  incidentId: string;
  query: string;
  preset: HazardPreset;
  labels: string[];
}

const PRESET_RULES: { preset: Exclude<HazardPreset, 'all'>; label: string; pattern: RegExp }[] = [
  { preset: 'fall', label: '낙상·추락', pattern: /낙상|추락|넘어짐|미끄러짐|떨어짐/ },
  { preset: 'burn', label: '화상·고온', pattern: /화재|화상|열탕|고온|과열|뜨거운|불꽃/ },
  { preset: 'poison', label: '중독·흡입', pattern: /중독|흡입|질식|가스|약물|화학물질/ },
  { preset: 'cut-crush', label: '베임·끼임', pattern: /베임|끼임|절단|찔림|눌림|날카로운/ },
  { preset: 'child', label: '어린이', pattern: /어린이|영유아|유아|아동|소아/ },
  { preset: 'senior', label: '고령자', pattern: /고령자|노인|어르신/ },
];

const STOP_WORDS = new Set([
  '화재', '화상', '낙상', '추락', '넘어짐', '미끄러짐', '중독', '흡입', '질식', '가스',
  '베임', '끼임', '절단', '찔림', '구조', '구급', '지원', '출동', '신고', '사고', '현장',
  '환자', '요청', '발생', '관련', '응급', '긴급', '부상', '이송', '처리', '확인', '미상',
  '어린이', '영유아', '유아', '아동', '소아', '고령자', '노인', '어르신',
]);

function normalizeToken(value: string): string {
  return value
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .replace(/(?:에서|으로|에게|관련|사고|환자|현장)$/g, '')
    .trim();
}

function extractConcreteTerms(value: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  value.split(/\s+/).forEach(raw => {
    const token = normalizeToken(raw);
    if (token.length < 2 || STOP_WORDS.has(token) || /^\d+$/.test(token) || seen.has(token)) return;
    seen.add(token);
    terms.push(token);
  });

  return terms.slice(0, 3);
}

export function buildIncidentHazardSuggestion(
  context: IncidentHazardContext | null | undefined,
): IncidentHazardSuggestion | null {
  if (!context?.incidentId) return null;
  const source = `${context.title} ${context.note}`.trim();
  const matchedRule = PRESET_RULES.find(rule => rule.pattern.test(source));
  const preset = matchedRule?.preset ?? (context.type === 'fire' ? 'burn' : 'all');
  const titleTerms = extractConcreteTerms(context.title);
  const queryTerms = titleTerms.length > 0 ? titleTerms : extractConcreteTerms(context.note);

  if (preset === 'all' && queryTerms.length === 0) return null;

  const labels = [
    ...(matchedRule ? [matchedRule.label] : context.type === 'fire' ? ['화상·고온'] : []),
    ...queryTerms,
  ];

  return {
    incidentId: context.incidentId,
    query: queryTerms.join(' '),
    preset,
    labels: [...new Set(labels)].slice(0, 4),
  };
}

function reducedQueries(query: string): string[][] {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
  const groups: string[][] = [];

  for (let size = terms.length - 1; size >= 1; size -= 1) {
    const candidates: string[] = [];
    const visit = (start: number, selected: string[]) => {
      if (selected.length === size) {
        candidates.push(selected.join(' '));
        return;
      }
      for (let index = start; index < terms.length; index += 1) {
        visit(index + 1, [...selected, terms[index]]);
      }
    };
    visit(0, []);
    groups.push(candidates);
  }

  return groups;
}

/** 표본에 정확한 조합이 없으면 사고 유형은 유지한 채 가장 가까운 검색 범위로 넓힌다. */
export function resolveIncidentHazardSuggestion(
  suggestion: IncidentHazardSuggestion | null,
  items: HazardItem[],
): IncidentHazardSuggestion | null {
  if (!suggestion || items.length === 0 || !suggestion.query) return suggestion;
  if (filterConsumerHazards(items, suggestion.query, suggestion.preset).length > 0) return suggestion;

  for (const candidates of reducedQueries(suggestion.query)) {
    const matches = candidates
      .map((query, order) => ({
        query,
        order,
        count: filterConsumerHazards(items, query, suggestion.preset).length,
      }))
      .filter(candidate => candidate.count > 0)
      .sort((a, b) => a.count - b.count || a.order - b.order);
    if (matches[0]) return { ...suggestion, query: matches[0].query };
  }

  if (
    suggestion.preset !== 'all'
    && filterConsumerHazards(items, '', suggestion.preset).length > 0
  ) {
    return { ...suggestion, query: '' };
  }

  return suggestion;
}
