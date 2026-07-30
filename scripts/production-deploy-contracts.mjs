import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROAD_DISASTER_TYPES = new Set([
  'underpass-flooding',
  'river-flood',
  'sinkhole',
  'fire',
  'unknown',
]);
const ROAD_CONTROL_TYPES = new Set([
  'unknown',
  'none',
  'partial',
  'lane-partial',
  'full',
  'detour',
  'contraflow',
]);
const GEOMETRY_TYPES = new Set(['Point', 'LineString', 'Polygon', 'Unknown']);
const CLOUDFLARE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && isFiniteNumber(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && isFiniteNumber(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function isRoadDisasterItem(item) {
  return isRecord(item)
    && typeof item.eventId === 'string'
    && ROAD_DISASTER_TYPES.has(item.eventType)
    && typeof item.eventTypeCode === 'string'
    && isNullableString(item.eventDetailType)
    && isNullableString(item.status)
    && isNullableString(item.occurredAt)
    && isNullableString(item.endedAt)
    && isNullableString(item.facilityName)
    && isNullableString(item.facilityExtent)
    && isRecord(item.geometry)
    && GEOMETRY_TYPES.has(item.geometry.type)
    && Array.isArray(item.geometry.coordinates)
    && item.geometry.coordinates.every(isCoordinate)
    && isNullableString(item.geometry.raw)
    && isRecord(item.road)
    && isStringArray(item.road.linkIds)
    && isStringArray(item.road.names)
    && isNullableString(item.road.number)
    && isNullableString(item.road.direction)
    && isRecord(item.control)
    && ROAD_CONTROL_TYPES.has(item.control.type)
    && isNullableString(item.control.typeCode)
    && isNullableString(item.control.blockedLanes)
    && isNullableString(item.message);
}

export function isRoadDisasterResponse(data) {
  if (!isRecord(data)
    || data.source !== '국토교통부 국가교통정보센터'
    || data.sourceUrl !== 'https://its.go.kr/opendata/opendataList?service=disaster'
    || typeof data.retrievedAt !== 'string'
    || Number.isNaN(Date.parse(data.retrievedAt))
    || !isRecord(data.query)
    || data.query.lat !== 35.1595
    || data.query.lng !== 126.8526
    || data.query.radiusKm !== 5
    || data.query.eventType !== 'all'
    || typeof data.query.startDate !== 'string'
    || !/^\d{8}$/.test(data.query.startDate)
    || typeof data.query.endDate !== 'string'
    || !/^\d{8}$/.test(data.query.endDate)
    || !isRecord(data.query.bounds)
    || !['minX', 'maxX', 'minY', 'maxY']
      .every(key => isFiniteNumber(data.query.bounds[key]))
    || data.query.bounds.minX >= data.query.bounds.maxX
    || data.query.bounds.minY >= data.query.bounds.maxY
    || data.query.lng < data.query.bounds.minX
    || data.query.lng > data.query.bounds.maxX
    || data.query.lat < data.query.bounds.minY
    || data.query.lat > data.query.bounds.maxY
    || !Number.isInteger(data.totalCount)
    || data.totalCount < 0
    || typeof data.truncated !== 'boolean'
    || !Array.isArray(data.items)
    || data.items.length > data.totalCount
    || (!data.truncated && data.items.length !== data.totalCount)
    || (data.totalCount > 0 && data.items.length === 0)) {
    return false;
  }

  return data.items.every(isRoadDisasterItem);
}

export function isWorkerHealthResponse(data, expectedWorkerVersion = undefined) {
  if (!isRecord(data)
    || data.status !== 'ok'
    || typeof data.version !== 'string'
    || typeof data.timestamp !== 'string'
    || Number.isNaN(Date.parse(data.timestamp))) {
    return false;
  }

  if (expectedWorkerVersion === undefined) {
    return data.workerVersion === undefined
      || data.workerVersion === null
      || (typeof data.workerVersion === 'string'
        && CLOUDFLARE_ID_PATTERN.test(data.workerVersion));
  }

  return typeof data.workerVersion === 'string'
    && CLOUDFLARE_ID_PATTERN.test(data.workerVersion)
    && data.workerVersion === expectedWorkerVersion;
}

export function activeWorkerVersionId(status) {
  if (!isRecord(status) || !Array.isArray(status.versions) || status.versions.length !== 1) {
    throw new Error('Expected exactly one active Worker version; split deployments cannot be rolled back automatically.');
  }

  const [active] = status.versions;
  if (!isRecord(active)
    || active.percentage !== 100
    || typeof active.version_id !== 'string'
    || !CLOUDFLARE_ID_PATTERN.test(active.version_id)) {
    throw new Error('Expected one valid Worker version receiving exactly 100% of traffic.');
  }

  return active.version_id;
}

export function workerDeploymentId(status) {
  activeWorkerVersionId(status);
  if (typeof status.id !== 'string' || !CLOUDFLARE_ID_PATTERN.test(status.id)) {
    throw new Error('Expected a valid active Worker deployment ID.');
  }
  return status.id;
}

export function assertDirectWorkerDeploymentSuccessor(
  deployments,
  previousDeploymentId,
  deployedDeploymentId,
) {
  if (!Array.isArray(deployments)) {
    throw new Error('Expected Wrangler deployment history to be an array.');
  }

  const previousIndex = deployments.findIndex(item =>
    isRecord(item) && item.id === previousDeploymentId);
  const deployedIndex = deployments.findIndex(item =>
    isRecord(item) && item.id === deployedDeploymentId);
  if (previousIndex < 0 || deployedIndex !== previousIndex + 1) {
    throw new Error(
      'Worker deployment history changed between capture and deploy; automatic rollback is unsafe.',
    );
  }
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const data = JSON.parse(input);

  if (command === 'active-version') {
    process.stdout.write(`${activeWorkerVersionId(data)}\n`);
    return;
  }

  if (command === 'deployment-id') {
    process.stdout.write(`${workerDeploymentId(data)}\n`);
    return;
  }

  if (command === 'assert-direct-successor' && args.length === 2) {
    assertDirectWorkerDeploymentSuccessor(data, args[0], args[1]);
    return;
  }

  throw new Error(
    'Usage: node scripts/production-deploy-contracts.mjs '
      + '<active-version|deployment-id|assert-direct-successor>',
  );
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
