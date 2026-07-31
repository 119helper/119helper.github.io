import { describe, expect, it } from 'vitest';
import { mapHazardPage } from './consumerHazardApi';

describe('consumer hazard API mapping', () => {
  it('preserves page coverage and the official misspelled occurrence-date field', () => {
    const page = mapHazardPage({
      response: {
        body: {
          totalCount: 26658,
          pageNo: 2,
          numOfRows: 1000,
          items: {
            item: {
              receptionNumber: 2026141795,
              receiveDay: '2026-03-19',
              occurrenDate: '2026-03-18',
              treatmentPeriod: '1주 미만',
              age: 72,
              gender: '여자',
              itemMajor: '시설 및 서비스',
              itemMiddle: '욕실',
              itemMinor: '욕조',
              injuryReason: '미끄러짐·넘어짐',
              injuryPart: '머리',
              injurySymptoms: '타박상',
              occurrencePlace: '주택',
            },
          },
        },
      },
    });

    expect(page).toMatchObject({ totalCount: 26658, pageNo: 2, numOfRows: 1000 });
    expect(page.items[0]).toMatchObject({
      id: '2026141795',
      occurrenceDate: '2026-03-18',
      age: '72',
    });
  });
});
