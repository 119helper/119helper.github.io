import {
  fetchForestFireRisk,
  isStaleDataError,
  type ApiRecord,
  type ForestFireRiskResponse,
} from './apiClient';
import {
  GWANGJU_CURRENT_NAME,
  GWANGJU_LEGACY_NAME,
  isFormerGwangjuAddress,
} from './administrativeRegions';

export type ForestFireRiskLevel = '낮음' | '보통' | '높음' | '매우 높음';

export interface ForestFireRiskData {
  sidoName: string;
  value: number;
  min: number | null;
  avg: number | null;
  max: number | null;
  level: ForestFireRiskLevel;
  forecastTime: string;
  fetchedAt: string;
  staleAt?: number;
}

const SIDO_FULL_NAME: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  제주: '제주특별자치도',
};

const SIDO_ALIAS: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  제주특별자치도: '제주',
};

const REGION_KEYS = [
  'sido', 'sidoNm', 'sidoName', 'ctprvnNm', 'area', 'areaNm', 'region', 'regionNm',
  'loc', 'locNm', 'adminNm', 'admNm', 'sdNm', 'emdNm', 'sigun', 'sigunguNm',
  '시도', '지역', '행정구역',
];

const MAX_KEYS = [
  'max', 'maxi', 'maxValue', 'maxVal', 'maxIndex', 'riskMax', 'frfrMax', 'frfireMax',
  'forestFireMax', 'fireMax', 'mx', '최대', '최대값',
];

const AVG_KEYS = [
  'avg', 'mean', 'average', 'avgValue', 'avgVal', 'avgIndex', 'meanValue', 'riskAvg',
  'frfrAvg', 'frfireAvg', 'forestFireAvg', 'fireAvg', '지수', '평균', '평균값',
];

const MIN_KEYS = [
  'min', 'minValue', 'minVal', 'minIndex', 'riskMin', 'frfrMin', 'frfireMin',
  'forestFireMin', 'fireMin', 'mn', '최소', '최소값',
];

const TIME_KEYS = [
  'analdate', 'analDate', 'analysisDate', 'baseDate', 'baseTime', 'tm', 'time',
  'fctDate', 'forecastTime', 'createDt', 'createdAt', '예보시간', '분석일시',
];

function compact(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getByLooseKey(record: ApiRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }

  const lowerKeyMap = new Map(Object.keys(record).map(key => [compact(key), key]));
  for (const key of keys) {
    const actual = lowerKeyMap.get(compact(key));
    if (actual) return record[actual];
  }

  return undefined;
}

function resolveSidoName(cityLabel: string): { shortName: string; fullName: string } {
  const fullName = SIDO_FULL_NAME[cityLabel] || cityLabel;
  return { shortName: SIDO_ALIAS[fullName] || cityLabel, fullName };
}

function matchesRegion(item: ApiRecord, cityLabel: string): boolean {
  const { shortName, fullName } = resolveSidoName(cityLabel);
  const targetNames = [shortName, fullName].map(compact);

  const explicitRegion = text(getByLooseKey(item, REGION_KEYS));
  if (cityLabel === '광주') {
    const matchesFormerGwangju = (value: string) => {
      const candidate = value.trim().replace(/\s+/g, ' ');
      if (!candidate) return false;
      if (candidate === '광주' || candidate === GWANGJU_LEGACY_NAME) return true;
      if (candidate === GWANGJU_CURRENT_NAME) return false;
      return isFormerGwangjuAddress(candidate);
    };

    if (explicitRegion) return matchesFormerGwangju(explicitRegion);
    return Object.values(item).some(value => matchesFormerGwangju(text(value)));
  }

  if (explicitRegion && targetNames.some(target => compact(explicitRegion).includes(target))) {
    return true;
  }

  return Object.values(item).some(value => {
    const candidate = compact(text(value));
    if (!candidate) return false;
    return targetNames.some(target => candidate === target || candidate.includes(target));
  });
}

export function classifyForestFireRisk(value: number): ForestFireRiskLevel {
  if (value >= 86) return '매우 높음';
  if (value >= 66) return '높음';
  if (value >= 51) return '보통';
  return '낮음';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function normalizeForestFireRisk(
  response: ForestFireRiskResponse,
  cityLabel: string,
  staleAt?: number,
): ForestFireRiskData | null {
  const items = response.items.filter(row => matchesRegion(row, cityLabel));
  if (items.length === 0) return null;

  const maxValues = items.map(item => numeric(getByLooseKey(item, MAX_KEYS))).filter((value): value is number => value !== null);
  const avgValues = items.map(item => numeric(getByLooseKey(item, AVG_KEYS))).filter((value): value is number => value !== null);
  const minValues = items.map(item => numeric(getByLooseKey(item, MIN_KEYS))).filter((value): value is number => value !== null);

  const max = maxValues.length > 0 ? Math.max(...maxValues) : null;
  const avg = average(avgValues);
  const min = minValues.length > 0 ? Math.min(...minValues) : null;
  const value = max ?? avg ?? min;
  if (value === null) return null;

  const { fullName } = resolveSidoName(cityLabel);
  const forecastTime = text(getByLooseKey(items[0], TIME_KEYS));

  return {
    sidoName: fullName,
    value,
    min,
    avg,
    max,
    level: classifyForestFireRisk(value),
    forecastTime,
    fetchedAt: response.fetchedAt || new Date().toISOString(),
    staleAt,
  };
}

export async function getForestFireRisk(cityLabel: string, forceRefresh = false): Promise<ForestFireRiskData | null> {
  try {
    const response = await fetchForestFireRisk(forceRefresh);
    return normalizeForestFireRisk(response, cityLabel);
  } catch (error) {
    if (isStaleDataError(error)) {
      return normalizeForestFireRisk(error.cachedData as ForestFireRiskResponse, cityLabel, error.cachedAt);
    }
    console.warn('[forestFireRisk] official risk fetch failed:', error);
    return null;
  }
}
