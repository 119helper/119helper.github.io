/**
 * 소방청_구급통계서비스 API 프록시
 * Base: https://apis.data.go.kr/1661000/EmergencyStatisticsService
 */

import { encodeServiceKey, fetchWithRetry, parsePublicDataJson, pickItemsAndCount } from './publicData';
import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { normalizeEmergencyHeadquarters } from './emergencyRegions';

const BASE = 'https://apis.data.go.kr/1661000/EmergencyStatisticsService';
const SOURCE_NAME = '소방청_구급통계서비스';
const SOURCE_URL = 'https://www.data.go.kr/data/15099428/openapi.do';
const AVAILABILITY_HEADQUARTERS = '서울소방재난본부';
const AVAILABILITY_MONTH_LIMIT = 18;
const AVAILABILITY_BATCH_SIZE = 3;

// 오퍼레이션 매핑
const OPS: Record<string, string> = {
  'activity':       'get119EmgencyActivityStats',       // 119구급활동현황
  'traffic':        'getTrafficAccidentEmgActStats',    // 교통사고구급활동현황
  'dispatch-type':  'getEmgDispatchResultStats',        // 구급출동유형별현황
  'location':       'getTrasferPatientByPlaceStats',    // 사고장소별이송환자현황
  'age':            'getTrasferPatientByAgeGroupStats',  // 연령별이송환자현황
  'history':        'getTrasferPatientByCaseHistoryStats', // 이송환자병력현황
  'center':         'get119EmgMngCenterOprStats',       // 119구급상황관리센터운영현황
};

function currentKstYm(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(count: number, fromYm = currentKstYm()): string[] {
  const startYear = Number(fromYm.slice(0, 4));
  const startMonth = Number(fromYm.slice(4, 6));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(startYear, startMonth - 1 - index, 1));
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function monthLag(fromYm: string, toYm: string): number {
  const from = Number(fromYm.slice(0, 4)) * 12 + Number(fromYm.slice(4, 6));
  const to = Number(toYm.slice(0, 4)) * 12 + Number(toYm.slice(4, 6));
  return Math.max(0, from - to);
}

async function fetchStats(
  operation: string,
  params: URLSearchParams,
  serviceKey: string,
): Promise<{ items: unknown[]; totalCount: number }> {
  const res = await fetchWithRetry(`${BASE}/${operation}?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`EmergencyStats/${operation} ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }

  const data = parsePublicDataJson(text, `EmergencyStats/${operation}`);
  return pickItemsAndCount(data);
}

async function findLatestAvailableMonth(apiKey: string) {
  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const currentYm = currentKstYm();
  const months = recentMonths(AVAILABILITY_MONTH_LIMIT, currentYm);

  for (let start = 0; start < months.length; start += AVAILABILITY_BATCH_SIZE) {
    const batch = months.slice(start, start + AVAILABILITY_BATCH_SIZE);
    const counts = await Promise.all(batch.map(async month => {
      const params = new URLSearchParams({
        pageNo: '1',
        numOfRows: '1',
        resultType: 'json',
        sidoHqOgidNm: AVAILABILITY_HEADQUARTERS,
        rcptYm: month,
      });
      const { totalCount } = await fetchStats(OPS.activity, params, serviceKey);
      return { month, totalCount };
    }));
    const latest = counts.find(result => result.totalCount > 0);
    if (latest) {
      return {
        latestYm: latest.month,
        currentYm,
        lagMonths: monthLag(currentYm, latest.month),
      };
    }
  }

  return { latestYm: null, currentYm, lagMonths: null };
}

export async function handleEmergencyStats(
  path: string, url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  if (path === '/api/emergency/stats/availability') {
    const availability = await findLatestAvailableMonth(apiKey);
    return {
      data: {
        ...availability,
        checkedAt: new Date().toISOString(),
        sourceName: SOURCE_NAME,
        sourceUrl: SOURCE_URL,
      },
      cacheTtl: 6 * 60 * 60,
    };
  }

  // /api/emergency/stats/{op}
  const segments = path.split('/');
  const opKey = segments[segments.length - 1]; // activity, traffic, etc.
  const opName = OPS[opKey];
  if (!opName) throw new Error(`Unknown stats operation: ${opKey}`);

  // 명세(2022 개편): serviceKey, pageNo, numOfRows, resultType, sidoHqOgidNm(시도본부), rcptYm(접수년월), rsacGutFsttOgidNm(출동소방서)
  const params = new URLSearchParams({ resultType: 'json' });
  params.set('pageNo', sanitizeNumericParam(url, 'pageNo', 1, 1000, 1));
  params.set('numOfRows', sanitizeNumericParam(url, 'numOfRows', 1, 1000, 1000));
  for (const key of ['sidoHqOgidNm', 'rcptYm', 'rsacGutFsttOgidNm']) {
    const v = sanitizeStringParam(url, key, key.endsWith('Ym') ? 6 : 40);
    if (v) params.set(key, v);
  }
  // 레거시 파라미터 호환
  const legacyYm = sanitizeStringParam(url, 'reqYm', 6);
  if (legacyYm && !params.has('rcptYm')) params.set('rcptYm', legacyYm);
  const legacySido = sanitizeStringParam(url, 'sido', 40);
  if (legacySido && !params.has('sidoHqOgidNm')) params.set('sidoHqOgidNm', legacySido);
  const legacyStn = sanitizeStringParam(url, 'fireStn', 40);
  if (legacyStn && !params.has('rsacGutFsttOgidNm')) params.set('rsacGutFsttOgidNm', legacyStn);

  const headquarters = normalizeEmergencyHeadquarters(params.get('sidoHqOgidNm'));
  if (!headquarters) {
    throw new Error('구급통계 조회에는 시도 지역이 필요합니다.');
  }
  params.set('sidoHqOgidNm', headquarters);

  const serviceKey = encodeServiceKey(apiKey, 'EMERGENCY_API_KEY');
  const { items, totalCount } = await fetchStats(opName, params, serviceKey);

  return {
    data: {
      items,
      totalCount,
      requestedYm: params.get('rcptYm'),
      headquarters,
      sourceName: SOURCE_NAME,
    },
    cacheTtl: 3600,
  };
}
