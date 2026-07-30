// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildingWorkspaceState } from '../types/buildingWorkspace';
import type { IncidentLocation } from '../services/incidentSession';
import FacilitySearchView from './FacilitySearchView';

const facilityMocks = vi.hoisted(() => ({
  getNearbyAeds: vi.fn(),
  fetchCivilShelters: vi.fn(),
  fetchTsunamiShelters: vi.fn(),
  fetchRestroomCityIndex: vi.fn(),
  fetchRestrooms: vi.fn(),
  fetchCityIndex: vi.fn(),
  fetchFireWaterFacilities: vi.fn(),
}));

vi.mock('../services/aedApi', () => ({
  getNearbyAeds: facilityMocks.getNearbyAeds,
}));

vi.mock('../services/apiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/apiClient')>();
  return {
    ...actual,
    fetchCivilShelters: facilityMocks.fetchCivilShelters,
    fetchTsunamiShelters: facilityMocks.fetchTsunamiShelters,
  };
});

vi.mock('../services/restroomApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/restroomApi')>();
  return {
    ...actual,
    fetchRestroomCityIndex: facilityMocks.fetchRestroomCityIndex,
    fetchRestrooms: facilityMocks.fetchRestrooms,
  };
});

vi.mock('../services/fireWaterApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/fireWaterApi')>();
  return {
    ...actual,
    fetchCityIndex: facilityMocks.fetchCityIndex,
    fetchFireWaterFacilities: facilityMocks.fetchFireWaterFacilities,
  };
});

vi.mock('../services/dataFreshness', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/dataFreshness')>();
  return {
    ...actual,
    getDatasetFreshness: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../utils/kakaoLoader', () => ({
  loadKakaoMapSDK: vi.fn(() => new Promise<void>(() => undefined)),
}));

