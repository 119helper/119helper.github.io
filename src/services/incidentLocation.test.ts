// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadKakaoMapSDK } from '../utils/kakaoLoader';
import { geocodeIncidentAddress, getCurrentIncidentLocation } from './incidentLocation';

vi.mock('../utils/kakaoLoader', () => ({
  loadKakaoMapSDK: vi.fn(),
}));

describe('incidentLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadKakaoMapSDK).mockResolvedValue();
    Reflect.deleteProperty(window, 'kakao');
  });

  it('turns an address result into a reusable incident coordinate', async () => {
    const addressSearch = vi.fn((_query: string, callback: (result: Array<{
      x: string;
      y: string;
      address: {
        address_name: string;
        region_1depth_name: string;
        region_2depth_name: string;
        b_code: string;
      };
    }>, status: string) => void) => {
      callback([{
        x: '126.9780',
        y: '37.5665',
        address: {
          address_name: '서울특별시 중구 세종대로 110',
          region_1depth_name: '서울특별시',
          region_2depth_name: '중구',
          b_code: '1114010300',
        },
      }], 'OK');
    });
    Object.defineProperty(window, 'kakao', {
      configurable: true,
      value: {
        maps: {
          services: {
            Geocoder: class {
              addressSearch = addressSearch;
            },
            Status: { OK: 'OK' },
          },
        },
      },
    });

    await expect(geocodeIncidentAddress('  서울시청  ')).resolves.toMatchObject({
      lat: 37.5665,
      lng: 126.978,
      source: 'address',
      queryAddress: '서울시청',
      resolvedAddress: '서울특별시 중구 세종대로 110',
      regionName: '서울특별시',
      districtName: '중구',
      legalDongCode: '1114010300',
    });
    expect(addressSearch).toHaveBeenCalledWith('서울시청', expect.any(Function));
  });

  it('does not silently accept an address with no geocoder result', async () => {
    Object.defineProperty(window, 'kakao', {
      configurable: true,
      value: {
        maps: {
          services: {
            Geocoder: class {
              addressSearch(_query: string, callback: (result: never[], status: string) => void) {
                callback([], 'ZERO_RESULT');
              }
            },
            Status: { OK: 'OK' },
          },
        },
      },
    });

    await expect(geocodeIncidentAddress('없는 주소')).rejects.toThrow('주소를 찾지 못했습니다');
  });

  it('uses high-accuracy browser coordinates for a GPS incident location', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 35.1595,
          longitude: 126.8526,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    await expect(getCurrentIncidentLocation()).resolves.toMatchObject({
      lat: 35.1595,
      lng: 126.8526,
      source: 'gps',
      accuracyMeters: 8,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    );
  });

  it('adds the GPS administrative region when Kakao reverse geocoding succeeds', async () => {
    const coord2RegionCode = vi.fn((
      _lng: number,
      _lat: number,
      callback: (result: Array<{
        region_type: string;
        code: string;
        region_1depth_name: string;
        region_2depth_name: string;
        region_3depth_name: string;
      }>, status: string) => void,
    ) => {
      callback([{
        region_type: 'H',
        code: '2914075100',
        region_1depth_name: '광주광역시',
        region_2depth_name: '서구',
        region_3depth_name: '치평동',
      }], 'OK');
    });
    Object.defineProperty(window, 'kakao', {
      configurable: true,
      value: {
        maps: {
          services: {
            Geocoder: class {
              coord2RegionCode = coord2RegionCode;
            },
            Status: { OK: 'OK' },
          },
        },
      },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: {
            latitude: 35.1595,
            longitude: 126.8526,
            accuracy: 8,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        }),
      },
    });

    await expect(getCurrentIncidentLocation()).resolves.toMatchObject({
      source: 'gps',
      resolvedAddress: '광주광역시 서구 치평동',
      regionName: '광주광역시',
      districtName: '서구',
      legalDongCode: '2914075100',
    });
    expect(coord2RegionCode).toHaveBeenCalledWith(126.8526, 35.1595, expect.any(Function));
  });

  it('rejects a GPS fix that is too imprecise for nearby tactical data', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: {
            latitude: 35.1595,
            longitude: 126.8526,
            accuracy: 1_500,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        }),
      },
    });

    await expect(getCurrentIncidentLocation()).rejects.toThrow('오차가 너무 큽니다');
  });
});
