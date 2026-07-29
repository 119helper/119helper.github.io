import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NFDS_URL = 'https://www.nfds.go.kr/stat/generalData.do';
const NFDS_SOURCE_URL = 'https://www.nfds.go.kr/stat/general.do';
const NFA_STATISTICS_URL = 'https://www.nfa.go.kr/nfa/releaseinformation/statisticalinformation/main/?pageIdx=1';
const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../worker/src/data/nfdsAnnualFireSnapshots.json',
);
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function completeYearsFromArgs(currentKstYear, partialYear) {
  const singleYear = argumentValue('--complete-year');
  const raw = singleYear
    ? singleYear
    : argumentValue('--complete-years') ?? `${currentKstYear - 2},${currentKstYear - 1}`;
  const years = [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b));
  if (years.length === 0 || years.some(year => !/^\d{4}$/.test(year))) {
    throw new Error(`--complete-years는 쉼표로 구분한 YYYY 형식이어야 합니다: ${raw}`);
  }
  if (years.includes(partialYear)) {
    throw new Error(`완결연도와 누계연도가 겹칩니다: ${partialYear}`);
  }
  return years;
}

function kstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function yesterdayInKst() {
  return kstDateParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}은 YYYY-MM-DD 형식이어야 합니다: ${value}`);
  }
  return value;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNfds(params, label) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const body = new URLSearchParams({
        sidoCode: '',
        gunguCode: '',
        fireCenter01: '',
        fireCenter02: '',
        fireCenter03: '',
        code02: '',
        code03: '',
        step: '1',
        compareCode: '',
        ...params,
      });
      const response = await fetch(NFDS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': '119-helper-data-sync/1.0',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: NFDS_SOURCE_URL,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (!json?.chartData?.result) {
        throw new Error('NFDS 응답에 chartData.result가 없습니다.');
      }
      return json;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await delay(400 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function namedCounts(response) {
  return (Array.isArray(response?.chartData?.barChart) ? response.chartData.barChart : [])
    .map(row => ({
      name: String(row?.l2 ?? '').trim(),
      count: Number(row?.d1) || 0,
    }))
    .filter(row => row.name && row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function regionSummaryRows(response) {
  const tableGroups = Array.isArray(response?.tableData)
    ? response.tableData
    : response?.tableData ? [response.tableData] : [];
  const rows = tableGroups.flatMap(group => Array.isArray(group?.data) ? group.data : []);
  return rows
    .filter(row => Number(row?.gp1) === 0 && Number(row?.gp2) === 1 && String(row?.l1 ?? '').trim())
    .map(row => ({
      name: String(row.l1).trim(),
      count: Number(row.d1) || 0,
      deaths: Number(row.d2) || 0,
      injuries: Number(row.d3) || 0,
      propertyDamage: Number(row.d5) || 0,
    }))
    .filter(row => row.count > 0 || row.deaths > 0 || row.injuries > 0 || row.propertyDamage > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function resultSummary(response) {
  const result = response.chartData.result;
  return {
    count: Number(result.cnt) || 0,
    deaths: Number(result.m47) || 0,
    injuries: Number(result.m48) || 0,
    propertyDamage: Number(result.m51) || 0,
  };
}

function summariesMatch(left, right) {
  return left.count === right.count
    && left.deaths === right.deaths
    && left.injuries === right.injuries
    && left.propertyDamage === right.propertyDamage;
}

function completeRegionalRows(response, label, summary = resultSummary(response)) {
  const rows = regionSummaryRows(response);
  const classified = rows.reduce((totals, row) => ({
    count: totals.count + row.count,
    deaths: totals.deaths + row.deaths,
    injuries: totals.injuries + row.injuries,
    propertyDamage: totals.propertyDamage + row.propertyDamage,
  }), { count: 0, deaths: 0, injuries: 0, propertyDamage: 0 });
  const unclassified = {
    count: summary.count - classified.count,
    deaths: summary.deaths - classified.deaths,
    injuries: summary.injuries - classified.injuries,
    propertyDamage: summary.propertyDamage - classified.propertyDamage,
  };
  if (Object.values(unclassified).some(value => value < 0)) {
    throw new Error(
      `${label}: 지역별 합계가 공식 총계를 초과합니다. `
      + `총계=${JSON.stringify(summary)} 지역합=${JSON.stringify(classified)}`,
    );
  }
  if (Object.values(unclassified).some(value => value > 0)) {
    rows.push({ name: '지역 미분류', ...unclassified });
  }
  return { summary, rows, classified, unclassified };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function collectSnapshot(year, dataThrough, coverageType, attempt = 1) {
  const startDate = `${year}-01-01`;
  const common = { startDate, endDate: dataThrough };
  const [regions, fireTypes, causes, places] = await Promise.all([
    fetchNfds({ ...common, code01: 'S920' }, `${year} 지역별 통계`),
    fetchNfds({ ...common, code01: 'S820' }, `${year} 화재유형 통계`),
    fetchNfds({ ...common, code01: 'S822' }, `${year} 발화요인 통계`),
    fetchNfds({ ...common, code01: 'S302000000' }, `${year} 발화장소 통계`),
  ]);

  const monthNumbers = Array.from({ length: 12 }, (_, index) => index + 1)
    .filter(month => `${year}-${String(month).padStart(2, '0')}-01` <= dataThrough);
  const byMonth = await mapWithConcurrency(monthNumbers, 3, async month => {
    const monthText = String(month).padStart(2, '0');
    const lastDay = new Date(Date.UTC(Number(year), month, 0)).getUTCDate();
    const monthEnd = `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`;
    const endDate = monthEnd < dataThrough ? monthEnd : dataThrough;
    const period = {
      startDate: `${year}-${monthText}-01`,
      endDate,
    };
    const [regionalResponse, totalResponse] = await Promise.all([
      fetchNfds({ ...period, code01: 'S920' }, `${year}-${monthText} 지역별 월 통계`),
      fetchNfds({ ...period, code01: 'S820' }, `${year}-${monthText} 전국 월 총계`),
    ]);
    const regional = completeRegionalRows(
      regionalResponse,
      `${year}-${monthText}`,
      resultSummary(totalResponse),
    );
    return {
      month: `${month}월`,
      periodStart: `${year}-${monthText}-01`,
      dataThrough: endDate,
      count: regional.summary.count,
      deaths: regional.summary.deaths,
      injuries: regional.summary.injuries,
      propertyDamage: regional.summary.propertyDamage,
      bySido: regional.rows,
    };
  });

  const annualSummary = resultSummary(fireTypes);
  const annualRegional = completeRegionalRows(regions, `${year} 지역별 통계`, annualSummary);
  const bySidoDetailed = annualRegional.rows;
  const totalFires = annualSummary.count;
  const totalDeaths = annualSummary.deaths;
  const totalInjuries = annualSummary.injuries;
  const totalPropertyDamage = annualSummary.propertyDamage;
  const verification = await fetchNfds(
    { ...common, code01: 'S820' },
    `${year} 최종 총계 검증`,
  );
  const verifiedSummary = resultSummary(verification);
  const classifiedSidoTotal = annualRegional.classified.count;
  const unclassifiedRegionCount = annualRegional.unclassified.count;
  const sidoTotal = bySidoDetailed.reduce((sum, row) => sum + row.count, 0);
  const monthTotal = byMonth.reduce((sum, row) => sum + row.count, 0);
  const monthSummary = byMonth.reduce((totals, row) => ({
    count: totals.count + row.count,
    deaths: totals.deaths + row.deaths,
    injuries: totals.injuries + row.injuries,
    propertyDamage: totals.propertyDamage + row.propertyDamage,
  }), { count: 0, deaths: 0, injuries: 0, propertyDamage: 0 });
  if (
    !summariesMatch(annualSummary, annualRegional.summary)
    || !summariesMatch(annualSummary, monthSummary)
    || !summariesMatch(annualSummary, verifiedSummary)
    || sidoTotal !== totalFires
    || monthTotal !== totalFires
  ) {
    const message = `${year}: 시작 ${JSON.stringify(annualSummary)} / 지역 ${JSON.stringify(annualRegional.summary)} / 월 ${JSON.stringify(monthSummary)} / 종료 ${JSON.stringify(verifiedSummary)}`;
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`${message} — NFDS 갱신 중으로 보고 전체 수집을 재시도합니다.`);
      await delay(1_000 * attempt);
      return collectSnapshot(year, dataThrough, coverageType, attempt + 1);
    }
    throw new Error(`${message}이 ${MAX_ATTEMPTS}회 수집 후에도 일치하지 않습니다.`);
  }

  return {
    year,
    coverageType,
    periodStart: startDate,
    dataThrough,
    totalRecords: totalFires,
    propertyDamageUnit: 'thousandWon',
    regionalMonthlyGranularity: 'sido-month',
    regionalClassification: {
      classifiedCount: classifiedSidoTotal,
      unclassifiedCount: unclassifiedRegionCount,
    },
    summary: {
      totalFires,
      totalDeaths,
      totalInjuries,
      totalCasualties: totalDeaths + totalInjuries,
      totalPropertyDamage,
    },
    bySido: bySidoDetailed.map(({ name, count, deaths, injuries, propertyDamage }) => ({
      name,
      count,
      deaths,
      injuries,
      propertyDamage,
    })),
    byFireType: namedCounts(fireTypes),
    byPlace: namedCounts(places),
    byCause: namedCounts(causes).slice(0, 15),
    byMonth,
    casualtiesBySido: bySidoDetailed
      .map(({ name, deaths, injuries }) => ({ name, deaths, injuries }))
      .sort((a, b) => (b.deaths + b.injuries) - (a.deaths + a.injuries)),
  };
}

async function main() {
  const currentKstYear = Number(kstDateParts().slice(0, 4));
  const partialThrough = assertIsoDate(
    argumentValue('--partial-through') ?? yesterdayInKst(),
    '--partial-through',
  );
  const partialYear = partialThrough.slice(0, 4);
  const completeYears = completeYearsFromArgs(currentKstYear, partialYear);
  const completeSnapshots = [];
  for (const year of completeYears) {
    console.log(`NFDS ${year}년 완결 통계를 수집합니다.`);
    completeSnapshots.push(await collectSnapshot(year, `${year}-12-31`, 'complete'));
  }
  console.log(`NFDS ${partialYear}년 ${partialThrough}까지 통계를 수집합니다.`);
  const partial = await collectSnapshot(partialYear, partialThrough, 'partial');
  const generatedAt = new Date().toISOString();
  const latestCompleteYear = completeYears.at(-1);
  const snapshots = Object.fromEntries([
    ...completeSnapshots.map(snapshot => [snapshot.year, { ...snapshot, collectedAt: generatedAt }]),
    [partialYear, { ...partial, collectedAt: generatedAt }],
  ]);

  const document = {
    version: 2,
    generatedAt,
    latestCompleteYear,
    latestDataThrough: partialThrough,
    source: {
      name: '소방청 국가화재정보시스템(NFDS)',
      url: NFDS_SOURCE_URL,
      statisticsUrl: NFA_STATISTICS_URL,
      acquisitionMethod: 'NFDS 공개 화재통계 화면의 조회 결과를 정적 스냅샷으로 보존',
      propertyDamageUnit: '천원',
    },
    snapshots,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`완료: ${OUTPUT_PATH}`);
  const completeText = completeSnapshots
    .map(snapshot => `${snapshot.year} ${snapshot.summary.totalFires.toLocaleString()}건`)
    .join(' / ');
  console.log(`${completeText} / ${partialYear} YTD ${partial.summary.totalFires.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
