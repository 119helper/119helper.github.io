import { describe, expect, it } from 'vitest';
import { classifyStart, classifyJumpStart } from './triage';

describe('classifyStart (성인 START)', () => {
  it('walking patient → green', () => {
    expect(classifyStart({ canWalk: true })).toBe('green');
  });

  it('not breathing even after airway → black', () => {
    expect(classifyStart({ canWalk: false, breathing: false, breathingAfterAirway: false })).toBe('black');
  });

  it('breathing only after airway → red', () => {
    expect(classifyStart({ canWalk: false, breathing: false, breathingAfterAirway: true })).toBe('red');
  });

  it('respiratory rate over 30 → red', () => {
    expect(classifyStart({ canWalk: false, breathing: true, respRateOver30: true })).toBe('red');
  });

  it('poor perfusion → red', () => {
    expect(classifyStart({ canWalk: false, breathing: true, respRateOver30: false, perfusionOk: false })).toBe('red');
  });

  it('fails to obey commands → red', () => {
    expect(
      classifyStart({ canWalk: false, breathing: true, respRateOver30: false, perfusionOk: true, obeysCommands: false }),
    ).toBe('red');
  });

  it('stable + obeys commands → yellow', () => {
    expect(
      classifyStart({ canWalk: false, breathing: true, respRateOver30: false, perfusionOk: true, obeysCommands: true }),
    ).toBe('yellow');
  });

  it('returns null until enough answers are given', () => {
    expect(classifyStart({})).toBeNull();
    expect(classifyStart({ canWalk: false, breathing: true })).toBeNull();
  });
});

describe('classifyJumpStart (소아 JumpSTART)', () => {
  it('walking child → green', () => {
    expect(classifyJumpStart({ canWalk: true })).toBe('green');
  });

  it('apneic with no pulse → black', () => {
    expect(
      classifyJumpStart({ canWalk: false, breathing: false, breathingAfterAirway: false, pulsePresent: false }),
    ).toBe('black');
  });

  it('apneic, pulse present, no breathing after 5 breaths → black', () => {
    expect(
      classifyJumpStart({
        canWalk: false,
        breathing: false,
        breathingAfterAirway: false,
        pulsePresent: true,
        breathingAfter5Breaths: false,
      }),
    ).toBe('black');
  });

  it('apneic, pulse present, breathes after 5 breaths → red', () => {
    expect(
      classifyJumpStart({
        canWalk: false,
        breathing: false,
        breathingAfterAirway: false,
        pulsePresent: true,
        breathingAfter5Breaths: true,
      }),
    ).toBe('red');
  });

  it('abnormal respiratory rate → red', () => {
    expect(classifyJumpStart({ canWalk: false, breathing: true, respRate15to45: false })).toBe('red');
  });

  it('AVPU appropriate → yellow', () => {
    expect(
      classifyJumpStart({
        canWalk: false,
        breathing: true,
        respRate15to45: true,
        pulsePalpable: true,
        avpuAppropriate: true,
      }),
    ).toBe('yellow');
  });

  it('AVPU inappropriate (P-posturing/U) → red', () => {
    expect(
      classifyJumpStart({
        canWalk: false,
        breathing: true,
        respRate15to45: true,
        pulsePalpable: true,
        avpuAppropriate: false,
      }),
    ).toBe('red');
  });
});
