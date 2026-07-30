import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprintTsunamiShelters,
  tsunamiShelterId,
} from './tsunami-data-integrity.mjs';

const FIRST = {
  ARCD: '2600000000',
  SHNTDTR_SN: 10,
  SHNT_PLACE_SN: 2,
  SHNT_PLACE_NM: '첫 번째',
  LA: 35.1,
  LO: 129.1,
};

const SECOND = {
  ARCD: '5100000000',
  SHNTDTR_SN: 20,
  SHNT_PLACE_SN: 1,
  SHNT_PLACE_NM: '두 번째',
  LA: 37.1,
  LO: 128.1,
};

test('복합 식별자를 안정적으로 만든다', () => {
  assert.equal(tsunamiShelterId(FIRST), '2600000000:10:2');
});

test('행 순서와 객체 속성 순서가 달라도 같은 지문을 만든다', () => {
  const reorderedFirst = {
    LO: 129.1,
    LA: 35.1,
    SHNT_PLACE_NM: '첫 번째',
    SHNT_PLACE_SN: 2,
    SHNTDTR_SN: 10,
    ARCD: '2600000000',
  };

  assert.equal(
    fingerprintTsunamiShelters([FIRST, SECOND]),
    fingerprintTsunamiShelters([SECOND, reorderedFirst]),
  );
});

test('한 필드라도 바뀌면 지문이 달라진다', () => {
  assert.notEqual(
    fingerprintTsunamiShelters([FIRST]),
    fingerprintTsunamiShelters([{ ...FIRST, SHNT_PLACE_NM: '변경됨' }]),
  );
});

test('중복 또는 불완전한 복합 식별자는 거부한다', () => {
  assert.throws(
    () => fingerprintTsunamiShelters([FIRST, { ...FIRST }]),
    /중복/,
  );
  assert.throws(
    () => tsunamiShelterId({ ...FIRST, SHNT_PLACE_SN: null }),
    /비어/,
  );
});
