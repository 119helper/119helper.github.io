import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleWeather } from './weather';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const openMeteoBody = {
  current: {
    time: '2026-06-30T14:00',
    temperature_2m: 28.4,
    relative_humidity_2m: 64,
    wind_speed_10m: 3.2,
    wind_direction_10m: 180,
    precipitation: 0,
    weather_code: 1,
  },
  hourly: {
    time: ['2026-06-30T14:00'],
    temperature_2m: [28.4],
    relative_humidity_2m: [64],
    wind_speed_10m: [3.2],
    wind_direction_10m: [180],
    precipitation_probability: [10],
    precipitation: [0],
    weather_code: [1],
  },
  daily: {
    weather_code: [1, 1, 1, 1, 1, 1, 1],
    temperature_2m_max: [30, 31, 32, 33, 34, 35, 36],
    temperature_2m_min: [21, 22, 23, 24, 25, 26, 27],
    precipitation_probability_max: [10, 10, 10, 10, 10, 10, 10],
  },
};

describe('handleWeather', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back when KMA returns an API-level error in a 200 response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('apihub.kma.go.kr')) {
        return jsonResponse({
          response: {
            header: { resultCode: '03', resultMsg: 'NO_DATA' },
            body: { items: {} },
          },
        });
      }
      if (url.includes('api.open-meteo.com')) {
        return jsonResponse(openMeteoBody);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleWeather('/api/weather/now', new URL('https://api.example.test/api/weather/now?nx=60&ny=127'), 'kma-key');
    const rows = result.data as Array<{ category: string; obsrValue: string }>;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows.some(row => row.category === 'T1H' && row.obsrValue === '28.4')).toBe(true);
    expect(result.cacheTtl).toBe(0);
  });

  it('falls back instead of caching an empty KMA item envelope', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('apihub.kma.go.kr')) {
        return jsonResponse({ response: { header: { resultCode: '00' }, body: { items: {} } } });
      }
      if (url.includes('api.open-meteo.com')) {
        return jsonResponse(openMeteoBody);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleWeather('/api/weather/ultra', new URL('https://api.example.test/api/weather/ultra?nx=60&ny=127'), 'kma-key');
    const rows = result.data as Array<{ category: string; fcstValue: string }>;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows.some(row => row.category === 'TMP' && row.fcstValue === '28.4')).toBe(true);
    expect(result.cacheTtl).toBe(0);
  });

  it('does not double encode a pre-encoded KMA auth key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('apihub.kma.go.kr')) {
        return jsonResponse({
          response: {
            header: { resultCode: '00' },
            body: { items: { item: [{ category: 'T1H', obsrValue: '28.4' }] } },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleWeather(
      '/api/weather/now',
      new URL('https://api.example.test/api/weather/now?nx=60&ny=127'),
      'kma%2Bkey%2Fvalue',
    );

    const upstreamUrl = String(fetchMock.mock.calls[0][0]);
    const upstream = new URL(upstreamUrl);
    expect(upstream.searchParams.get('authKey')).toBe('kma+key/value');
    expect(upstreamUrl).not.toContain('%252B');
    expect(result.cacheTtl).toBe(600);
  });
});
