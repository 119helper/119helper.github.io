import { readFile } from 'node:fs/promises';

const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': '119-helper-data-freshness-audit/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function maxMatch(text, pattern, label) {
  const values = [...text.matchAll(pattern)].map(match => match[1]).sort();
  if (values.length === 0) throw new Error(`${label}: 공식 페이지에서 기준일을 찾지 못했습니다.`);
  return values.at(-1);
}

function monthValue(value) {
  const normalized = String(value).replace(/[^0-9]/g, '').slice(0, 6);
  return Number(normalized);
}

async function auditAnnualFire() {
  const [official, routeSource] = await Promise.all([
    fetchText('https://www.data.go.kr/tcs/dss/selectFileDataDetailView.do?publicDataPk=15060386'),
    readFile(new URL('../worker/src/routes/annualFireStats.ts', import.meta.url), 'utf8'),
  ]);
  const officialDate = maxMatch(
    official,
    /소방청_연간화재통계_(20\d{6})/g,
    '연간화재통계',
  );
  const supportedYears = [...routeSource.matchAll(/^\s*'(20\d{2})':\s*'uddi:/gm)]
    .map(match => match[1])
    .sort();
  const appYear = supportedYears.at(-1);
  const officialYear = officialDate.slice(0, 4);
  if (!appYear || Number(appYear) < Number(officialYear)) {
    throw new Error(`연간화재통계: 공식 ${officialYear}년 자료가 공개됐지만 앱 최신연도는 ${appYear ?? '없음'}입니다.`);
  }
  console.log(`PASS annual-fire official=${officialYear} app=${appYear}`);
}

async function auditMultiuse() {
  const [official, fallbackSource] = await Promise.all([
    fetchText('https://www.data.go.kr/data/15083979/fileData.do'),
    readFile(new URL('../worker/src/data/multiuse2025.ts', import.meta.url), 'utf8'),
  ]);
  const officialDate = maxMatch(
    official,
    /다중이용업소 영업장별 고유 일련번호_(20\d{6})/g,
    '다중이용업소',
  );
  const localDate = fallbackSource.match(/sourceDate:\s*'(20\d{2}-\d{2}-\d{2})'/)?.[1];
  if (!localDate || Number(officialDate) > Number(localDate.replaceAll('-', ''))) {
    throw new Error(`다중이용업소: 공식 ${officialDate} 자료가 앱 폴백 ${localDate ?? '없음'}보다 최신입니다.`);
  }
  console.log(`PASS multiuse official=${officialDate} fallback=${localDate}`);
}

async function auditFireDamageCoverage() {
  const [catalogText, routeSource] = await Promise.all([
    fetchText('https://www.data.go.kr/catalog/15142972/openapi.json'),
    readFile(new URL('../worker/src/routes/fireDamage.ts', import.meta.url), 'utf8'),
  ]);
  const catalog = JSON.parse(catalogText);
  const officialTo = String(catalog.temporalCoverage ?? '').match(/-\s*(20\d{2})년\s*(\d{2})월/)?.slice(1, 3).join('-');
  const appTo = routeSource.match(/const AVAILABLE_TO = '(20\d{2}-\d{2})'/)?.[1];
  if (!officialTo || !appTo) throw new Error('화재피해: 공식 또는 앱 제공 종료월을 읽지 못했습니다.');
  if (monthValue(appTo) < monthValue(officialTo)) {
    throw new Error(`화재피해: 공식 제공범위가 ${officialTo}로 늘었지만 앱은 ${appTo}까지입니다.`);
  }
  console.log(`PASS fire-damage official-to=${officialTo} app-to=${appTo}`);
}

async function reportStaticSourceAge() {
  const [staticManifestText, firewaterManifestText] = await Promise.all([
    readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/firewater/manifest.json', import.meta.url), 'utf8'),
  ]);
  const staticManifest = JSON.parse(staticManifestText);
  const firewaterManifest = JSON.parse(firewaterManifestText);
  const rows = Object.values(staticManifest.datasets ?? {}).map(dataset => ({
    label: dataset.label,
    sourceDate: dataset.sourceDate,
    maxAgeDays: dataset.maxAgeDays,
  }));
  const firewaterDate = Object.values(firewaterManifest.cities ?? {})
    .map(city => city.sourceDate)
    .filter(Boolean)
    .sort()
    .at(-1);
  rows.push({
    label: firewaterManifest.dataset ?? '소방용수시설',
    sourceDate: firewaterDate,
    maxAgeDays: firewaterManifest.maxAgeDays,
  });

  for (const row of rows) {
    const ageDays = row.sourceDate
      ? Math.floor((Date.now() - new Date(row.sourceDate).getTime()) / DAY_MS)
      : null;
    const stale = ageDays !== null && Number(row.maxAgeDays) > 0 && ageDays > Number(row.maxAgeDays);
    console.log(`${stale ? 'WARN' : 'PASS'} static ${row.label} source=${row.sourceDate ?? 'unknown'} ageDays=${ageDays ?? 'unknown'}`);
  }
}

await Promise.all([
  auditAnnualFire(),
  auditMultiuse(),
  auditFireDamageCoverage(),
]);
await reportStaticSourceAge();
console.log('Official data freshness audit completed.');
