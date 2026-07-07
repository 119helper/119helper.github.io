/**
 * 소방청_연간화재통계 API 프록시
 * Base: https://api.odcloud.kr/api/15060386/v1/{uddi}
 * 
 * 연도별로 별도의 UDDI 엔드포인트를 사용합니다.
 * Worker에서 대량 데이터를 집계하여 프론트엔드에 요약 데이터를 전달합니다.
 */

import { z } from 'zod';
import { encodeServiceKey, fetchWithTimeout } from './publicData';

const BASE = 'https://api.odcloud.kr/api/15060386/v1';
const ANNUAL_FIRE_SOURCE_NAME = '소방청_연간화재통계_20241231';
const NEXT_EXPECTED_UPDATE = '2026-11-18';
const PAGE_FETCH_CONCURRENCY = 3;

const odcloudAnnualFireSchema = z.object({
  totalCount: z.number().optional(),
  data: z.array(z.record(z.string(), z.unknown())).optional(),
}).catchall(z.unknown());

type AnnualFireRawRecord = z.infer<typeof odcloudAnnualFireSchema>['data'] extends (infer T)[] | undefined ? T : never;

interface AnnualFireRecord {
  date: string;
  sido: string;
  sigungu: string;
  fireType: string;
  heatSourceMajor: string;
  heatSourceMinor: string;
  causeMajor: string;
  causeMinor: string;
  firstMaterialMajor: string;
  firstMaterialMinor: string;
  casualties: number;
  deaths: number;
  injuries: number;
  propertyDamage: number;
  placeMajor: string;
  placeMid: string;
  placeMinor: string;
}

function stringField(raw: AnnualFireRawRecord, key: string): string {
  const value = raw[key];
  return value === undefined || value === null ? '' : String(value);
}

function intField(raw: AnnualFireRawRecord, key: string): number {
  return Number.parseInt(stringField(raw, key), 10) || 0;
}

// 연도별 UDDI 매핑
const YEAR_UDDI: Record<string, string> = {
  '2015': 'uddi:1e3d031d-8650-45db-9daf-bb742cfbb83c',
  '2016': 'uddi:d832fa12-7b66-4058-beae-e23267270a05',
  '2017': 'uddi:52bbace2-f0c1-46c9-9057-c31731da9b30',
  '2018': 'uddi:08f09298-4bae-41a7-a315-c1421a1d418b',
  '2019': 'uddi:65991a70-9fcf-40c3-ad3a-ee24b401c56a',
  '2020': 'uddi:bd8a7575-d4c9-4a22-a972-fac12348dd7e',
  '2021': 'uddi:dd407ff5-f23a-4d46-b90b-dc37505fb02c',
  '2022': 'uddi:cb73d6d5-064c-4dd2-a136-8c3069aa1fe2',
  '2023': 'uddi:9951ec3f-d1c9-49e8-9ed4-f026c39a7925',
  '2024': 'uddi:fa73f7a3-dfa1-4b0a-ada8-dcd8333ba9e4',
};

const SUPPORTED_YEARS = Object.keys(YEAR_UDDI).sort((a, b) => Number(b) - Number(a));

// 필드명이 연도별로 미묘하게 다름 → 정규화
function normalizeRecord(raw: AnnualFireRawRecord): AnnualFireRecord {
  return {
    date: stringField(raw, '화재발생년월일') || stringField(raw, '일시'),
    sido: stringField(raw, '시도'),
    sigungu: stringField(raw, '시군구') || stringField(raw, '시·군·구') || stringField(raw, '시_군_구'),
    fireType: stringField(raw, '화재유형'),
    heatSourceMajor: stringField(raw, '발화열원') || stringField(raw, '발화열원대분류'),
    heatSourceMinor: stringField(raw, '발화열원소분류'),
    causeMajor: stringField(raw, '발화요인대분류'),
    causeMinor: stringField(raw, '발화요인소분류'),
    firstMaterialMajor: stringField(raw, '최초착화물대분류'),
    firstMaterialMinor: stringField(raw, '최초착화물소분류'),
    casualties: intField(raw, '인명피해(명)소계'),
    deaths: intField(raw, '사망'),
    injuries: intField(raw, '부상'),
    propertyDamage: intField(raw, '재산피해소계'),
    placeMajor: stringField(raw, '장소대분류'),
    placeMid: stringField(raw, '장소중분류'),
    placeMinor: stringField(raw, '장소소분류'),
  };
}

