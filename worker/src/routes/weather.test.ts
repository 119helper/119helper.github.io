import { afterEach, describe, expect, it, vi } from 'vitest';
import { gridToLatLng, handleWeather } from './weather';

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

  describe('Open-Meteo fallback', () => {
    function stubFallback(body: unknown) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('apihub.kma.go.kr')) return jsonResponse({}, 503);
        if (url.includes('api.open-meteo.com')) return jsonResponse(body);
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    function openMeteoRequest(fetchMock: ReturnType<typeof stubFallback>): URL {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('api.open-meteo.com'));
      return new URL(String(call?.[0]));
    }

    it('inverts KMA grids instead of falling back to Seoul', async () => {
      const fetchMock = stubFallback(openMeteoBody);

      // 강릉 격자
      await handleWeather('/api/weather/now', new URL('https://api.example.test/api/weather/now?nx=92&ny=131'), 'kma-key');

      const upstream = openMeteoRequest(fetchMock);
      expect(Number(upstream.searchParams.get('latitude'))).toBeCloseTo(37.73, 1);
      expect(Number(upstream.searchParams.get('longitude'))).toBeCloseTo(128.86, 1);
      expect(upstream.searchParams.get('wind_speed_unit')).toBe('ms');
    });

    it('maps known city grids near their city centers', () => {
      const seoul = gridToLatLng(60, 127);
      const jeju = gridToLatLng(52, 38);
      expect(seoul.lat).toBeCloseTo(37.57, 1);
      expect(seoul.lng).toBeCloseTo(126.98, 1);
      expect(jeju.lat).toBeCloseTo(33.5, 1);
      expect(jeju.lng).toBeCloseTo(126.5, 1);
    });

    it('reads Open-Meteo local times as KST without shifting them again', async () => {
      stubFallback(openMeteoBody);
      // Cloudflare Worker는 UTC로 동작한다. 개발 PC(KST)에서도 같은 조건으로 검증한다.
      const originalTz = process.env.TZ;
      process.env.TZ = 'UTC';

      try {
        const result = await handleWeather('/api/weather/now', new URL('https://api.example.test/api/weather/now?nx=60&ny=127'), 'kma-key');
        const rows = result.data as Array<{ baseDate: string; baseTime: string }>;

        expect(rows[0]).toMatchObject({ baseDate: '20260630', baseTime: '1400' });
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    });

    it('starts hourly forecasts at the current hour instead of midnight', async () => {
      const hours = Array.from({ length: 24 }, (_, hour) => `2026-06-30T${String(hour).padStart(2, '0')}:00`);
      stubFallback({
        ...openMeteoBody,
        current: { ...openMeteoBody.current, time: '2026-06-30T14:15' },
        hourly: {
          time: hours,
          temperature_2m: hours.map((_, hour) => hour),
        },
      });

      const result = await handleWeather('/api/weather/ultra', new URL('https://api.example.test/api/weather/ultra?nx=60&ny=127'), 'kma-key');
      const temps = (result.data as Array<{ category: string; fcstTime: string; fcstValue: string }>)
        .filter(row => row.category === 'TMP');

      expect(temps[0]).toMatchObject({ fcstTime: '1400', fcstValue: '14' });
      expect(temps.at(-1)?.fcstTime).toBe('2300');
    });

    it('aligns mid-term day N with today + N', async () => {
      stubFallback({
        ...openMeteoBody,
        daily: {
          weather_code: [1, 1, 1, 1, 1, 1, 1, 1],
          temperature_2m_max: [30, 31, 32, 33, 34, 35, 36, 37],
          temperature_2m_min: [20, 21, 22, 23, 24, 25, 26, 27],
          precipitation_probability_max: [0, 10, 20, 30, 40, 50, 60, 70],
        },
      });

      const temp = await handleWeather('/api/weather/mid-temp', new URL('https://api.example.test/api/weather/mid-temp?regId=11B10101'), 'kma-key');
      const land = await handleWeather('/api/weather/mid-land', new URL('https://api.example.test/api/weather/mid-land?regId=11B00000'), 'kma-key');

      expect((temp.data as Array<Record<string, unknown>>)[0]).toMatchObject({ taMin3: 23, taMax3: 33, taMin7: 27, taMax7: 37 });
      expect((land.data as Array<Record<string, unknown>>)[0]).toMatchObject({ rnSt3Am: 30, rnSt7Pm: 70 });
    });
  });
});
