import type { ChemicalData } from '../data/ergChemicals';

export interface CalcResult {
  label: string;
  value: string;
  unit: string;
}

export interface WaterPressureCalculation {
  floors: number;
  floorHeightM: number;
  realHeadM: number;
  frictionLossM: number;
  nozzlePressureM: number;
  safetyM: number;
  totalHeadM: number;
  totalPressureMPa: number;
  totalPressureKgfCm2: number;
}

export interface HoseDeploymentCalculation {
  distanceM: number;
  floors: number;
  verticalDistanceM: number;
  totalDistanceM: number;
  hoseCount: number;
  reserveHoseCount: number;
  totalHoseCount: number;
}

export type SpillSize = 'small' | 'large';

export interface HazmatDistances {
  isolationM: number;
  protectionM: number;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

const FLOOR_HEIGHT_M = 3;
const FRICTION_LOSS_RATIO = 0.15;
const NOZZLE_PRESSURE_M = 35;
const SAFETY_RATIO = 0.1;
const HOSE_LENGTH_M = 20;
const HOSE_RESERVE_RATIO = 0.2;
const AIR_TANK_FULL_PRESSURE_BAR = 300;
const AIR_TANK_FULL_MINUTES = 30;
const METERS_PER_DEGREE_LAT = 111_320;

export function calculateWaterPressure(floors: number): WaterPressureCalculation | null {
  if (!Number.isInteger(floors) || floors < 1 || floors > 200) return null;

  const realHeadM = floors * FLOOR_HEIGHT_M;
  const frictionLossM = realHeadM * FRICTION_LOSS_RATIO;
  const safetyM = (realHeadM + frictionLossM + NOZZLE_PRESSURE_M) * SAFETY_RATIO;
  const totalHeadM = realHeadM + frictionLossM + NOZZLE_PRESSURE_M + safetyM;

  return {
    floors,
    floorHeightM: FLOOR_HEIGHT_M,
    realHeadM,
    frictionLossM,
    nozzlePressureM: NOZZLE_PRESSURE_M,
    safetyM,
    totalHeadM,
    totalPressureMPa: totalHeadM * 0.00981,
    totalPressureKgfCm2: totalHeadM * 0.1,
  };
}

export function formatWaterPressureResults(calc: WaterPressureCalculation): CalcResult[] {
  return [
    { label: '실양정 (건물 높이)', value: calc.realHeadM.toFixed(1), unit: 'm' },
    { label: '배관 마찰손실', value: calc.frictionLossM.toFixed(1), unit: 'm' },
    { label: '방수압력 (노즐)', value: calc.nozzlePressureM.toFixed(1), unit: 'm (0.35MPa)' },
    { label: '안전율 (10%)', value: calc.safetyM.toFixed(1), unit: 'm' },
    { label: '필요 총 양정', value: calc.totalHeadM.toFixed(1), unit: 'm' },
    { label: '필요 송수압력', value: calc.totalPressureMPa.toFixed(2), unit: 'MPa' },
    { label: '필요 송수압력', value: calc.totalPressureKgfCm2.toFixed(1), unit: 'kgf/cm²' },
  ];
}

export function calculateHoseDeployment(distanceM: number, floors: number): HoseDeploymentCalculation | null {
  if (!Number.isFinite(distanceM) || !Number.isInteger(floors) || distanceM < 0 || floors < 0) return null;

  const verticalDistanceM = floors * FLOOR_HEIGHT_M;
  const totalDistanceM = distanceM + verticalDistanceM;
  const hoseCount = Math.ceil(totalDistanceM / HOSE_LENGTH_M);
  const reserveHoseCount = Math.ceil(hoseCount * HOSE_RESERVE_RATIO);

  return {
    distanceM,
    floors,
    verticalDistanceM,
    totalDistanceM,
    hoseCount,
    reserveHoseCount,
    totalHoseCount: hoseCount + reserveHoseCount,
  };
}

export function formatHoseDeploymentResults(calc: HoseDeploymentCalculation): CalcResult[] {
  return [
    { label: '수평 거리', value: calc.distanceM.toFixed(0), unit: 'm' },
    { label: '수직 거리 (층 × 3m)', value: calc.verticalDistanceM.toFixed(0), unit: 'm' },
    { label: '총 호스 전개 거리', value: calc.totalDistanceM.toFixed(0), unit: 'm' },
    { label: '필요 호스 본수 (20m/본)', value: calc.hoseCount.toString(), unit: '본' },
    { label: '예비 호스 (20%)', value: calc.reserveHoseCount.toString(), unit: '본' },
    { label: '총 필요 호스', value: calc.totalHoseCount.toString(), unit: '본' },
  ];
}

export function calculateAirTankSeconds(pressureBar: number): number | null {
  if (!Number.isFinite(pressureBar) || pressureBar <= 0 || pressureBar > AIR_TANK_FULL_PRESSURE_BAR) return null;

  const minutes = Math.floor((pressureBar / AIR_TANK_FULL_PRESSURE_BAR) * AIR_TANK_FULL_MINUTES);
  const seconds = minutes * 60;
  return seconds > 0 ? seconds : null;
}

export function formatTimerSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function getHazmatDistances(chemical: ChemicalData, spillSize: SpillSize): HazmatDistances {
  return spillSize === 'small'
    ? { isolationM: chemical.isolationSmall, protectionM: chemical.protectionSmall }
    : { isolationM: chemical.isolationLarge, protectionM: chemical.protectionLarge };
}

export function normalizeBearing(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

export function getDownwindBearing(windFromDegrees: number): number {
  return normalizeBearing(windFromDegrees + 180);
}

export function offsetLatLng(origin: LatLngPoint, distanceM: number, bearingDegrees: number): LatLngPoint {
  const angleRad = bearingDegrees * Math.PI / 180;
  const latChange = (distanceM * Math.cos(angleRad)) / METERS_PER_DEGREE_LAT;
  const lngChange = (distanceM * Math.sin(angleRad)) / (METERS_PER_DEGREE_LAT * Math.cos(origin.lat * Math.PI / 180));

  return {
    lat: origin.lat + latChange,
    lng: origin.lng + lngChange,
  };
}

export function buildHazmatProtectiveZonePath(
  origin: LatLngPoint,
  protectionDistanceM: number,
  windFromDegrees: number,
  spreadDegrees = 30,
  stepDegrees = 5,
): LatLngPoint[] {
  const downwind = getDownwindBearing(windFromDegrees);
  const path: LatLngPoint[] = [origin];

  for (let angle = downwind - spreadDegrees; angle <= downwind + spreadDegrees; angle += stepDegrees) {
    path.push(offsetLatLng(origin, protectionDistanceM, angle));
  }

  return path;
}
