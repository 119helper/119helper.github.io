import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchJsonWithRetry } from './fetch-json-with-retry.mjs';

test('JSON 원천의 대체 호스트를 순서대로 사용한다', async () => {
  const calls = [];
  const result = await fetchJsonWithRetry(
    ['https://primary.test/data', 'http://fallback.test/data'],
    {
      fetchImpl: async url => {
        calls.push(String(url));
        if (String(url).startsWith('https://')) throw new Error('connect timeout');
        return new Response(JSON.stringify({ ok: true }));
      },
      delayImpl: async () => undefined,
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    'https://primary.test/data',
    'http://fallback.test/data',
  ]);
});

test('모든 호스트가 실패하면 다음 시도에서 다시 조회한다', async () => {
  let callCount = 0;
  const delays = [];
  const result = await fetchJsonWithRetry(
    ['https://primary.test/data'],
    {
      attempts: 3,
      fetchImpl: async () => {
        callCount += 1;
        if (callCount < 3) return new Response('temporary failure', { status: 503 });
        return new Response(JSON.stringify({ recovered: true }));
      },
      delayImpl: async ms => { delays.push(ms); },
    },
  );

  assert.deepEqual(result, { recovered: true });
  assert.equal(callCount, 3);
  assert.deepEqual(delays, [300, 600]);
});

test('최종 실패에는 원천 이름과 마지막 오류를 남긴다', async () => {
  await assert.rejects(
    fetchJsonWithRetry(['https://primary.test/data'], {
      attempts: 2,
      label: '지진해일 메타데이터',
      fetchImpl: async () => { throw new Error('connect timeout'); },
      delayImpl: async () => undefined,
    }),
    /지진해일 메타데이터: connect timeout/,
  );
});
