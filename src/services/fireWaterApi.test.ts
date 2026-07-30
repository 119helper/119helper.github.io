import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFireWaterFacilities,
  parseFireWaterFacilities,
  type FireWaterFacility,
} from './fireWaterApi';

describe('fireWaterApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a missing inspection status as unknown instead of assuming normal', () => {
    const [facility] = parseFireWaterFacilities([{
      fcltyNo: 'FW-1',
      fcltyKndNm: '소화전',
      rdnmadr: '서울특별시 중구 테스트로 1',
      latitude: '37.56',
      longitude: '126.98',
    } satisfies FireWaterFacility]);

    expect(facility.status).toBe('미확인');
  });

  it('uses an explicitly supplied inspection status', () => {
    const facilities = parseFireWaterFacilities([
      {
        fcltyNo: 'FW-NORMAL',
        latitude: '37.56',
        longitude: '126.98',
        insptnSttusNm: '정상',
      },
      {
        fcltyNo: 'FW-BROKEN',
        latitude: '37.57',
        longitude: '126.99',
        insptnSttusNm: '고장',
      },
    ]);

    expect(facilities.map(item => item.status)).toEqual(['정상', '고장']);
  });

  it('rejects a missing dataset so callers can distinguish failure from zero facilities', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    await expect(fetchFireWaterFacilities('seoul', '중구')).rejects.toThrow('데이터 파일이 없습니다');
  });
});
