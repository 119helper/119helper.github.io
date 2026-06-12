/**
 * 소방청_연간화재통계 API 프록시
 * Base: https://api.odcloud.kr/api/15060386/v1/{uddi}
 * 
 * 연도별로 별도의 UDDI 엔드포인트를 사용합니다.
 * Worker에서 대량 데이터를 집계하여 프론트엔드에 요약 데이터를 전달합니다.
 */

import { encodeServiceKey } from './publicData';

const BASE = 'https://api.odcloud.kr/api/15060386/v1';

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

// 필드명이 연도별로 미묘하게 다름 → 정규화
function normalizeRecord(raw: any): any {
  return {
    date: raw['화재발생년월일'] || raw['일시'] || '',
    sido: raw['시도'] || '',
    sigungu: raw['시군구'] || raw['시·군·구'] || raw['시_군_구'] || '',
    fireType: raw['화재유형'] || '',
    heatSourceMajor: raw['발화열원'] || raw['발화열원대분류'] || '',
    heatSourceMinor: raw['발화열원소분류'] || '',
    causeMajor: raw['발화요인대분류'] || '',
    causeMinor: raw['발화요인소분류'] || '',
    firstMaterialMajor: raw['최초착화물대분류'] || '',
    firstMaterialMinor: raw['최초착화물소분류'] || '',
    casualties: parseInt(raw['인명피해(명)소계']) || 0,
    deaths: parseInt(raw['사망']) || 0,
    injuries: parseInt(raw['부상']) || 0,
    propertyDamage: parseInt(raw['재산피해소계']) || 0,
    placeMajor: raw['장소대분류'] || '',
    placeMid: raw['장소중분류'] || '',
    placeMinor: raw['장소소분류'] || '',
  };
}

// 집계 함수
function aggregate(records: any[]) {
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

export async function handleAnnualFireStats(
  path: string, _url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  // path: /api/fire-annual/2024
  const segments = path.split('/');
  const year = segments[segments.length - 1];
  const uddi = YEAR_UDDI[year];

  if (!uddi) {
    throw new Error(`지원하지 않는 연도입니다: ${year} (2015~2024 가능)`);
  }

  const serviceKey = encodeServiceKey(apiKey, 'ANNUAL_FIRE_API_KEY');

  // 먼저 총 건수 확인
  const countUrl = `${BASE}/${uddi}?serviceKey=${serviceKey}&page=1&perPage=1`;
  const countRes = await fetch(countUrl, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!countRes.ok) throw new Error(`AnnualFireStats ${countRes.status}`);
  const countData: any = await countRes.json();
  const totalCount = countData.totalCount || 0;

  if (totalCount === 0) {
    return { data: aggregate([]), cacheTtl: 86400 };
  }

  // 전체 데이터 페이징으로 가져오기 (5000건/페이지, 전체 가져옴)
  const perPage = 5000;
  const totalPages = Math.ceil(totalCount / perPage);
  const allRecords: any[] = [];

  // 병렬로 모든 페이지 요청 (Workers 유료 플랜 30s 제한 내)
  const fetchPromises = Array.from({ length: totalPages }, async (_, i) => {
    const pageUrl = `${BASE}/${uddi}?serviceKey=${serviceKey}&page=${i + 1}&perPage=${perPage}`;
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': '119-helper-worker/1.0' },
    });
    if (!res.ok) throw new Error(`AnnualFireStats page ${i + 1}: ${res.status}`);
    const json: any = await res.json();
    return json.data || [];
  });

  const pages = await Promise.all(fetchPromises);
  for (const page of pages) {
    allRecords.push(...page);
  }

  return { data: { year, totalRecords: totalCount, ...aggregate(allRecords) }, cacheTtl: 86400 };
}