function aed(name: string, id: string) {
  return {
    id,
    name,
    locationDetail: '1층',
    address: `${name} 주소`,
    lat: 35.17,
    lng: 129.07,
    distanceKm: 1,
    phone: '',
    managerPhone: '',
    manufacturer: '',
    model: '',
    todayHours: '',
    district: '중구',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function incident(
  regionName: string,
  districtName: string,
  lat: number,
  lng: number,
): IncidentLocation {
  return {
    lat,
    lng,
    source: 'address',
    resolvedAddress: `${regionName} ${districtName}`,
    regionName,
    districtName,
    resolvedAt: 1,
  };
}

function civilShelter(name: string, address: string) {
  return {
    FCLT_NM: name,
    LCTN_WHOL_ADDR: address,
    CTPRVN_NM: address.split(' ')[0],
    LAT_EPSG4326: '35.17',
    LOT_EPST4326: '129.07',
  };
}

function view(
  city: string,
  overrides: Partial<ComponentProps<typeof FacilitySearchView>> = {},
) {
  return (
    <FacilitySearchView
      city={city}
      activeCategory="aed"
      filterState={{ query: '', district: '전체' }}
      viewState={{ selectedKey: null, page: 1, listScrollTop: 0 }}
      onCategoryChange={vi.fn()}
      onFilterStateChange={vi.fn()}
      onViewStateChange={vi.fn()}
      buildingWorkspace={createBuildingWorkspaceState()}
      onBuildingWorkspaceChange={vi.fn()}
      {...overrides}
    />
  );
}

describe('FacilitySearchView request ordering', () => {
  beforeEach(() => {
    facilityMocks.getNearbyAeds.mockReset().mockResolvedValue([]);
    facilityMocks.fetchCivilShelters.mockReset().mockResolvedValue([]);
    facilityMocks.fetchTsunamiShelters.mockReset().mockResolvedValue([]);
    facilityMocks.fetchRestroomCityIndex.mockReset().mockResolvedValue({
      total: 0,
      districts: {},
    });
    facilityMocks.fetchRestrooms.mockReset().mockResolvedValue([]);
    facilityMocks.fetchCityIndex.mockReset().mockResolvedValue({
      total: 1,
      districts: { 중구: 1 },
    });
    facilityMocks.fetchFireWaterFacilities.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ignores an older facility response after the city context changes', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    const seoul = deferred<ReturnType<typeof aed>[]>();
    facilityMocks.getNearbyAeds.mockImplementation((lat: number) => (
      lat > 37
        ? seoul.promise
        : Promise.resolve([aed('부산 최신 AED', 'BS-1')])
    ));

    const rendered = render(view('seoul'));
    rendered.rerender(view('busan'));

    expect(await screen.findByText('부산 최신 AED')).toBeInTheDocument();

    await act(async () => {
      seoul.resolve([aed('서울 지연 AED', 'SE-1')]);
      await seoul.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText('서울 지연 AED')).not.toBeInTheDocument();
      expect(screen.getByText('부산 최신 AED')).toBeInTheDocument();
    });
  });

  it('keeps the last successful list when a same-context refresh fails', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    facilityMocks.getNearbyAeds
      .mockResolvedValueOnce([aed('유지할 AED', 'KEEP-1')])
      .mockRejectedValueOnce(new Error('최신 조회 실패'));

    render(view('busan'));
    expect(await screen.findByText('유지할 AED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));

    expect(await screen.findByText(/최신 갱신 실패/)).toBeInTheDocument();
    expect(screen.getByText('유지할 AED')).toBeInTheDocument();
    expect(screen.getByText(/직전 성공 목록을 유지합니다/)).toBeInTheDocument();
  });

  it('loads the active incident city pool instead of the selected app city', async () => {
    facilityMocks.fetchCivilShelters.mockResolvedValue([
      civilShelter('부산 현장 대피소', '부산광역시 중구 중앙대로 1'),
    ]);

    render(view('seoul', {
      activeCategory: 'civil',
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
      incidentAddress: '부산광역시 중구 중앙대로 1',
    }));

    expect(await screen.findByText('부산 현장 대피소')).toBeInTheDocument();
    expect(facilityMocks.fetchCivilShelters).toHaveBeenCalledWith('부산광역시');
    expect(screen.getByText(/관심 지역/)).toHaveTextContent(
      '관심 지역 서울 대신 출동 현장 부산 관할 데이터 풀을 우선 조회합니다.',
    );
    expect(screen.getByRole('heading', { name: '시설 조회' }).nextElementSibling)
      .toHaveTextContent('부산 출동 관할');
  });

  it('describes incident AED results as coordinate-nearby data, not a regional pool', async () => {
    render(view('seoul', {
      activeCategory: 'aed',
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));

    expect(await screen.findByText('표시할 시설 데이터가 없습니다')).toBeInTheDocument();
    expect(screen.getByText(/출동 현장 좌표 주변에서 표시할 공개 AED/)).toBeInTheDocument();
    expect(screen.queryByText(/관할 데이터 풀을 우선 조회합니다/)).not.toBeInTheDocument();
  });

  it('uses the incident district as the default restroom data file', async () => {
    facilityMocks.fetchRestroomCityIndex.mockResolvedValue({
      total: 3,
      districts: { 중구: 1, 해운대구: 2 },
    });
    facilityMocks.fetchRestrooms.mockResolvedValue([{
      id: 'BS-WC-1',
      nm: '부산 현장 화장실',
      lat: 35.17,
      lng: 129.07,
      addr: '부산광역시 중구 중앙대로 2',
      isOpenAtNight: 'Y',
      hasBell: 'Y',
      male: 2,
      female: 3,
      type: '공중화장실',
      coordinateKind: 'facility_point',
    }]);

    render(view('seoul', {
      activeCategory: 'restrooms',
      filterState: { query: '', district: '강남구' },
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));

    expect(await screen.findByText('부산 현장 화장실')).toBeInTheDocument();
    expect(facilityMocks.fetchRestroomCityIndex).toHaveBeenCalledWith('busan');
    expect(facilityMocks.fetchRestrooms).toHaveBeenCalledWith(
      'busan',
      '중구',
      35.17,
      129.07,
    );
    expect(screen.getByRole('button', { name: '현장 중구 (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: '중구 (1)' })).not.toBeInTheDocument();
    expect(facilityMocks.fetchRestrooms).not.toHaveBeenCalledWith(
      'busan',
      '강남구',
      expect.any(Number),
      expect.any(Number),
    );

    fireEvent.click(screen.getByRole('button', { name: '해운대구 (2)' }));
    await waitFor(() => {
      expect(facilityMocks.fetchRestrooms).toHaveBeenLastCalledWith(
        'busan',
        '해운대구',
        35.17,
        129.07,
      );
    });
    expect(screen.getByText(/관심 지역/)).toHaveTextContent(
      '출동 현장 부산 해운대구 관할 데이터 풀',
    );
  });

  it('does not inject a selected-city filter when city and category change under an incident', async () => {
    facilityMocks.fetchRestroomCityIndex.mockResolvedValue({
      total: 1,
      districts: { 중구: 1 },
    });

    const rendered = render(view('seoul', {
      activeCategory: 'civil',
      filterState: { query: '', district: '종로구' },
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));
    await waitFor(() => {
      expect(facilityMocks.fetchCivilShelters).toHaveBeenCalledWith('부산광역시');
    });

    rendered.rerender(view('daegu', {
      activeCategory: 'restrooms',
      filterState: { query: '', district: '달서구' },
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));

    await waitFor(() => {
      expect(facilityMocks.fetchRestrooms).toHaveBeenCalledWith(
        'busan',
        '중구',
        35.17,
        129.07,
      );
    });
    expect(facilityMocks.fetchRestrooms).not.toHaveBeenCalledWith(
      'busan',
      '달서구',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('preserves ordinary per-city restroom filters without resetting the parent state', async () => {
    facilityMocks.fetchRestroomCityIndex.mockResolvedValue({
      total: 2,
      districts: { 강남구: 1, 중구: 1 },
    });
    const onFilterStateChange = vi.fn();
    const rendered = render(view('seoul', {
      activeCategory: 'restrooms',
      filterState: { query: '', district: '강남구' },
      onFilterStateChange,
    }));

    await waitFor(() => {
      expect(facilityMocks.fetchRestrooms).toHaveBeenCalledWith(
        'seoul',
        '강남구',
        undefined,
        undefined,
      );
    });

    rendered.rerender(view('busan', {
      activeCategory: 'restrooms',
      filterState: { query: '', district: '중구' },
      onFilterStateChange,
    }));

    await waitFor(() => {
      expect(facilityMocks.fetchRestrooms).toHaveBeenCalledWith(
        'busan',
        '중구',
        undefined,
        undefined,
      );
    });
    expect(onFilterStateChange).not.toHaveBeenCalled();
  });

  it('does not show a previous city restroom index while the next index is loading', async () => {
    const busanIndex = deferred<{ total: number; districts: Record<string, number> }>();
    facilityMocks.fetchRestroomCityIndex.mockImplementation((requestedCity: string) => (
      requestedCity === 'busan'
        ? busanIndex.promise
        : Promise.resolve({ total: 1, districts: { 강남구: 1 } })
    ));

    const rendered = render(view('seoul', {
      activeCategory: 'restrooms',
    }));
    expect(await screen.findByRole('button', { name: '강남구 (1)' })).toBeInTheDocument();

    rendered.rerender(view('busan', {
      activeCategory: 'restrooms',
    }));
    expect(screen.queryByRole('button', { name: '강남구 (1)' })).not.toBeInTheDocument();

    await act(async () => {
      busanIndex.resolve({ total: 1, districts: { 중구: 1 } });
      await busanIndex.promise;
    });
    expect(await screen.findByRole('button', { name: '중구 (1)' })).toBeInTheDocument();
  });

  it('loads the incident district fire-water file instead of passed selected-city data', async () => {
    facilityMocks.fetchFireWaterFacilities.mockResolvedValue([{
      fcltyNo: 'BS-H-1',
      ctprvnNm: '부산광역시',
      signguNm: '중구',
      rdnmadr: '부산광역시 중구 중앙대로 3',
      latitude: '35.17',
      longitude: '129.07',
      fcltyKndNm: '소화전',
      insptnSttusNm: '정상',
    }]);

    render(view('seoul', {
      activeCategory: 'hydrants',
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
      fireFacilities: [{
        id: 'SE-H-1',
        type: '소화전',
        address: '서울특별시 종로구 관심지역 소화전',
        lat: 37.57,
        lng: 126.98,
        district: '종로구',
        status: '정상',
      }],
    }));

    expect((await screen.findAllByText('부산광역시 중구 중앙대로 3')).length).toBeGreaterThan(0);
    expect(facilityMocks.fetchCityIndex).toHaveBeenCalledWith('busan');
    expect(facilityMocks.fetchFireWaterFacilities).toHaveBeenCalledWith('busan', '중구');
    expect(screen.queryByText('서울특별시 종로구 관심지역 소화전')).not.toBeInTheDocument();
  });

  it('fails closed for a current Incheon district without an exact fire-water file', async () => {
    facilityMocks.fetchCityIndex.mockResolvedValue({
      total: 2,
      districts: { 중구: 1, 서구: 1 },
    });

    render(view('seoul', {
      activeCategory: 'hydrants',
      incidentLocation: incident('인천광역시', '제물포구', 37.46, 126.68),
    }));

    expect(await screen.findByText(/현장 관할 인천 제물포구와 정확히 일치/))
      .toBeInTheDocument();
    expect(screen.getByText(/과거 행정구역 파일을 임의로 대체하지 않았습니다/))
      .toBeInTheDocument();
    expect(facilityMocks.fetchFireWaterFacilities).not.toHaveBeenCalled();
  });

  it('fails closed when the incident restroom district is absent from the city index', async () => {
    facilityMocks.fetchRestroomCityIndex.mockResolvedValue({
      total: 1,
      districts: { 중구: 1 },
    });

    render(view('seoul', {
      activeCategory: 'restrooms',
      incidentLocation: incident('대구광역시', '수성구', 35.86, 128.63),
    }));

    expect(await screen.findByText('공중화장실 관할 공개 데이터가 없습니다'))
      .toBeInTheDocument();
    expect(screen.getByText(/임의 지역 파일을 대신 불러오지 않았습니다/))
      .toBeInTheDocument();
    expect(facilityMocks.fetchRestrooms).not.toHaveBeenCalled();
  });

  it('ignores an older response when only the incident jurisdiction changes', async () => {
    const delayedSeoul = deferred<ReturnType<typeof civilShelter>[]>();
    facilityMocks.fetchCivilShelters.mockImplementation((province: string) => (
      province === '서울특별시'
        ? delayedSeoul.promise
        : Promise.resolve([
            civilShelter('부산 최신 대피소', '부산광역시 중구 중앙대로 4'),
          ])
    ));

    const rendered = render(view('seoul', {
      activeCategory: 'civil',
      incidentLocation: incident('서울특별시', '종로구', 37.57, 126.98),
    }));
    await waitFor(() => {
      expect(facilityMocks.fetchCivilShelters).toHaveBeenCalledWith('서울특별시');
    });

    rendered.rerender(view('seoul', {
      activeCategory: 'civil',
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));
    expect(await screen.findByText('부산 최신 대피소')).toBeInTheDocument();

    await act(async () => {
      delayedSeoul.resolve([
        civilShelter('서울 지연 대피소', '서울특별시 종로구 종로 1'),
      ]);
      await delayedSeoul.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText('서울 지연 대피소')).not.toBeInTheDocument();
      expect(screen.getByText('부산 최신 대피소')).toBeInTheDocument();
    });
  });

  it('shows an incident-scoped empty state without treating an empty pool as a fetch failure', async () => {
    facilityMocks.fetchCivilShelters.mockResolvedValue([]);

    render(view('seoul', {
      activeCategory: 'civil',
      incidentLocation: incident('부산광역시', '중구', 35.17, 129.07),
    }));

    expect(await screen.findByText('표시할 시설 데이터가 없습니다')).toBeInTheDocument();
    expect(screen.getByText(/출동 현장 부산 데이터 풀에서 표시할 공개 시설/)).toBeInTheDocument();
    expect(screen.queryByText('민방위 대피시설 정보를 불러오지 못했습니다')).not.toBeInTheDocument();
  });

  it('labels unsupported incident jurisdictions as selected-city fallback data', async () => {
    render(view('seoul', {
      activeCategory: 'civil',
      incidentLocation: incident('경기도', '수원시', 37.26, 127.03),
    }));

    const fallbackAlert = await screen.findByRole('alert');
    expect(fallbackAlert).toHaveTextContent('현재 시설 데이터 지원 범위 밖입니다');
    expect(fallbackAlert).toHaveTextContent('관심 지역 서울 데이터를 대체 표시합니다');
    expect(facilityMocks.fetchCivilShelters).toHaveBeenCalledWith('서울특별시');
  });
});
