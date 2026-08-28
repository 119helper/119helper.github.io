import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchWithRetry } from './fetch-with-retry.mjs';

test('연결 오류 뒤 새 timeout signal로 다시 시도한다', async () => {
  const signals = [];
  const delays = [];
  const retries = [];
  let calls = 0;
  const response = await fetchWithRetry('https://example.test/data.csv', {}, {
    fetchImpl: async (_url, init) => {
      calls += 1;
      signals.push(init.signal);
      if (calls === 1) throw new Error('connect timeout');
      return new Response('ok');
    },
    delayImpl: async ms => { delays.push(ms); },
    onRetry: context => { retries.push(context); },
  });

  assert.equal(await response.text(), 'ok');
  assert.equal(calls, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.deepEqual(delays, [1_000]);
  assert.equal(retries[0].attempt, 1);
});

test('429와 5xx 응답은 지수 백오프로 재시도한다', async () => {
  const delays = [];
  const statuses = [503, 429, 200];
  const response = await fetchWithRetry('https://example.test/data.csv', {}, {
    attempts: 3,
    fetchImpl: async () => new Response('temporary', { status: statuses.shift() }),
    delayImpl: async ms => { delays.push(ms); },
    onRetry: () => undefined,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test('재시도해도 해결되지 않는 4xx는 즉시 원천 이름과 함께 실패한다', async () => {
  let calls = 0;
  await assert.rejects(
    fetchWithRetry('https://example.test/data.csv', {}, {
      label: '지역 소방용수 원천',
      fetchImpl: async () => {
        calls += 1;
        return new Response('not found', { status: 404 });
      },
      delayImpl: async () => undefined,
      onRetry: () => undefined,
    }),
    /지역 소방용수 원천: .*HTTP 404 not found/,
  );
  assert.equal(calls, 1);
});
