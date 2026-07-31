import { describe, expect, it } from 'vitest';
import type { HazardItem } from '../services/consumerHazardApi';
import {
  buildIncidentHazardSuggestion,
  resolveIncidentHazardSuggestion,
  type IncidentHazardContext,
} from './incidentHazardSearch';

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

function hazard(overrides: Partial<HazardItem>): HazardItem {
  return {
    id: 'hazard-1',
    receiveDay: '2026-04-02',
    occurrenceDate: '2026-04-01',
    treatmentPeriod: '',
    age: '70',
    gender: '여성',
    itemMajor: '시설 및 서비스',
    itemMiddle: '욕실',
    itemMinor: '욕조',
    injuryReason: '미끄러짐·넘어짐',
    injuryPart: '엉덩이',
    injurySymptoms: '타박상',
    occurrencePlace: '가정 욕실',
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

  it('keeps the incident mechanism and broadens only the place terms when the exact sample is empty', () => {
    const suggestion = buildIncidentHazardSuggestion(context({
      title: '아파트 욕실 고령자 낙상 구조',
    }));

    expect(resolveIncidentHazardSuggestion(suggestion, [hazard({})])).toMatchObject({
      query: '욕실',
      preset: 'fall',
    });
  });

  it('falls back to the incident mechanism when none of the place terms exist in the sample', () => {
    const suggestion = buildIncidentHazardSuggestion(context({
      title: '아파트 승강기 낙상 구조',
    }));

    expect(resolveIncidentHazardSuggestion(suggestion, [hazard({ occurrencePlace: '도로' })])).toMatchObject({
      query: '',
      preset: 'fall',
    });
  });
});
