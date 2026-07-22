import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchBuildingInfo: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  fetchBuildingInfo: apiMocks.fetchBuildingInfo,
  isStaleDataError: () => false,
  StaleDataError: class StaleDataError extends Error {},
}));

import { fetchBuildingRegister } from './buildingApi';

describe('buildingApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps missing numeric fields distinct from explicit zero values', async () => {
    apiMocks.fetchBuildingInfo.mockResolvedValue([{
      grndFlrCnt: '0',
      ugrndFlrCnt: '',
      totArea: null,
      archArea: '0',
      bcRat: undefined,
      vlRat: '0',
    }]);

    await expect(fetchBuildingRegister('11110', '11900', '0', '209', '0')).resolves.toMatchObject({
      grndFlrCnt: 0,
      ugrndFlrCnt: undefined,
      totArea: undefined,
      archArea: 0,
      bcRat: undefined,
      vlRat: 0,
    });
  });
});
