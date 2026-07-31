import { describe, expect, it } from 'vitest';
import { buildIncidentHazardSuggestion, type IncidentHazardContext } from './incidentHazardSearch';

function context(overrides: Partial<IncidentHazardContext>): IncidentHazardContext {
  return {
    incidentId: 'incident-1',
    type: 'rescue',
    title: '',
    address: '서울특별시 중구 세종대로 110',
    note: '',
    ...overrides,
  };
}

describe('incident hazard search suggestion', () => {
  it('turns a concrete incident title into a narrow query and mechanism preset', () => {
    expect(buildIncidentHazardSuggestion(context({
      title: '아파트 욕실 고령자 낙상 구조',
    }))).toEqual({
      incidentId: 'incident-1',
      query: '아파트 욕실',
      preset: 'fall',
      labels: ['낙상·추락', '아파트', '욕실'],
    });
  });

  it('uses a fire-type fallback without putting generic dispatch words in the query', () => {
    expect(buildIncidentHazardSuggestion(context({
      type: 'fire',
      title: '상가 화재 출동',
    }))).toMatchObject({ query: '상가', preset: 'burn', labels: ['화상·고온', '상가'] });
  });

  it('does not invent a filter for a generic non-fire dispatch', () => {
    expect(buildIncidentHazardSuggestion(context({ title: '구조 출동' }))).toBeNull();
  });
});
