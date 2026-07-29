import { describe, expect, it } from 'vitest';
import {
  HAZMAT_DATA_INFO,
  HAZMAT_FIRE_DEPT_DATA_2023,
  HAZMAT_FIRE_DEPT_SUMMARY_2023,
  HAZMAT_GYEONGBUK_SUMMARY_2024,
  HAZMAT_GYEONGBUK_SUMMARY_2025,
  type HazmatFacilityStats,
} from './hazmatFacilities';

function expectInternallyConsistent(row: HazmatFacilityStats) {
  expect(row.handling.subtotal).toBe(
    row.handling.gasStation
      + row.handling.sales
      + row.handling.transfer
      + row.handling.general,
  );
  expect(row.storage.subtotal).toBe(
    row.storage.indoor
      + row.storage.outdoorTank
      + row.storage.indoorTank
      + row.storage.underground
      + row.storage.simple
      + row.storage.mobile
      + row.storage.outdoor
      + row.storage.rock,
  );
  expect(row.total).toBe(row.manufacturing + row.handling.subtotal + row.storage.subtotal);
}

describe('hazmat facility official snapshots', () => {
  it('keeps the 2025 province summary internally consistent', () => {
    expectInternallyConsistent(HAZMAT_GYEONGBUK_SUMMARY_2025);
    expect(HAZMAT_GYEONGBUK_SUMMARY_2025.total).toBe(9_344);
  });

  it('keeps every 2023 fire-department row and its published total consistent', () => {
    HAZMAT_FIRE_DEPT_DATA_2023.forEach(expectInternallyConsistent);
    expectInternallyConsistent(HAZMAT_FIRE_DEPT_SUMMARY_2023);
    expect(HAZMAT_FIRE_DEPT_DATA_2023.reduce((sum, row) => sum + row.total, 0)).toBe(9_546);
    expect(HAZMAT_FIRE_DEPT_SUMMARY_2023.total).toBe(9_546);
  });

  it('keeps the redistributable 2024 province summary internally consistent', () => {
    expectInternallyConsistent(HAZMAT_GYEONGBUK_SUMMARY_2024);
    expect(HAZMAT_GYEONGBUK_SUMMARY_2024).toMatchObject({
      total: 9_433,
      manufacturing: 172,
      handling: { subtotal: 2_352 },
      storage: { subtotal: 6_909 },
    });
    expect(HAZMAT_DATA_INFO.provinceSummaryPrevious.license).toBe('공공누리 제1유형');
  });

  it('labels the province total and fire-department detail with different reference dates', () => {
    expect(HAZMAT_DATA_INFO.provinceSummary.referenceDate).toBe('2025-12-31');
    expect(HAZMAT_DATA_INFO.provinceSummaryPrevious.referenceDate).toBe('2024-12-31');
    expect(HAZMAT_DATA_INFO.fireDepartmentDetail.referenceDate).toBe('2023-12-31');
    expect(HAZMAT_DATA_INFO.note).toContain('변경금지 자료');
    expect(HAZMAT_DATA_INFO.note).toContain('합산하거나 배분하지 않습니다');
  });
});
