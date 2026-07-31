import { describe, expect, it } from 'vitest';
import type { HazardItem } from '../services/consumerHazardApi';
import {
  buildConsumerHazardInsights,
  filterConsumerHazards,
  hazardAgeGroup,
  hazardItemLabel,
} from './consumerHazardInsights';

function item(overrides: Partial<HazardItem>): HazardItem {
  return {
    id: '1',
    receiveDay: '2026-03-26',
    occurrenceDate: '2026-03-20',
    treatmentPeriod: '',
    age: '70',
    gender: '여자',
    itemMajor: '시설 및 서비스',
    itemMiddle: '욕실',
    itemMinor: '욕조',
    injuryReason: '미끄러짐·넘어짐',
    injuryPart: '머리',
    injurySymptoms: '타박상',
    occurrencePlace: '주택',
    ...overrides,
  };
}

describe('consumer hazard insights', () => {
  const rows = [
    item({ id: '1' }),
    item({ id: '2', age: '5', itemMinor: '전기포트', injuryReason: '고온물질', injurySymptoms: '화상' }),
    item({ id: '3', age: '미상', itemMinor: '-', itemMiddle: '욕실', injuryPart: '해당없음' }),
  ];

  it('classifies operational age groups and chooses the most specific item label', () => {
    expect(hazardAgeGroup(rows[0])).toBe('고령자(65세 이상)');
    expect(hazardAgeGroup(rows[1])).toBe('영유아(0~6세)');
    expect(hazardItemLabel(rows[2])).toBe('욕실');
  });

  it('filters by preset and multi-term field search', () => {
    expect(filterConsumerHazards(rows, '', 'senior')).toHaveLength(1);
    expect(filterConsumerHazards(rows, '전기포트 화상', 'all')).toEqual([rows[1]]);
    expect(filterConsumerHazards(rows, '', 'fall')).toHaveLength(2);
  });

  it('builds ranked facts without counting missing values as evidence', () => {
    const insights = buildConsumerHazardInsights(rows);
    expect(insights.topPlaces[0]).toMatchObject({ name: '주택', count: 3, ratio: 1 });
    expect(insights.topParts).toEqual([{ name: '머리', count: 2, ratio: 2 / 3 }]);
    expect(insights.topItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '욕조', count: 1 }),
    ]));
  });
});
