import { appendFile } from 'node:fs/promises';
import {
  isRoadDisasterResponse,
  isWorkerHealthResponse,
} from './production-deploy-contracts.mjs';

const DEFAULT_API_BASE = 'https://119-helper-api.teemozipsa.workers.dev';
const DEFAULT_ORIGIN = 'https://119.teemozipsa.com';
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 25_000;
const DEPLOY_READINESS_ATTEMPTS = 18;
const DEPLOY_READINESS_DELAY_MS = 5_000;
// The public Emergency Statistics API rejects short request bursts. Keep the
// regional contract probes below its per-second limit while still running the
// rest of the smoke suite concurrently.
const EMERGENCY_STATS_CONTRACT_PACING_MS = 1_100;
const EMERGENCY_STATS_CONTRACT_ATTEMPTS = 4;
const EMERGENCY_STATS_CONTRACT_RETRY_DELAY_MS = 1_500;

const apiBase = process.env.VITE_API_BASE || process.env.API_BASE || DEFAULT_API_BASE;
const appToken = process.env.VITE_APP_TOKEN || process.env.APP_ACCESS_TOKEN || '';
const origin = process.env.SMOKE_ORIGIN || DEFAULT_ORIGIN;
const mode = process.env.SMOKE_MODE === 'deploy' ? 'deploy' : 'scheduled';
const expectedWorkerVersion = process.env.EXPECTED_WORKER_VERSION?.trim() || '';

if (!appToken) {
  console.error('VITE_APP_TOKEN or APP_ACCESS_TOKEN is required for production API smoke tests.');
  process.exit(1);
}
if (mode === 'deploy' && !expectedWorkerVersion) {
  console.error('EXPECTED_WORKER_VERSION is required for deploy smoke tests.');
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

function xmlTagValues(data, tag) {
  if (!hasXmlEnvelope(data)) return [];
  const pattern = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'gi');
  return [...data.xml.matchAll(pattern)].map(match => match[1].trim());
}

function xmlItemCount(data) {
  if (!hasXmlEnvelope(data)) return 0;
  return (data.xml.match(/<item>/gi) || []).length;
}

function xmlTotalCount(data) {
  const value = xmlTagValues(data, 'totalCount')[0];
  return Number(value);
}

function hasNonEmptyXmlItems(data) {
  return hasXmlEnvelope(data) && xmlItemCount(data) > 0 && xmlTotalCount(data) > 0;
}

function isFormerGwangjuAddress(value) {
  return /^(?:전남광주통합특별시|광주광역시)\s+(?:동구|서구|남구|북구|광산구)(?:\s|$)/.test(value);
}

function hasPaginatedItems(data) {
  return isRecord(data) && Array.isArray(data.items) && Number.isFinite(Number(data.totalCount));
}

function isSuccessfulSafetydata(data) {
  return isRecord(data) && isRecord(data.header) && /^0+$/.test(String(data.header.resultCode));
}

const emergencyRegionContracts = [
  ['서울', '서울소방재난본부'],
  ['부산', '부산소방본부'],
  ['대구', '대구소방본부'],
  ['인천', '인천소방본부'],
  ['광주', '광주소방본부'],
  ['대전', '대전소방본부'],
  ['울산', '울산소방본부'],
  ['세종', '세종소방본부'],
  ['경기', '경기소방본부'],
  ['강원', '강원소방본부'],
  ['충북', '충북소방본부'],
  ['충남', '충남소방본부'],
  ['전북', '전북소방본부'],
  ['전남', '전남소방본부'],
  ['경북', '경북소방본부'],
  ['경남', '경남소방본부'],
  ['제주', '제주소방본부'],
];

