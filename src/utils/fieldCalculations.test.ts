import { describe, expect, it } from 'vitest';
import { ERG_CHEMICALS } from '../data/ergChemicals';
import {
  buildHazmatProtectiveZonePath,
  calculateAirTankSeconds,
  calculateHoseDeployment,
  calculateWaterPressure,
  formatTimerSeconds,
  getDownwindBearing,
  getHazmatDistances,
  offsetLatLng,
} from './fieldCalculations';

describe('field calculations', () => {
  it('calculates required water pressure from floor count', () => {
    const result = calculateWaterPressure(10);

    expect(result).not.toBeNull();
    expect(result?.realHeadM).toBe(30);
    expect(result?.frictionLossM).toBe(4.5);
    expect(result?.safetyM).toBeCloseTo(6.95);
    expect(result?.totalHeadM).toBeCloseTo(76.45);
    expect(result?.totalPressureMPa).toBeCloseTo(0.750_0, 3);
    expect(result?.totalPressureKgfCm2).toBeCloseTo(7.645);
  });

  it('rejects unsafe water pressure inputs', () => {
    expect(calculateWaterPressure(0)).toBeNull();
    expect(calculateWaterPressure(201)).toBeNull();
    expect(calculateWaterPressure(1.5)).toBeNull();
  });

  it('calculates hose deployment count with reserve', () => {
    const result = calculateHoseDeployment(45, 3);

    expect(result).toEqual({
      distanceM: 45,
      floors: 3,
      verticalDistanceM: 9,
      totalDistanceM: 54,
      hoseCount: 3,
      reserveHoseCount: 1,
      totalHoseCount: 4,
    });
  });

  it('rejects invalid hose deployment inputs', () => {
    expect(calculateHoseDeployment(-1, 0)).toBeNull();
    expect(calculateHoseDeployment(10, -1)).toBeNull();
    expect(calculateHoseDeployment(10, 1.2)).toBeNull();
  });

  it('calculates air tank remaining seconds from charge pressure', () => {
    expect(calculateAirTankSeconds(300)).toBe(30 * 60);
    expect(calculateAirTankSeconds(150)).toBe(15 * 60);
    expect(calculateAirTankSeconds(9)).toBeNull();
    expect(calculateAirTankSeconds(301)).toBeNull();
  });

  it('formats timer seconds without negative display values', () => {
    expect(formatTimerSeconds(65)).toBe('01:05');
    expect(formatTimerSeconds(-1)).toBe('00:00');
  });

  it('selects ERG isolation and protection distances by spill size', () => {
    const ammonia = ERG_CHEMICALS.UN1005;

    expect(getHazmatDistances(ammonia, 'small')).toEqual({
      isolationM: 30,
      protectionM: 100,
    });
    expect(getHazmatDistances(ammonia, 'large')).toEqual({
      isolationM: 300,
      protectionM: 2300,
    });
  });

  it('converts wind-from bearing to downwind bearing', () => {
    expect(getDownwindBearing(0)).toBe(180);
    expect(getDownwindBearing(270)).toBe(90);
    expect(getDownwindBearing(-90)).toBe(90);
    expect(getDownwindBearing(540)).toBe(0);
  });

  it('offsets coordinates by bearing and distance', () => {
    expect(offsetLatLng({ lat: 0, lng: 0 }, 111_320, 0).lat).toBeCloseTo(1);
    expect(offsetLatLng({ lat: 0, lng: 0 }, 111_320, 90).lng).toBeCloseTo(1);
  });

  it('builds a downwind protective zone path with origin and arc points', () => {
    const path = buildHazmatProtectiveZonePath({ lat: 37, lng: 127 }, 1000, 0);

    expect(path).toHaveLength(14);
    expect(path[0]).toEqual({ lat: 37, lng: 127 });
    expect(path[1].lat).toBeLessThan(37);
  });
});
