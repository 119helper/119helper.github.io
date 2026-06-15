import { describe, expect, it } from 'vitest';
import { calculateDrugDose, calculateGCS, calculateAPGAR } from './emsCalculations';
import { EMS_DRUGS } from '../data/emsDrugs';

const epiCardiac = EMS_DRUGS.find(d => d.id === 'epinephrine-cardiac')!;
const epiAna = EMS_DRUGS.find(d => d.id === 'epinephrine-anaphylaxis')!;
const dextrose = EMS_DRUGS.find(d => d.id === 'dextrose10')!;

describe('calculateDrugDose', () => {
  it('computes weight-based dose and volume', () => {
    // 심정지 에피네프린 0.01mg/kg, 20kg → 0.2mg, 1:10,000(0.1mg/mL) → 2mL
    const r = calculateDrugDose(epiCardiac, 20)!;
    expect(r.doseAmount).toBeCloseTo(0.2, 3);
    expect(r.volumeMl).toBeCloseTo(2, 2);
    expect(r.cappedByMax).toBe(false);
  });

  it('applies max dose cap for large patients', () => {
    // 0.01mg/kg × 150kg = 1.5mg 이지만 최대 1mg 상한
    const r = calculateDrugDose(epiCardiac, 150)!;
    expect(r.doseAmount).toBe(1);
    expect(r.cappedByMax).toBe(true);
  });

  it('caps anaphylaxis epinephrine at 0.5mg', () => {
    const r = calculateDrugDose(epiAna, 80)!;
    expect(r.doseAmount).toBe(0.5);
    expect(r.cappedByMax).toBe(true);
  });

  it('returns null volume when concentration is zero', () => {
    const r = calculateDrugDose(dextrose, 10)!;
    expect(r.doseAmount).toBe(50);
    expect(r.volumeMl).toBeNull();
  });

  it('rejects non-positive or extreme weights', () => {
    expect(calculateDrugDose(epiCardiac, 0)).toBeNull();
    expect(calculateDrugDose(epiCardiac, -5)).toBeNull();
    expect(calculateDrugDose(epiCardiac, 400)).toBeNull();
  });
});

describe('calculateGCS', () => {
  it('sums and classifies a normal score', () => {
    expect(calculateGCS(4, 5, 6)).toEqual({ total: 15, severity: '경증' });
  });

  it('classifies severe injury', () => {
    expect(calculateGCS(1, 1, 4)).toEqual({ total: 6, severity: '중증' });
  });

  it('rejects out-of-range components', () => {
    expect(calculateGCS(5, 5, 6)).toBeNull();
    expect(calculateGCS(4, 0, 6)).toBeNull();
    expect(calculateGCS(4, 5, 7)).toBeNull();
  });
});

describe('calculateAPGAR', () => {
  it('sums a healthy newborn', () => {
    const r = calculateAPGAR({ appearance: 2, pulse: 2, grimace: 2, activity: 2, respiration: 2 })!;
    expect(r.total).toBe(10);
    expect(r.status).toBe('양호');
  });

  it('flags severe distress', () => {
    const r = calculateAPGAR({ appearance: 0, pulse: 1, grimace: 0, activity: 1, respiration: 1 })!;
    expect(r.total).toBe(3);
    expect(r.status).toBe('심한 곤란');
  });

  it('rejects out-of-range values', () => {
    expect(calculateAPGAR({ appearance: 3, pulse: 2, grimace: 2, activity: 2, respiration: 2 })).toBeNull();
  });
});