const checks = [
  {
    name: 'health',
    severity: 'critical',
    url: endpoint('/api/health'),
    validate: data => isWorkerHealthResponse(
      data,
      mode === 'deploy' ? expectedWorkerVersion : undefined,
    ),
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
    name: 'er-beds-seoul',
    severity: 'critical',
    url: endpoint('/api/er/beds', { sido: '서울특별시' }),
    validate: hasNonEmptyXmlItems,
  },
  {
    name: 'er-beds-gwangju-merged',
    severity: 'critical',
    url: endpoint('/api/er/beds', { sido: '전남광주통합특별시' }),
    validate: data => hasNonEmptyXmlItems(data)
      && xmlTagValues(data, 'hpid').some(Boolean),
  },
  {
    name: 'er-facilities-gwangju-complete',
    severity: 'critical',
    url: endpoint('/api/er/list', { sido: '전남광주통합특별시' }),
    validate: data => hasNonEmptyXmlItems(data)
      && xmlItemCount(data) >= xmlTotalCount(data)
      && xmlTagValues(data, 'dutyAddr').some(isFormerGwangjuAddress),
  },
  {
    name: 'aed-nearby',
    severity: 'critical',
    url: endpoint('/api/aed/nearby', {
      lat: 35.1595,
      lng: 126.8526,
      numOfRows: 1,
      pageNo: 1,
    }),
    validate: hasXmlEnvelope,
  },
  {
    name: 'dam-discharge',
    severity: 'critical',
    url: endpoint('/api/dam-discharge', { days: 2, numOfRows: 1, pageNo: 1 }),
    validate: data => isRecord(data)
      && data.status === 'active'
      && data.format === 'xml'
      && typeof data.payload === 'string'
      && data.payload.trimStart().startsWith('<'),
  },
  {
    name: 'road-disasters-gwangju',
    severity: 'standard',
    url: endpoint('/api/road-disasters', {
      lat: 35.1595,
      lng: 126.8526,
      radiusKm: 5,
      eventType: 'all',
      days: 7,
      regionName: '전남광주통합특별시',
      districtName: '서구',
    }),
    validate: isRoadDisasterResponse,
  },
  {
    name: 'air-quality',
    severity: 'critical',
    url: endpoint('/api/air', { sido: '서울' }),
    validate: Array.isArray,
  },
  {
    name: 'air-quality-gwangju',
    severity: 'critical',
    url: endpoint('/api/air', { sido: '광주' }),
    validate: data => Array.isArray(data) && data.length > 0,
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
    url: endpoint('/api/multiuse', { year: 2025, ctprvnNm: '전남광주통합특별시' }),
    validate: data => Array.isArray(data)
      && data.length === 1
      && data[0]?.소방본부 === '광주광역시'
      && data[0]?.연도 === '2025'
      && Object.entries(data[0])
        .filter(([key, value]) => key !== '연도' && typeof value === 'number')
        .reduce((sum, [, value]) => sum + value, 0) === 3_873,
  },
  {
    name: 'emergency-latest-month',
    severity: 'standard',
    url: endpoint('/api/emergency/stats/availability'),
    validate: data => isRecord(data)
      && /^\d{6}$/.test(String(data.latestYm))
      && /^\d{6}$/.test(String(data.currentYm))
      && typeof data.checkedAt === 'string'
      && typeof data.sourceUrl === 'string',
  },
  ...emergencyRegionContracts.map(([region, headquarters]) => ({
    name: `emergency-stats-${region}-contract`,
    severity: 'standard',
    url: endpoint('/api/emergency/stats/activity', {
      sido: region,
      rcptYm: '202512',
      numOfRows: 100,
      pageNo: 1,
    }),
    validate: data => hasPaginatedItems(data)
      && Number(data.totalCount) > 0
      && data.items.some(item => isRecord(item)
        && item.sidoHqOgidNm === headquarters
        && Number(item.gutCo) > 0),
  })),
  {
    name: 'emergency-info-current-vehicle-contract',
    severity: 'standard',
    url: endpoint('/api/emergency/info/vehicles', { sido: '광주', numOfRows: 100, pageNo: 1 }),
    validate: data => hasPaginatedItems(data)
      && Number(data.totalCount) > 0
      && data.items.some(item => isRecord(item)
        && item.sidoHqOgidNm === '광주소방본부'
        && typeof item.vhclNo === 'string'),
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
    name: 'ambulance-gwangju-merged',
    severity: 'standard',
    url: endpoint('/api/ambulance', { Q0: '전남광주통합특별시' }),
    validate: data => hasNonEmptyXmlItems(data)
      && xmlTagValues(data, 'dutyAddr').some(isFormerGwangjuAddress),
  },
  {
    name: 'consumer-hazard',
    severity: 'standard',
    url: endpoint('/api/consumer-hazard'),
    validate: data => isRecord(data) && isRecord(data.response),
  },
];

function isEmergencyStatsContractCheck(check) {
  return check.name.startsWith('emergency-stats-') && check.name.endsWith('-contract');
}

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
  const isRateLimitedProbe = isEmergencyStatsContractCheck(check);
  const attempts = isRateLimitedProbe
    ? EMERGENCY_STATS_CONTRACT_ATTEMPTS
    : check.severity === 'critical' ? 3 : 2;
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
        const retryDelay = isRateLimitedProbe
          ? EMERGENCY_STATS_CONTRACT_RETRY_DELAY_MS * attempt
          : 500 * attempt;
        await delay(retryDelay);
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

async function runWithPacing(items, pacingMs, task) {
  const results = [];

  for (let index = 0; index < items.length; index += 1) {
    results.push(await task(items[index]));
    if (index < items.length - 1) {
      await delay(pacingMs);
    }
  }

  return results;
}

async function waitForExpectedWorker() {
  if (mode !== 'deploy') return;

  const healthCheck = checks.find(check => check.name === 'health');
  if (!healthCheck) throw new Error('Health check is missing.');

  let lastError;
  for (let attempt = 1; attempt <= DEPLOY_READINESS_ATTEMPTS; attempt += 1) {
    try {
      await requestOnce(healthCheck);
      console.log(`Worker version ready: ${expectedWorkerVersion}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < DEPLOY_READINESS_ATTEMPTS) {
        console.log(
          `Waiting for Worker version ${expectedWorkerVersion} `
            + `(${attempt}/${DEPLOY_READINESS_ATTEMPTS})`,
        );
        await delay(DEPLOY_READINESS_DELAY_MS);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Worker version ${expectedWorkerVersion} did not become observable: ${message}`,
  );
}

try {
  await waitForExpectedWorker();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const emergencyStatsChecks = checks.filter(isEmergencyStatsContractCheck);
const otherChecks = checks.filter(check => !isEmergencyStatsContractCheck(check));
const otherResults = await runWithConcurrency(otherChecks, CONCURRENCY, runCheck);
console.log(
  `Pacing ${emergencyStatsChecks.length} regional emergency-stat checks `
    + `by ${EMERGENCY_STATS_CONTRACT_PACING_MS}ms to respect the upstream API limit.`,
);
const emergencyStatsResults = await runWithPacing(
  emergencyStatsChecks,
  EMERGENCY_STATS_CONTRACT_PACING_MS,
  runCheck,
);
const results = [...otherResults, ...emergencyStatsResults];
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
