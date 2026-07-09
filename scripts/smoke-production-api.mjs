const DEFAULT_API_BASE = 'https://119-helper-api.teemozipsa.workers.dev';
const DEFAULT_ORIGIN = 'https://119helper.github.io';

const apiBase = process.env.VITE_API_BASE || process.env.API_BASE || DEFAULT_API_BASE;
const appToken = process.env.VITE_APP_TOKEN || process.env.APP_ACCESS_TOKEN || '';
const origin = process.env.SMOKE_ORIGIN || DEFAULT_ORIGIN;

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

const checks = [
  {
    name: 'health',
    url: endpoint('/api/health'),
    validate(data) {
      return isRecord(data) && data.status === 'ok';
    },
  },
  {
    name: 'weather-now',
    url: endpoint('/api/weather/now', { nx: 60, ny: 127 }),
    validate(data) {
      return Array.isArray(data) && data.length > 0;
    },
  },
  {
    name: 'er-beds',
    url: endpoint('/api/er/beds', { sido: '서울특별시' }),
    validate(data) {
      return hasXmlEnvelope(data);
    },
  },
  {
    name: 'air-quality',
    url: endpoint('/api/air', { sido: '서울' }),
    validate(data) {
      return Array.isArray(data);
    },
  },
  {
    name: 'holiday',
    url: endpoint('/api/holiday', { year: new Date().getFullYear(), month: 1 }),
    validate(data) {
      return hasXmlEnvelope(data);
    },
  },
  {
    name: 'disaster-msg',
    url: endpoint('/api/disaster-msg', { numOfRows: 1, pageNo: 1 }),
    validate(data) {
      return Array.isArray(data);
    },
  },
  {
    name: 'fire-info',
    url: endpoint('/api/fire/station', { numOfRows: 1, pageNo: 1 }),
    validate(data) {
      return hasPaginatedItems(data);
    },
  },
  {
    name: 'fire-damage',
    url: endpoint('/api/fire-damage', {
      numOfRows: 1,
      pageNo: 1,
      sidoNm: '서울특별시',
      startYmd: '20230101',
      endYmd: '20231231',
    }),
    validate(data) {
      return hasPaginatedItems(data);
    },
  },
  {
    name: 'multiuse',
    url: endpoint('/api/multiuse', { year: 2024, page: 1, perPage: 1 }),
    validate(data) {
      return Array.isArray(data);
    },
  },
  {
    name: 'forest-fire-risk',
    url: endpoint('/api/forest-fire-risk', { numOfRows: 1, pageNo: 1, excludeForecast: 1 }),
    validate(data) {
      return hasPaginatedItems(data) && typeof data.source === 'string';
    },
  },
  {
    name: 'wildfire',
    url: endpoint('/api/wildfire', { numOfRows: 1, pageNo: 1 }),
    validate(data) {
      return isRecord(data) && isRecord(data.header) && /^0+$/.test(String(data.header.resultCode));
    },
  },
  {
    name: 'ambulance',
    url: endpoint('/api/ambulance', { Q0: '서울특별시' }),
    validate(data) {
      return hasXmlEnvelope(data);
    },
  },
  {
    name: 'consumer-hazard',
    url: endpoint('/api/consumer-hazard'),
    validate(data) {
      return isRecord(data) && isRecord(data.response);
    },
  },
  {
    name: 'fire-annual-years',
    url: endpoint('/api/fire-annual/years'),
    validate(data) {
      return isRecord(data) && Array.isArray(data.years) && data.years.length > 0 && typeof data.latestYear === 'string';
    },
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

const failures = [];

for (const check of checks) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
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

    console.log(`ok ${check.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${check.name}: ${message}`);
    console.error(`fail ${check.name}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error(`Production API smoke test failed (${failures.length}/${checks.length}).`);
  process.exit(1);
}

console.log(`Production API smoke test passed (${checks.length}/${checks.length}).`);
