import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleEquipment } from './equipment';
import { handleEmergencyStats } from './emergencyStats';
import { handleEmergencyInfo } from './emergencyInfo';
import { handleFireInfo } from './fireInfo';
import { handleBuilding } from './building';
import { handleER } from './er';
import { handleAir } from './air';
import type { Env } from '../index';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

const env = {
  EQUIPMENT_API_KEY: 'equipment-key',
} as Env;

describe('proxy input sanitization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes only allowlisted equipment query parameters upstream', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ header: { resultCode: '00', totalCount: 0 }, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request(
      'https://api.example.test/api/equipment/cert?pageNo=-1&numOfRows=999999&fromAprv=20260101&toAprv=20261231&serviceKey=attacker&evil=<script>',
      { headers: { Origin: 'https://119helper.github.io' } },
    );

    const response = await handleEquipment(request, env);
    expect(response.status).toBe(200);

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('serviceKey')).toBe('equipment-key');
    expect(upstream.searchParams.get('pageNo')).toBe('1');
    expect(upstream.searchParams.get('numOfRows')).toBe('100');
    expect(upstream.searchParams.get('fromAprv')).toBe('20260101');
    expect(upstream.searchParams.get('toAprv')).toBe('20261231');
    expect(upstream.searchParams.has('evil')).toBe(false);
  });

  it('sanitizes emergency stats paging and string filters', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      response: {
        header: { resultCode: '00' },
        body: { items: { item: [] }, totalCount: 0 },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await handleEmergencyStats(
      '/api/emergency/stats/activity',
      new URL('https://api.example.test/api/emergency/stats/activity?pageNo=-2&numOfRows=50000&sidoHqOgidNm=<b>서울</b>&rcptYm=20260699&rsacGutFsttOgidNm=강남;서'),
      'emergency-key',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('pageNo')).toBe('1');
    expect(upstream.searchParams.get('numOfRows')).toBe('1000');
    expect(upstream.searchParams.get('sidoHqOgidNm')).toBe('서울소방재난본부');
    expect(upstream.searchParams.get('rcptYm')).toBe('202606');
    expect(upstream.searchParams.get('rsacGutFsttOgidNm')).toBe('강남서');
  });

  it('sanitizes emergency info legacy filters', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      response: {
        header: { resultCode: '00' },
        body: { items: { item: [] }, totalCount: 0 },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await handleEmergencyInfo(
      '/api/emergency/info/transfer',
      new URL('https://api.example.test/api/emergency/info/transfer?reportYmd=202606301234&sido=<서울>&fireStn=중부"서'),
      'emergency-key',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('stmtYm')).toBe('202606');
    expect(upstream.searchParams.get('sidoHqOgidNm')).toBe('서울소방재난본부');
    expect(upstream.searchParams.get('rsacGutFsttOgidNm')).toBe('중부서');
  });

  it('sanitizes fire info date and paging parameters', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      response: {
        header: { resultCode: '00' },
        body: { items: { item: [] }, totalCount: 0 },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await handleFireInfo(
      '/api/fire/station',
      new URL('https://api.example.test/api/fire/station?pageNo=-9&numOfRows=999999&ocrn_ymd=bad&searchStDt=20260630<script>'),
      'fire-key',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('pageNo')).toBe('1');
    expect(upstream.searchParams.get('numOfRows')).toBe('1000');
    expect(upstream.searchParams.get('ocrn_ymd')).not.toContain('<');
    expect(upstream.searchParams.get('ocrn_ymd')).toMatch(/^\d{8}$/);
  });

  it('sanitizes building register code parameters', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('<response><body><items></items></body></response>'));
    vi.stubGlobal('fetch', fetchMock);

    await handleBuilding(
      new URL('https://api.example.test/api/building?sigunguCd=abcde&bjdongCd=12345&platGbCd=9&bun=12<script>&ji=99999'),
      'building-key',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('serviceKey')).toBe('building-key');
    expect(upstream.searchParams.get('sigunguCd')).toBe('');
    expect(upstream.searchParams.get('bjdongCd')).toBe('12345');
    expect(upstream.searchParams.get('platGbCd')).toBe('0');
    expect(upstream.searchParams.get('bun')).toBe('0000');
    expect(upstream.searchParams.get('ji')).toBe('0000');
  });

  it('sanitizes ER location coordinates before upstream fetch', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('<response><body><items></items></body></response>'));
    vi.stubGlobal('fetch', fetchMock);

    await handleER(
      '/api/er/location',
      new URL('https://api.example.test/api/er/location?lat=999&lng=126.9%26evil=1'),
      'er-key',
    );

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('WGS84_LAT')).toBe('37.5665');
    expect(upstream.searchParams.get('WGS84_LON')).toBe('126.9780');
    expect(upstream.searchParams.has('evil')).toBe(false);
  });

  it('sanitizes air quality region names', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      response: { body: { items: [] } },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await handleAir(new URL('https://api.example.test/api/air?sido=%3C서울%3E%22%3B'), 'air-key');

    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get('serviceKey')).toBe('air-key');
    expect(upstream.searchParams.get('sidoName')).toBe('서울');
  });

  it('does not double encode pre-encoded public data service keys', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      response: { body: { items: [] } },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await handleAir(new URL('https://api.example.test/api/air?sido=서울'), 'air%2Bkey%2Fvalue');

    const upstreamUrl = String(fetchMock.mock.calls[0][0]);
    const upstream = new URL(upstreamUrl);
    expect(upstream.searchParams.get('serviceKey')).toBe('air+key/value');
    expect(upstreamUrl).not.toContain('%252B');
  });
});
