import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  activeWorkerVersionId,
  assertDirectWorkerDeploymentSuccessor,
  isRoadDisasterResponse,
  isWorkerHealthResponse,
  workerDeploymentId,
} from './production-deploy-contracts.mjs';

const VERSION_ID = 'd70dc035-4df7-4fe7-a5cc-8ebf2ec70345';
const PREVIOUS_DEPLOYMENT_ID = '181cf721-70a7-4d5f-b74f-4e171d331d86';
const DEPLOYED_DEPLOYMENT_ID = '281cf721-70a7-4d5f-b74f-4e171d331d86';
const SCRIPT_PATH = fileURLToPath(new URL('./production-deploy-contracts.mjs', import.meta.url));

function validRoadDisasterResponse() {
  return {
    source: '국토교통부 국가교통정보센터',
    sourceUrl: 'https://its.go.kr/opendata/opendataList?service=disaster',
    retrievedAt: '2026-07-30T14:30:00.000Z',
    query: {
      lat: 35.1595,
      lng: 126.8526,
      radiusKm: 5,
      eventType: 'all',
      startDate: '20260724',
      endDate: '20260730',
      bounds: {
        minX: 126.797735,
        maxX: 126.907465,
        minY: 35.114584,
        maxY: 35.204416,
      },
    },
    totalCount: 1,
    truncated: false,
    items: [{
      eventId: 'event-1',
      eventType: 'underpass-flooding',
      eventTypeCode: 'D03',
      eventDetailType: null,
      status: '진행',
      occurredAt: '2026-07-30T12:00:00+09:00',
      endedAt: null,
      facilityName: '지하차도',
      facilityExtent: null,
      geometry: {
        type: 'Point',
        coordinates: [[126.8526, 35.1595]],
        raw: 'POINT (126.8526 35.1595)',
      },
      road: {
        linkIds: ['link-1'],
        names: ['금남로'],
        number: null,
        direction: '동',
      },
      control: {
        type: 'full',
        typeCode: '4',
        blockedLanes: '전 차로',
      },
      message: null,
    }],
  };
}

test('road-disaster smoke contract accepts the complete frontend response shape', () => {
  assert.equal(isRoadDisasterResponse(validRoadDisasterResponse()), true);

  const empty = validRoadDisasterResponse();
  empty.totalCount = 0;
  empty.items = [];
  assert.equal(isRoadDisasterResponse(empty), true);
});

test('road-disaster smoke contract rejects invalid nested frontend fields', () => {
  const invalidCases = [
    response => { response.query.startDate = '20260730000000'; },
    response => { response.query.bounds.minX = '126.7'; },
    response => { response.items[0].eventType = 'flood'; },
    response => { response.items[0].eventDetailType = undefined; },
    response => { response.items[0].geometry.type = 'MultiPoint'; },
    response => { response.items[0].geometry.coordinates = [[126.8, 35.1, 0]]; },
    response => { response.items[0].road.names = [119]; },
    response => { response.items[0].control.type = 'closed'; },
    response => { response.items[0].message = 119; },
    response => { response.totalCount = 2; response.truncated = false; },
  ];

  for (const makeInvalid of invalidCases) {
    const response = validRoadDisasterResponse();
    makeInvalid(response);
    assert.equal(isRoadDisasterResponse(response), false);
  }
});

test('Worker health contract identifies the exact deployed version', () => {
  const health = {
    status: 'ok',
    version: '1.0.0',
    workerVersion: VERSION_ID,
    timestamp: '2026-07-30T15:09:20.000Z',
  };

  assert.equal(isWorkerHealthResponse(health), true);
  assert.equal(isWorkerHealthResponse(health, VERSION_ID), true);
  assert.equal(
    isWorkerHealthResponse(health, '6f678d0e-111c-4916-a9aa-4aa7f50c26a3'),
    false,
  );
  assert.equal(isWorkerHealthResponse({ ...health, workerVersion: null }), true);
  assert.equal(isWorkerHealthResponse({ ...health, workerVersion: null }, VERSION_ID), false);
  assert.equal(isWorkerHealthResponse({
    status: 'ok',
    version: '1.0.0',
    timestamp: health.timestamp,
  }), true);
  assert.equal(isWorkerHealthResponse({ ...health, workerVersion: 'invalid' }), false);
  assert.equal(isWorkerHealthResponse({ ...health, timestamp: 'not-a-date' }), false);
});

test('active Worker version guard accepts only one version at 100 percent', () => {
  const status = {
    id: PREVIOUS_DEPLOYMENT_ID,
    versions: [{ version_id: VERSION_ID, percentage: 100 }],
  };
  assert.equal(activeWorkerVersionId(status), VERSION_ID);
  assert.equal(workerDeploymentId(status), PREVIOUS_DEPLOYMENT_ID);

  assert.throws(
    () => activeWorkerVersionId({
      versions: [
        { version_id: VERSION_ID, percentage: 90 },
        { version_id: '6f678d0e-111c-4916-a9aa-4aa7f50c26a3', percentage: 10 },
      ],
    }),
    /split deployments/,
  );
  assert.throws(
    () => activeWorkerVersionId({
      versions: [{ version_id: VERSION_ID, percentage: 99.9 }],
    }),
    /exactly 100%/,
  );
  assert.throws(
    () => activeWorkerVersionId({
      versions: [{ version_id: 'not-a-version-id', percentage: 100 }],
    }),
    /valid Worker version/,
  );
});

test('deployment transition guard rejects intervening secret or manual deployments', () => {
  const interveningDeploymentId = '381cf721-70a7-4d5f-b74f-4e171d331d86';
  assert.doesNotThrow(() => assertDirectWorkerDeploymentSuccessor(
    [
      { id: PREVIOUS_DEPLOYMENT_ID },
      { id: DEPLOYED_DEPLOYMENT_ID },
    ],
    PREVIOUS_DEPLOYMENT_ID,
    DEPLOYED_DEPLOYMENT_ID,
  ));

  assert.throws(
    () => assertDirectWorkerDeploymentSuccessor(
      [
        { id: PREVIOUS_DEPLOYMENT_ID },
        { id: interveningDeploymentId },
        { id: DEPLOYED_DEPLOYMENT_ID },
      ],
      PREVIOUS_DEPLOYMENT_ID,
      DEPLOYED_DEPLOYMENT_ID,
    ),
    /automatic rollback is unsafe/,
  );
});

test('CLI reads deployment JSON from stdin', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, 'active-version'], {
    input: JSON.stringify({
      id: PREVIOUS_DEPLOYMENT_ID,
      versions: [{ version_id: VERSION_ID, percentage: 100 }],
    }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), VERSION_ID);
});