// 집계 함수
function aggregate(records: AnnualFireRawRecord[]) {
  const normalized = records.map(normalizeRecord);

  const totalFires = normalized.length;
  let totalDeaths = 0, totalInjuries = 0, totalPropertyDamage = 0;

  const bySido: Record<string, number> = {};
  const byFireType: Record<string, number> = {};
  const byPlace: Record<string, number> = {};
  const byCause: Record<string, number> = {};
  const byMonth: Record<string, number> = {};

  for (const r of normalized) {
    totalDeaths += r.deaths;
    totalInjuries += r.injuries;
    totalPropertyDamage += r.propertyDamage;

    // 시도별
    if (r.sido) bySido[r.sido] = (bySido[r.sido] || 0) + 1;

    // 화재유형별
    if (r.fireType) byFireType[r.fireType] = (byFireType[r.fireType] || 0) + 1;

    // 장소별
    if (r.placeMajor) byPlace[r.placeMajor] = (byPlace[r.placeMajor] || 0) + 1;

    // 발화요인별
    if (r.causeMajor) byCause[r.causeMajor] = (byCause[r.causeMajor] || 0) + 1;

    // 월별
    const dateStr = r.date;
    if (dateStr) {
      // 날짜 형식: "2024-01-15" or "20240115" etc
      const cleaned = dateStr.replace(/[^0-9]/g, '');
      if (cleaned.length >= 6) {
        const month = cleaned.substring(4, 6);
        byMonth[month] = (byMonth[month] || 0) + 1;
      }
    }
  }

  // 인명피해 시도별 집계
  const casualtiesBySido: Record<string, { deaths: number; injuries: number }> = {};
  for (const r of normalized) {
    if (!r.sido) continue;
    if (!casualtiesBySido[r.sido]) casualtiesBySido[r.sido] = { deaths: 0, injuries: 0 };
    casualtiesBySido[r.sido].deaths += r.deaths;
    casualtiesBySido[r.sido].injuries += r.injuries;
  }

  return {
    summary: {
      totalFires,
      totalDeaths,
      totalInjuries,
      totalCasualties: totalDeaths + totalInjuries,
      totalPropertyDamage,
    },
    bySido: Object.entries(bySido)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    byFireType: Object.entries(byFireType)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    byPlace: Object.entries(byPlace)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    byCause: Object.entries(byCause)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count })),
    byMonth: Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, '0');
      return { month: `${i + 1}월`, count: byMonth[month] || 0 };
    }),
    casualtiesBySido: Object.entries(casualtiesBySido)
      .sort((a, b) => (b[1].deaths + b[1].injuries) - (a[1].deaths + a[1].injuries))
      .map(([name, v]) => ({ name, deaths: v.deaths, injuries: v.injuries })),
  };
}

async function fetchAnnualFirePage(url: string, label: string): Promise<z.infer<typeof odcloudAnnualFireSchema>> {
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  }, 10_000);
  if (!res.ok) throw new Error(`${label}: ${res.status}`);
  return odcloudAnnualFireSchema.parse(await res.json());
}

export async function handleAnnualFireStats(
  path: string, _url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  if (path === '/api/fire-annual/years') {
    return {
      data: {
        years: SUPPORTED_YEARS,
        latestYear: SUPPORTED_YEARS[0] ?? null,
        sourceName: ANNUAL_FIRE_SOURCE_NAME,
        nextExpectedUpdate: NEXT_EXPECTED_UPDATE,
      },
      cacheTtl: 86400,
    };
  }

  // path: /api/fire-annual/2024
  const segments = path.split('/');
  const year = segments[segments.length - 1];
  const uddi = YEAR_UDDI[year];

  if (!uddi) {
    throw new Error(`지원하지 않는 연도입니다: ${year} (${SUPPORTED_YEARS.at(-1)}~${SUPPORTED_YEARS[0]} 가능)`);
  }

  const serviceKey = encodeServiceKey(apiKey, 'ANNUAL_FIRE_API_KEY');

  // 먼저 총 건수 확인
  const countUrl = `${BASE}/${uddi}?serviceKey=${serviceKey}&page=1&perPage=1`;
  const countData = await fetchAnnualFirePage(countUrl, 'AnnualFireStats count');
  const totalCount = countData.totalCount || 0;

  if (totalCount === 0) {
    return { data: aggregate([]), cacheTtl: 86400 };
  }

  // 전체 데이터 페이징으로 가져오기 (5000건/페이지, 전체 가져옴)
  const perPage = 5000;
  const totalPages = Math.ceil(totalCount / perPage);
  const allRecords: AnnualFireRawRecord[] = [];

  // 업스트림/API quota를 압박하지 않도록 작은 배치로 병렬 처리한다.
  for (let start = 0; start < totalPages; start += PAGE_FETCH_CONCURRENCY) {
    const pageNumbers = Array.from(
      { length: Math.min(PAGE_FETCH_CONCURRENCY, totalPages - start) },
      (_, i) => start + i + 1
    );
    const pages = await Promise.all(pageNumbers.map(async pageNo => {
      const pageUrl = `${BASE}/${uddi}?serviceKey=${serviceKey}&page=${pageNo}&perPage=${perPage}`;
      const json = await fetchAnnualFirePage(pageUrl, `AnnualFireStats page ${pageNo}`);
      return json.data || [];
    }));
    for (const page of pages) {
      allRecords.push(...page);
    }
  }

  return {
    data: {
      year,
      totalRecords: totalCount,
      supportedYears: SUPPORTED_YEARS,
      sourceName: ANNUAL_FIRE_SOURCE_NAME,
      nextExpectedUpdate: NEXT_EXPECTED_UPDATE,
      ...aggregate(allRecords),
    },
    cacheTtl: 86400,
  };
}
