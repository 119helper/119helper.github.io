import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCompleteFetch, assertNoCityShrink } from './civil-shelter-integrity.mjs';

test('원본 totalCount만큼 받으면 통과한다', () => {
  assert.doesNotThrow(() => assertCompleteFetch({ totalCount: 18_832, receivedCount: 18_832 }));
  assert.doesNotThrow(() => assertCompleteFetch({ totalCount: 18_832, receivedCount: 18_840 }));
});

test('빈 페이지로 일부만 받으면 실패한다', () => {
  assert.throws(
    () => assertCompleteFetch({ totalCount: 18_832, receivedCount: 18_732 }),
    /18832건 중 18732건만 수신/,
  );
});

test('totalCount가 0이면 전체 삭제로 이어지지 않도록 실패한다', () => {
  assert.throws(() => assertCompleteFetch({ totalCount: 0, receivedCount: 0 }), /totalCount가 비정상/);
});

test('도시별 10% 이내 감소는 허용한다', () => {
  assert.doesNotThrow(() => assertNoCityShrink({ seoul: 2_900, sejong: 178 }, { seoul: 2_700, sejong: 161 }));
});

test('한 도시라도 급감하면 실패한다', () => {
  assert.throws(
    () => assertNoCityShrink({ seoul: 2_900, busan: 1_314 }, { seoul: 2_900, busan: 0 }),
    /busan 1314→0/,
  );
});

test('공식 축소를 확인한 수동 실행은 통과시킨다', () => {
  assert.doesNotThrow(() => assertNoCityShrink({ busan: 1_314 }, { busan: 0 }, { allowShrink: true }));
});

test('이전 집계가 없으면 첫 수집으로 보고 통과한다', () => {
  assert.doesNotThrow(() => assertNoCityShrink(undefined, { seoul: 1 }));
});
