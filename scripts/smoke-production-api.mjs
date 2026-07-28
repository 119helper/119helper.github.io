import { appendFile } from 'node:fs/promises';

const DEFAULT_API_BASE = 'https://119-helper-api.teemozipsa.workers.dev';
const DEFAULT_ORIGIN = 'https://119helper.github.io';
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 25_000;

const apiBase = process.env.VITE_API_BASE || process.env.API_BASE || DEFAULT_API_BASE;
const appToken = process.env.VITE_APP_TOKEN || process.env.APP_ACCESS_TOKEN || '';
const origin = process.env.SMOKE_ORIGIN || DEFAULT_ORIGIN;
const mode = process.env.SMOKE_MODE === 'deploy' ? 'deploy' : 'scheduled';

if (!appToken) {
  console.error('VITE_APP_TOKEN or APP_ACCESS_TOKEN is required for production API smoke tests.');
  process.exit(1);
}

function endpoint(path, searchParams = undefined) {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasXmlEnvelope(data) {
  return isRecord(data) && typeof data.xml === 'string' && data.xml.trimStart().startsWith('<');
}

function hasPaginatedItems(data) {
  return isRecord(data) && Array.isArray(data.items) && Number.isFinite(Number(data.totalCount));
}

function isSuccessfulSafetydata(data) {
  return isRecord(data) && isRecord(data.header) && /^0+$/.test(String(data.header.resultCode));
}

const checks = [
  {
    name: 'health',
    severity: 'critical',
    url: endpoint('/api/health'),
    validate: data => isRecord(data) && data.status === 'ok',
  },
  {
    name: 'weather-now',
    severity: 'critical',
    url: endpoint('/api/weather/now', { nx: 60, ny: 127 }),
    validate: data => Array.isArray(data) && data.length > 0,
  },
  {
    name: 'weather-alerts-official',
    severity: 'critical',
    url: endpoint('/api/weather-alerts', { city: '서울' }),
    validate: data => isRecord(data)
      && Array.isArray(data.alerts)
      && data.source === '기상청 API Hub'
      && typeof data.observedAt === 'string',
  },
  {
    name: 'er-beds',
    severity: 'critical',
    url: endpoint('/api/er/beds', { sido: '서울특별시' }),
    validate: hasXmlEnvelope,
  },
  {
    name: 'air-quality',
    severity: 'critical',
    url: endpoint('/api/air', { sido: '서울' }),
    validate: Array.isArray,
  },
  {
    name: 'disaster-msg',
    severity: 'critical',
    url: endpoint('/api/disaster-msg', { numOfRows: 1, pageNo: 1 }),
    validate: Array.isArray,
  },
  {
    name: 'forest-fire-risk',
    severity: 'critical',
    url: endpoint('/api/forest-fire-risk', { numOfRows: 1, pageNo: 1, excludeForecast: 1 }),
    validate: data => hasPaginatedItems(data) && typeof data.source === 'string',
  },
  {
    name: 'wildfire',
    severity: 'critical',
    url: endpoint('/api/wildfire', { numOfRows: 1, pageNo: 1 }),
    validate: isSuccessfulSafetydata,
  },
  {
    name: 'holiday',
    severity: 'standard',
    url: endpoint('/api/holiday', { year: new Date().getFullYear(), month: 1 }),
    validate: hasXmlEnvelope,
  },
  {
    name: 'building',
    severity: 'standard',
    url: endpoint('/api/building', {
      sigunguCd: '11140',
      bjdongCd: '10200',
      platGbCd: '0',
      bun: '0031',
      ji: '0000',
    }),
    validate: Array.isArray,
  },
  {
    name: 'fire-info',
    severity: 'standard',
    url: endpoint('/api/fire/station', { numOfRows: 1, pageNo: 1 }),
    validate: hasPaginatedItems,
  },
  {
    name: 'fire-damage',
    severity: 'standard',
    url: endpoint('/api/fire-damage', {
      numOfRows: 1,
      pageNo: 1,
      sidoNm: '서울특별시',
      startYmd: '20230101',
      endYmd: '20231231',
    }),
    validate: hasPaginatedItems,
  },
  {
    name: 'fire-annual-upstream',
    severity: 'standard',
    url: endpoint('/api/fire-annual/probe'),
    validate: data => isRecord(data)
      && data.status === 'ok'
      && typeof data.year === 'string'
      && Number.isFinite(Number(data.totalCount)),
  },
  {
    name: 'fire-object',
    severity: 'standard',
    url: endpoint('/api/fire-object/accom', { ctpvNm: '서울특별시', numOfRows: 1, pageNo: 1 }),
    validate: hasPaginatedItems,
  },
  {
    name: 'firewater-upstream',
    severity: 'standard',
    url: endpoint('/api/firewater', { city: '서울특별시', probe: 1 }),
    validate: Array.isArray,
  },
  {
    name: 'multiuse',
    severity: 'standard',
    url: endpoint('/api/multiuse', { year: 2024, page: 1, perPage: 1 }),
    validate: Array.isArray,
  },
  {
    name: 'emergency-stats',
    severity: 'standard',
    url: endpoint('/api/emergency/stats/activity', {
      sidoHqOgidNm: '서울소방재난본부',
      rcptYm: '202512',
      numOfRows: 1,
      pageNo: 1,
    }),
    validate: hasPaginatedItems,
  },
  {
    name: 'emergency-info',
    severity: 'standard',
    url: endpoint('/api/emergency/info/vehicles', { stmtYm: '202401', numOfRows: 1, pageNo: 1 }),
    validate: hasPaginatedItems,
  },
  {
    name: 'equipment',
    severity: 'standard',
    url: endpoint('/api/equipment/cert', {
      fromAprv: '20260101',
      toAprv: '20261231',
      numOfRows: 1,
      pageNo: 1,
    }),
    validate: hasPaginatedItems,
  },
  {
    name: 'ambulance',
    severity: 'standard',
    url: endpoint('/api/ambulance', { Q0: '서울특별시' }),
    validate: hasXmlEnvelope,
  },
  {
    name: 'consumer-hazard',
    severity: 'standard',
    url: endpoint('/api/consumer-hazard'),
    validate: data => isRecord(data) && isRecord(data.response),
  },
];

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but received: ${text.replace(/\s+/g, ' ').slice(0, 180)}`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestOnce(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(check.url, {
      headers: {
        Origin: origin,
        'X-App-Token': appToken,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 180)}`);
  }
  if (!check.validate(data)) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 180)}`);
  }

  const stale = response.headers.get('X-119-Data-Stale') === 'true';
  return {
    status: stale ? 'degraded' : 'passed',
    cachedAt: response.headers.get('X-119-Data-Cached-At') || '',
  };
}

async function runCheck(check) {
  const attempts = check.severity === 'critical' ? 3 : 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestOnce(check);
      if (result.status === 'degraded') {
        const age = result.cachedAt ? ` (cached ${result.cachedAt})` : '';
        console.warn(`degraded ${check.name}${age}`);
      } else {
        console.log(`ok ${check.name}`);
      }
      return { ...check, ...result };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(500 * attempt);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`fail ${check.name}: ${message}`);
  return { ...check, status: 'failed', message };
}

async function runWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const results = await runWithConcurrency(checks, CONCURRENCY, runCheck);
const failures = results.filter(result => result.status === 'failed');
const degraded = results.filter(result => result.status === 'degraded');
const blockingFailures = mode === 'deploy'
  ? failures.filter(result => result.severity === 'critical')
  : [...failures, ...degraded];

const summaryLines = [
  '## Production API smoke',
  '',
  `- Mode: ${mode}`,
  `- Passed: ${results.length - failures.length - degraded.length}/${results.length}`,
  `- Degraded (last-known-good): ${degraded.length}`,
  `- Failed: ${failures.length}`,
  '',
  '| Endpoint | Importance | Result |',
  '|---|---|---|',
  ...results.map(result => `| ${result.name} | ${result.severity} | ${result.status} |`),
  '',
];

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join('\n')}\n`);
}

if (degraded.length > 0) {
  console.warn(`::warning::${degraded.length} endpoint(s) served last-known-good data.`);
}
if (failures.length > 0 && mode === 'deploy') {
  const standardFailures = failures.filter(result => result.severity === 'standard');
  if (standardFailures.length > 0) {
    console.warn(`::warning::${standardFailures.length} standard endpoint(s) failed but did not block deployment.`);
  }
}

if (blockingFailures.length > 0) {
  console.error(`Production API smoke test failed (${blockingFailures.length} blocking issue(s), mode=${mode}).`);
  process.exit(1);
}

console.log(`Production API smoke test passed (${results.length} checks, mode=${mode}, degraded=${degraded.length}).`);
